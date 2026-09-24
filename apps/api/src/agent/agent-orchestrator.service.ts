import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { AgentDecision, Claim, HandoffSummary, Intent, PolicyDecision, ToolResult } from '@ispagent/shared';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { currentTenantId } from '../common/tenant-context';
import { ConversationService } from '../conversation/conversation.service';
import { ToolExecutorService } from '../tools/tool-executor.service';
import { PolicyEngineService } from '../policy/policy-engine.service';
import { ErpToolsService } from '../tools/erp-tools.service';
import { createKnowledgeSearchTool } from '../knowledge/knowledge-tool';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { AiProviderResolverService } from '../integrations/ai/ai-provider-resolver.service';
import { PULSEISP_ADAPTER, PulseISPAdapter } from '../integrations/pulseisp/pulseisp-adapter.interface';
import { createPulseISPQueryTool } from '../tools/pulseisp-tool';
import { isPulseId } from '../integrations/pulseisp/pulseisp-ids';
import { PulseIspClient } from '../integrations/pulseisp/pulseisp-client.service';
import { PulseIspMirrorService } from '../integrations/pulseisp/pulseisp-mirror.service';
import { HandoffService } from '../handoff/handoff.service';
import { ClaimValidatorService, ClaimInvariantViolationError } from './claim-validator.service';
import { IdentityResolution, IdentityResolutionService, normalizeDocument } from '../identity/identity-resolution.service';
import { MockAIProvider } from '../integrations/ai/mock-ai.provider';
import { ComposeReplyInput } from '../integrations/ai/ai-provider.interface';
import { checkReplyAgainstFacts } from './reply-guard';

const PROMPT_VERSION = 'agent-v1-2026-09-14';

const ACCOUNT_INTENTS: Intent[] = [
  'FINANCEIRO', 'SEGUNDA_VIA', 'PAGAMENTO', 'BLOQUEIO', 'PLANO', 'CHAMADO', 'STATUS_CHAMADO',
];

const NETWORK_INTENTS: Intent[] = ['SEM_CONEXAO', 'INTERNET_LENTA', 'QUEDAS', 'SUPORTE_INTERNET'];

function pulseIspEnabled(): boolean {
  return process.env.ISPAGENT_PULSEISP_ENABLED === 'true';
}

/**
 * P1 "comportamento correto quando o AI Provider falha": usada quando `classifyIntent`/`composeReply`
 * lançam (chave inválida, rede fora, rate limit, etc.). Texto fixo, nunca gerado pelo próprio provider
 * que acabou de falhar — não inventa fato nem intenção, só avisa e encaminha (princípio 1.2/1.4).
 */
const AI_PROVIDER_FAILURE_MESSAGE =
  'Estou com uma instabilidade técnica agora e não posso continuar sozinho com segurança. Já encaminhei ' +
  'sua conversa para um atendente humano — ele vai te responder em breve.';

/**
 * Resposta para o que não é assunto do atendimento (saudação, conversa solta, pedido fora de escopo) e
 * não achou nada na base de conhecimento. Texto fixo: não afirma nenhum fato, não custa uma chamada de IA
 * e é igual em qualquer provider. Antes isso caía em "não encontrei esse registro no sistema" (frase de
 * cliente-não-encontrado) e abria um handoff a cada "olá".
 */
const OUT_OF_SCOPE_GUIDANCE_MESSAGE =
  'Olá! Sou o assistente de atendimento do seu provedor de internet. Consigo ajudar com: internet lenta, ' +
  'caindo ou sem conexão; fatura e segunda via; o seu plano; e abrir ou acompanhar um chamado. ' +
  'Me conta o que você precisa?';

/**
 * Tentativas de documento erradas/inexistentes por conversa antes de bloquear a identificação por chat
 * (o limite vem de `handoffAfterFailures` da policy do tenant) e janela em que elas contam.
 */
const IDENTITY_FAILURE_ACTION = 'identity.failed_attempt';
const IDENTITY_LOCK_WINDOW_MS = 30 * 60_000;

const IDENTITY_LOCKED_MESSAGE =
  'Não consegui confirmar a sua identidade por aqui com segurança. Já encaminhei a sua conversa para um ' +
  'atendente humano — ele vai te responder em breve.';

const CONTRACT_UNRESOLVED_MESSAGE =
  'Te identifiquei, mas preciso que um atendente confirme qual dos seus contratos você quer consultar. ' +
  'Já encaminhei a sua conversa — ele te responde por aqui.';

const AFFIRMATIVE = /^\s*(sim|s|pode|pode sim|pode abrir|quero sim|claro|ok|okay|beleza|blz|por favor|abre|abra|isso|isso mesmo|manda|bora)\s*[!.]*\s*$/iu;
const NEGATIVE = /^\s*(n[ãa]o|nao|n|agora n[ãa]o|obrigad[oa]|valeu|deixa|tudo bem)(?!\p{L})/iu;
const FOLLOW_UP_WINDOW_MS = 3 * 60_000; // 3 minutos para perguntas imediatas de diagnóstico

const HANDOFF_TRIGGER = /(?:atendente|humano|falar com (?:uma )?pessoa|falar com alguém|falar com alguem|falar com gente|suporte humano|muito burro|burro|você não ajuda|voce nao ajuda|não ajuda|nao ajuda|chama alguém|chama alguem|chamar atendente|passa pra alguém|passa pra alguem|atendimento humano|operador|falar com um atendente|quero um atendente)/i;
const SCOPE_TRIGGER = /(?:o que voc[eê] pode fazer|o que voc[eê] faz|o que faz|quais (?:s[aã]o )?(?:as )?op[cç][oõ]es|menu|ajuda|listar|o que voc[eê] resolve|o que pode fazer por mim|quais os servi[cç]os)/i;
const PENDING_BILLING_TRIGGER = /(?:outras solicita[cç][oõ]es|outra solicita[cç][aã]o|minhas solicita[cç][oõ]es|e o pix|e o pdf|e a fatura|e o boleto|cade o pix|cadê o pix|qrcod|qr code|qrcode|sem ser o link|pdf do boleto|eu pedi o pix|pedi o pix)/i;
const CLARIFICATION_TRIGGER = /^(?:como assim|que sinal|por que|pq|que oscila[cç][aã]o|explica|n[aã]o entendi|como assim\??|que\??)\b/i;

function isTicketConfirmation(msg: string): boolean {
  const normalized = msg.trim().toLowerCase();
  // Se contiver menção a documento, boleto, pdf, pix, fatura, plano, cancelamento, etc., NUNCA é confirmação de chamado!
  if (/(?:pdf|boleto|pix|fatura|via|conta|plano|velocidade|sinal|roteador|wifi)/i.test(normalized)) {
    return false;
  }
  return AFFIRMATIVE.test(normalized) || /(?:pode abrir|abrir chamado|abre o chamado|quero o chamado|sim pode abrir)/i.test(normalized);
}

const DECLINED_MESSAGE =
  'Tudo bem! Se o problema continuar ou você quiser que eu abra um chamado depois, é só me chamar por aqui.';

// Cliente real do PulseISP: o ISPAgent não tem o sistema de chamados/financeiro do provedor, então
// essas intenções vão para um atendente — com uma mensagem clara, não a genérica de "não encontrei".
const PULSE_HANDOFF_MESSAGE: Partial<Record<Intent, string>> = {
  CHAMADO:
    'Combinado! Passei o seu caso para a equipe técnica com o diagnóstico da sua conexão — um atendente vai abrir o chamado e combinar a visita com você por aqui.',
  STATUS_CHAMADO: 'Vou te passar para um atendente consultar o andamento do seu chamado — ele te responde por aqui.',
  FINANCEIRO: 'Para fatura e pagamentos vou te passar para um atendente do financeiro — ele te responde por aqui.',
  SEGUNDA_VIA: 'Para a segunda via vou te passar para um atendente do financeiro — ele te responde por aqui.',
  PAGAMENTO: 'Vou te passar para um atendente do financeiro confirmar o seu pagamento — ele te responde por aqui.',
  BLOQUEIO: 'Vou te passar para um atendente verificar o bloqueio — ele te responde por aqui.',
};

/**
 * Agent Orchestrator (seção 3.3, 5.2, 6.4). Um turno completo:
 * mensagem → identidade → intenção → ferramenta permitida pela policy → ToolResult → Claims (com
 * invariante de evidência) → resposta → auditoria. O LLM (quando real) só fraseia a resposta a partir
 * de fatos já validados — nunca decide sozinho o que é fato nem toca ferramenta diretamente
 * (princípio 1.2).
 */
@Injectable()
export class AgentOrchestratorService {
  private readonly claimValidator = new ClaimValidatorService();
  private readonly pulseIspTool;
  private readonly pulseIspLiveTool;
  private readonly logger = new Logger(AgentOrchestratorService.name);
  private readonly identity: IdentityResolutionService;
  /** Resposta por regras usada quando o reply-guard descarta o texto do LLM (nunca inventa fato). */
  private readonly deterministicAi = new MockAIProvider();

  constructor(
    private readonly db: TenantPrismaService,
    private readonly conversation: ConversationService,
    private readonly executor: ToolExecutorService,
    private readonly policy: PolicyEngineService,
    private readonly erpTools: ErpToolsService,
    private readonly knowledgeService: KnowledgeService,
    private readonly aiResolver: AiProviderResolverService,
    @Inject(PULSEISP_ADAPTER) pulseisp: PulseISPAdapter,
    private readonly handoff: HandoffService,
    @Optional() private readonly pulseClient?: PulseIspClient,
    @Optional() private readonly mirror?: PulseIspMirrorService,
    @Optional() identity?: IdentityResolutionService,
  ) {
    this.identity = identity ?? new IdentityResolutionService(db);
    this.pulseIspTool = createPulseISPQueryTool(pulseisp);
    // Contratos `pulse_*` são clientes REAIS do PulseISP (simulador do painel): mesma ferramenta, mas
    // rotulada como LIVE/RealPulseISPAdapter no ToolCall — nunca aparece como DEMO um dado real.
    this.pulseIspLiveTool = createPulseISPQueryTool(pulseisp, { mode: 'LIVE', adapterName: 'RealPulseISPAdapter' });
  }

  /**
   * `null` = a IA não respondeu porque um humano já assumiu esta conversa (seção 5.4: "quando o humano
   * assume, a IA para de responder"). A mensagem do cliente ainda é registrada, só não gera AgentRun.
   */
  async handleMessage(conversationId: string, customerMessage: string): Promise<AgentDecision | null> {
    const tenantId = currentTenantId();
    if (!tenantId) throw new Error('[agent-orchestrator] requer contexto de tenant ativo.');

    const conversationRecord = await this.db.client.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });

    await this.conversation.appendMessage(conversationId, 'CUSTOMER', customerMessage);

    if (conversationRecord.status === 'HUMAN_ACTIVE') {
      return null;
    }

    let identityResult = await this.conversation.resolveIdentity(conversationId);
    let customerName: string | null = null;
    let justIdentified = false;
    let attemptedTerm: string | null = null;
    let identityLocked = false;

    const hasCustomer = 'customerId' in identityResult && Boolean(identityResult.customerId);

    if (!hasCustomer) {
      // Só documento completo (CPF/CNPJ), exato e único identifica alguém pelo chat — nunca nome, código,
      // telefone digitado ou trecho de texto (isso era uma porta aberta para ver a conta de outra pessoa).
      const dynamic = await this.identifyByDocument(tenantId, conversationId, customerMessage, identityResult);
      if (dynamic.kind === 'identified') {
        await this.db.client.conversation.update({
          where: { id: conversationId },
          data: {
            customerId: dynamic.resolution.customerId,
            contractId: dynamic.resolution.contractId,
            identityMethod: dynamic.resolution.method,
            identityConfidence: dynamic.resolution.confidence,
          },
        });
        identityResult = dynamic.resolution;
        customerName = dynamic.customerName;
        justIdentified = true;
      } else if (dynamic.kind === 'not_found') {
        attemptedTerm = dynamic.term;
      } else if (dynamic.kind === 'locked') {
        identityLocked = true;
      }
    } else if ('customerId' in identityResult && identityResult.customerId) {
      const cust = await this.db.client.customer.findUnique({
        where: { id: identityResult.customerId },
        select: { name: true },
      });
      customerName = cust?.name ?? null;
    }

    // Resolvido POR TURNO a partir da config do tenant no banco (tela "IA" do painel), não uma
    // escolha fixa no boot do processo — é assim que trocar de provider/colar chave nova pela UI vale
    // imediatamente, sem reiniciar o container.
    const ai = await this.aiResolver.resolve(tenantId);

    // P1 "comportamento correto quando o AI Provider falha": se a classificação falhar, NÃO inventamos
    // uma intenção plausível — usamos 'OUTRO'/'LOW' só como valor de schema, marcamos `aiFailed` e, mais
    // abaixo, pulamos qualquer seleção de ferramenta baseada nessa intenção não confiável.
    let classification: { intent: Intent; confidence: 'HIGH' | 'MEDIUM' | 'LOW' };
    let detectedIntents: Intent[] = [];
    let aiFailed = false;
    try {
      if (typeof ai.classifyIntents === 'function') {
        const multi = await ai.classifyIntents(customerMessage);
        classification = { intent: multi.primary, confidence: multi.confidence };
        detectedIntents = multi.intents;
      } else {
        classification = await ai.classifyIntent(customerMessage);
        detectedIntents = [classification.intent];
      }
    } catch (err) {
      this.logger.error(
        `classifyIntent (${ai.name}) falhou — escalando para humano sem adivinhar intenção: ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
      classification = { intent: 'OUTRO', confidence: 'LOW' };
      detectedIntents = ['OUTRO'];
      aiFailed = true;
    }

    // 1. Pedido de atendimento humano ou cliente irritado: encaminhar de imediato para a fila humana
    if (HANDOFF_TRIGGER.test(customerMessage)) {
      const firstName = customerName ? customerName.trim().split(/\s+/)[0] : '';
      const greeting = firstName ? `${firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase()}, ` : '';
      const replyText = `${greeting}compreendo perfeitamente e peço desculpas. Estou transferindo o seu atendimento para um de nossos operadores humanos agora mesmo. Por favor, aguarde um instante que um atendente irá te responder por aqui.`;

      const agentRun = await this.db.client.agentRun.create({
        data: {
          tenantId,
          conversationId,
          intent: 'OUTRO',
          intentConfidence: 'HIGH',
          promptVersion: PROMPT_VERSION,
          model: ai.model,
          mode: ai.mode,
          outcome: 'HANDOFF',
        },
      });

      const identifiedContractId =
        identityResult.method === 'PHONE_EXACT' || identityResult.method === 'DOCUMENT'
          ? identityResult.contractId
          : null;
      const identifiedCustomerId =
        identityResult.method === 'PHONE_EXACT' || identityResult.method === 'DOCUMENT'
          ? identityResult.customerId
          : null;

      await this.handoff.createHandoff(conversationId, 'Cliente solicitou atendimento humano', {
        intent: 'OUTRO',
        reason: 'Cliente solicitou atendimento humano ou expressou insatisfação.',
        reportedProblem: customerMessage,
        customerId: identifiedCustomerId,
        contractId: identifiedContractId,
        toolsConsulted: [],
        actionsTaken: [],
        actionsFailed: [],
        suggestedNextAction: 'Atendimento manual por operador.',
      });

      await this.conversation.appendMessage(conversationId, 'AGENT', replyText);

      return {
        agentRunId: agentRun.id,
        tenantId,
        conversationId,
        intent: 'OUTRO',
        intentConfidence: 'HIGH',
        identity: null,
        toolCalls: [],
        policyDecisions: [],
        claims: [],
        outcome: 'HANDOFF',
        promptVersion: PROMPT_VERSION,
        model: ai.model,
        mode: ai.mode,
      };
    }

    // 2. Dúvida de escopo / o que o robô faz / ajuda — só quando a mensagem não traz um pedido concreto
    // ("preciso de ajuda com a fatura" deve ir para a fatura, não para o menu).
    if (!aiFailed && classification.intent === 'OUTRO' && SCOPE_TRIGGER.test(customerMessage)) {
      const firstName = customerName ? customerName.trim().split(/\s+/)[0] : '';
      const greeting = firstName ? `${firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase()}, ` : '';
      const replyText = `${greeting}como assistente virtual da ${await this.companyName(tenantId)}, posso te ajudar com:\n\n• 📄 **2ª Via de Fatura e Boletos** (com PDF para download)\n• 📱 **Código PIX e QR Code** para pagamento rápido\n• 🌐 **Diagnóstico de Conexão e Teste de Sinal da Fibra**\n• 📦 **Consulta do seu Plano Contratado**\n• 👤 **Transferência para Atendente Humano**\n\nComo posso te ajudar agora?`;

      const agentRun = await this.db.client.agentRun.create({
        data: {
          tenantId,
          conversationId,
          intent: 'OUTRO',
          intentConfidence: 'HIGH',
          promptVersion: PROMPT_VERSION,
          model: ai.model,
          mode: ai.mode,
          outcome: 'ANSWERED',
        },
      });

      await this.conversation.appendMessage(conversationId, 'AGENT', replyText);

      return {
        agentRunId: agentRun.id,
        tenantId,
        conversationId,
        intent: 'OUTRO',
        intentConfidence: 'HIGH',
        identity: null,
        toolCalls: [],
        policyDecisions: [],
        claims: [],
        outcome: 'ANSWERED',
        promptVersion: PROMPT_VERSION,
        model: ai.model,
        mode: ai.mode,
      };
    }

    // 3. Solicitação pendente de cobrança / "e minhas outras solicitações?" / "pedi o pix" / "pdf sem ser link"
    if (PENDING_BILLING_TRIGGER.test(customerMessage)) {
      classification = { intent: 'SEGUNDA_VIA', confidence: 'HIGH' };
    }

    // Se o cliente acabou de se identificar dinamicamente (ex.: enviou o CPF/código agora),
    // recuperar a intenção que estava pendente da conversa se a fala atual foi classificada como OUTRO/SUPORTE.
    if (justIdentified && (classification.intent === 'OUTRO' || classification.intent === 'SUPORTE_INTERNET')) {
      const lastMeaningfulRun = await this.db.client.agentRun.findFirst({
        where: {
          conversationId,
          intent: { in: [...NETWORK_INTENTS, ...ACCOUNT_INTENTS] },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (lastMeaningfulRun) {
        classification = { intent: lastMeaningfulRun.intent as Intent, confidence: 'HIGH' };
      }
    }

    // Continuação: "que sinal?", "sim", "não" logo depois de um diagnóstico de rede.
    let followUp = false;
    let declined = false;
    const tenantPolicy = await this.db.client.tenantPolicyConfig.findUnique({ where: { tenantId } });
    const canCreateTicket = !tenantPolicy?.readOnlyMode && Boolean(tenantPolicy?.canCreateTicket);

    if (!aiFailed && classification.intent === 'OUTRO') {
      const since = new Date(Date.now() - FOLLOW_UP_WINDOW_MS);
      const recentAgentReplies = await this.db.client.message.findMany({
        where: { conversationId, role: 'AGENT', createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 3,
      });
      const offeredTicket = canCreateTicket && recentAgentReplies.some((m) => /chamado/i.test(m.content) && m.content.includes('?'));
      const lastNetworkRun = await this.db.client.agentRun.findFirst({
        where: { conversationId, createdAt: { gte: since }, intent: { in: NETWORK_INTENTS } },
        orderBy: { createdAt: 'desc' },
      });

      if (offeredTicket && isTicketConfirmation(customerMessage)) {
        classification = { intent: 'CHAMADO', confidence: 'MEDIUM' };
      } else if (offeredTicket && NEGATIVE.test(customerMessage)) {
        declined = true;
      } else if (lastNetworkRun && CLARIFICATION_TRIGGER.test(customerMessage)) {
        classification = { intent: lastNetworkRun.intent as Intent, confidence: 'MEDIUM' };
        followUp = true;
      }
    }

    const agentRun = await this.db.client.agentRun.create({
      data: {
        tenantId,
        conversationId,
        intent: classification.intent,
        intentConfidence: classification.confidence,
        promptVersion: PROMPT_VERSION,
        model: ai.model,
        mode: ai.mode,
      },
    });

    const identifiedContractId =
      identityResult.method === 'PHONE_EXACT' || identityResult.method === 'DOCUMENT'
        ? identityResult.contractId
        : null;
    const identifiedCustomerId =
      identityResult.method === 'PHONE_EXACT' || identityResult.method === 'DOCUMENT'
        ? identityResult.customerId
        : null;

    const policyDecisions: PolicyDecision[] = [];
    const toolResults: ToolResult[] = [];

    const accountAvailable = Boolean(identifiedContractId && identifiedCustomerId);
    const realPulseContract = isPulseId(identifiedContractId);
    // Óptico do ERP: nunca para contrato do PulseISP (o ERP não conhece esse id) e nunca dado DEMO
    // misturado num atendimento real.
    const erpOpticalApplies = !realPulseContract && (this.erpTools.erp.mode === 'LIVE' || !pulseIspEnabled());

    // 4. Fluxo de Retenção de Cancelamento
    if (classification.intent === 'CANCELAMENTO') {
      const company = await this.companyName(tenantId, tenantPolicy?.companyName);
      const firstName = customerName ? customerName.trim().split(/\s+/)[0] : '';
      const greeting = firstName ? `${firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase()}, ` : '';

      // Verifica se o cliente já mencionou motivo financeiro/preço
      // Se ainda não especificou motivo
      const priceReason = /(?:caro|preço|preco|valor|aumentou|concorr[eê]ncia|desconto)/i.test(customerMessage);
      const hasAnyReason =
        priceReason || /(?:mudan[çc]a|mudei|endere[çc]o|ruim|lenta|inst[aá]vel|n[aã]o uso|viagem|vender)/i.test(customerMessage);
      if (!hasAnyReason) {
        const replyText = `${greeting}lamento muito pela sua intenção de cancelamento. Para que eu possa te orientar da melhor forma, você poderia me informar o motivo principal? (Por exemplo: valor da fatura, mudança de endereço ou instabilidade no sinal?)`;
        await this.conversation.appendMessage(conversationId, 'AGENT', replyText);

        await this.db.client.agentRun.update({
          where: { id: agentRun.id },
          data: { outcome: 'ANSWERED' },
        });

        return {
          agentRunId: agentRun.id,
          tenantId,
          conversationId,
          intent: 'CANCELAMENTO',
          intentConfidence: 'HIGH',
          identity: null,
          toolCalls: [],
          policyDecisions: [],
          claims: [],
          outcome: 'ANSWERED',
          promptVersion: PROMPT_VERSION,
          model: ai.model,
          mode: ai.mode,
        };
      }

      // Motivo informado e não é negociável -> registrar e transferir para retenção humana
      await this.db.client.cancellationRequest.create({
        data: {
          tenantId,
          conversationId,
          customerId: identifiedCustomerId,
          contractId: identifiedContractId,
          reason: customerMessage,
          // Motivo de preço: a retenção humana avalia uma condição especial (a IA não promete desconto).
          discountOffered: priceReason,
          status: 'TRANSFERRED',
        },
      });

      await this.handoff.createHandoff(conversationId, 'Cancelamento de assinatura solicitado', {
        intent: 'CANCELAMENTO',
        reason: 'Cliente solicitou cancelamento da assinatura.',
        reportedProblem: customerMessage,
        customerId: identifiedCustomerId,
        contractId: identifiedContractId,
        toolsConsulted: [],
        actionsTaken: [],
        actionsFailed: [],
        suggestedNextAction: 'Equipe de retenção humana para conclusão do cancelamento.',
      });

      const replyText = priceReason
        ? `${greeting}compreendo perfeitamente o seu ponto — você é muito importante para a ${company}. Registrei o seu pedido e estou passando agora para a nossa equipe de retenção, que pode avaliar uma condição especial para você. Por favor, aguarde um instante.`
        : `${greeting}compreendo perfeitamente. Registrei os detalhes do seu pedido e estou transferindo agora para a nossa equipe especializada de retenção humana para te auxiliar no processo. Por favor, aguarde um instante.`;
      await this.conversation.appendMessage(conversationId, 'AGENT', replyText);

      await this.db.client.agentRun.update({
        where: { id: agentRun.id },
        data: { outcome: 'HANDOFF' },
      });

      return {
        agentRunId: agentRun.id,
        tenantId,
        conversationId,
        intent: 'CANCELAMENTO',
        intentConfidence: 'HIGH',
        identity: null,
        toolCalls: [],
        policyDecisions: [],
        claims: [],
        outcome: 'HANDOFF',
        promptVersion: PROMPT_VERSION,
        model: ai.model,
        mode: ai.mode,
      };
    }

    // 5. Fluxo Comercial de Contratação & Upgrade (Captura de Lead)
    if (classification.intent === 'CONTRATACAO' || classification.intent === 'UPGRADE') {
      const company = await this.companyName(tenantId, tenantPolicy?.companyName);
      const firstName = customerName ? customerName.trim().split(/\s+/)[0] : '';
      const greeting = firstName ? `${firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase()}, ` : '';
      const channelPhone = /^\+?\d{10,13}$/.test(conversationRecord.channelUserId) ? conversationRecord.channelUserId : null;

      await this.db.client.commercialLead.create({
        data: {
          tenantId,
          name: customerName || 'Interessado via Chat',
          phone: channelPhone ?? 'Não informado (Web Chat)',
          desiredPlan: classification.intent === 'UPGRADE' ? 'Upgrade de Velocidade' : 'Novo Plano Fibra Óptica',
          originChannel: 'WEBCHAT',
          status: 'NEW',
          notes: customerMessage,
        },
      });

      const replyText = `${greeting}ótima escolha! Já registrei o seu interesse com a nossa equipe comercial da ${company}. Um consultor vai entrar em contato com você pelo telefone/WhatsApp em breve com as melhores promoções disponíveis na sua região para finalizar o seu pedido! Se precisar de mais alguma informação sobre planos ou faturas, estou à disposição.`;
      await this.conversation.appendMessage(conversationId, 'AGENT', replyText);

      await this.db.client.agentRun.update({
        where: { id: agentRun.id },
        data: { outcome: 'ACTION_EXECUTED' },
      });

      return {
        agentRunId: agentRun.id,
        tenantId,
        conversationId,
        intent: classification.intent,
        intentConfidence: 'HIGH',
        identity: null,
        toolCalls: [],
        policyDecisions: [],
        claims: [],
        outcome: 'ACTION_EXECUTED',
        promptVersion: PROMPT_VERSION,
        model: ai.model,
        mode: ai.mode,
      };
    }

    const hasNetwork = detectedIntents.some((it) => NETWORK_INTENTS.includes(it));
    const hasAccount = detectedIntents.some((it) => ACCOUNT_INTENTS.includes(it));
    const needsAccountOrNetwork =
      ACCOUNT_INTENTS.includes(classification.intent) ||
      NETWORK_INTENTS.includes(classification.intent) ||
      hasNetwork ||
      hasAccount;

    const recentAgentReplies = await this.db.client.message.findMany({
      where: { conversationId, role: 'AGENT' },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });
    const askedCpfPreviously = recentAgentReplies.some((m) => /cpf|cnpj/i.test(m.content));

    // Cliente precisa ser identificado (pedir CPF) se o assunto requer conta/conexão, OU se o bot já pediu CPF
    // e o cliente ainda não o forneceu (ou digitou algo não encontrado).
    // Cliente conhecido mas sem UM contrato ativo inequívoco: perguntar CPF de novo não resolve (loop) —
    // um atendente confirma o contrato.
    const contractUnresolved = !accountAvailable && identifiedCustomerId !== null && needsAccountOrNetwork;
    const needsCpf =
      !identityLocked &&
      !contractUnresolved &&
      !accountAvailable &&
      (needsAccountOrNetwork || askedCpfPreviously || Boolean(attemptedTerm));

    // Se a classificação falhou, não escolhemos ferramenta nenhuma a partir dela — `toolResults`/
    // `policyDecisions` ficam vazios e o turno vai direto pro caminho de HANDOFF abaixo.
    if (declined || identityLocked || contractUnresolved) {
      // nada a consultar — só encerra a oferta / a identidade não está confirmada (vira handoff abaixo)
    } else if (needsCpf) {
      // Cliente ainda não identificado: não faz busca de KB inútil nem gera handoff.
      // O bot vai solicitar ou reiterar a necessidade do CPF para poder dar prosseguimento.
    } else if (!aiFailed && accountAvailable && hasNetwork && hasAccount) {
      // Cenário Multi-Intent: executa diagnóstico de rede, sinal óptico e consulta de fatura/conta
      const pulseTool = realPulseContract ? this.pulseIspLiveTool : this.pulseIspTool;
      const decisionPulse = await this.policy.evaluate(pulseTool.action);
      policyDecisions.push(decisionPulse);
      toolResults.push(
        await this.executor.run(pulseTool, { contractId: identifiedContractId as string }, { agentRunId: agentRun.id }),
      );

      // Leitura da potência óptica da fibra (dBm / PON) pelo ERP — só para contrato do próprio ERP
      // (`erpOpticalApplies`): cliente real do PulseISP já traz o óptico do PulseISP.
      const opticalDecision = await this.policy.evaluate(this.erpTools.opticalSignalTool.action);
      policyDecisions.push(opticalDecision);
      if (opticalDecision.allowed && erpOpticalApplies) {
        toolResults.push(
          await this.executor.run(this.erpTools.opticalSignalTool, { contractId: identifiedContractId as string }, { agentRunId: agentRun.id }),
        );
      }

      // Desbloqueio em confiança se solicitado
      const isUnlockRequest = /(?:desbloque|libera|libera[cç][aã]o|confian[cç]a|j[aá] paguei|promessa|comprovante)/i.test(customerMessage);
      if (isUnlockRequest) {
        const unlockDecision = await this.policy.evaluate(this.erpTools.promiseToPayTool.action);
        policyDecisions.push(unlockDecision);
        if (unlockDecision.allowed) {
          toolResults.push(
            await this.executor.run(this.erpTools.promiseToPayTool, { contractId: identifiedContractId as string }, { agentRunId: agentRun.id }),
          );
        }
      }

      const accountIntent = detectedIntents.find((it) => ACCOUNT_INTENTS.includes(it)) || 'SEGUNDA_VIA';
      const dispatch = this.selectAccountTool(accountIntent);
      const decisionAccount = await this.policy.evaluate(dispatch.action);
      policyDecisions.push(decisionAccount);
      if (!(realPulseContract && dispatch.kind !== 'plan')) {
        const toolResult = await this.executeAccountTool(
          dispatch.kind,
          agentRun.id,
          identifiedContractId as string,
          identifiedCustomerId as string,
          customerMessage,
        );
        toolResults.push(toolResult);
      }
    } else if (!aiFailed && accountAvailable && ACCOUNT_INTENTS.includes(classification.intent)) {
      const isUnlockRequest = /(?:desbloque|libera|libera[cç][aã]o|confian[cç]a|j[aá] paguei|promessa|comprovante)/i.test(customerMessage);
      if (isUnlockRequest || classification.intent === 'BLOQUEIO') {
        const unlockDecision = await this.policy.evaluate(this.erpTools.promiseToPayTool.action);
        policyDecisions.push(unlockDecision);
        if (unlockDecision.allowed) {
          toolResults.push(
            await this.executor.run(this.erpTools.promiseToPayTool, { contractId: identifiedContractId as string }, { agentRunId: agentRun.id }),
          );
        }
      }

      const dispatch = this.selectAccountTool(classification.intent);
      const decision = await this.policy.evaluate(dispatch.action);
      policyDecisions.push(decision);

      // Cliente real do PulseISP (simulador): o espelho só tem nome/plano/status — NÃO tem faturas nem
      // chamados. Rodar BillingTool/SupportTool aqui devolveria "sem pendências" inventado por ausência
      // de dado; sem ferramenta, o turno vira HANDOFF honesto (o PulseISP não fornece esse dado).
      if (!(realPulseContract && dispatch.kind !== 'plan')) {
        const toolResult = await this.executeAccountTool(
          dispatch.kind,
          agentRun.id,
          identifiedContractId as string,
          identifiedCustomerId as string,
          customerMessage,
        );
        toolResults.push(toolResult);
      }
    } else if (!aiFailed && accountAvailable && NETWORK_INTENTS.includes(classification.intent)) {
      if (pulseIspEnabled() || realPulseContract) {
        const pulseTool = realPulseContract ? this.pulseIspLiveTool : this.pulseIspTool;
        const decision = await this.policy.evaluate(pulseTool.action);
        policyDecisions.push(decision);
        toolResults.push(
          await this.executor.run(pulseTool, { contractId: identifiedContractId as string }, { agentRunId: agentRun.id }),
        );
      }

      // Leitura da potência óptica da fibra (dBm / PON) pelo ERP — só para contrato do próprio ERP
      // (`erpOpticalApplies`): cliente real do PulseISP já traz o óptico do PulseISP.
      const opticalDecision = await this.policy.evaluate(this.erpTools.opticalSignalTool.action);
      policyDecisions.push(opticalDecision);
      if (opticalDecision.allowed && erpOpticalApplies) {
        toolResults.push(
          await this.executor.run(this.erpTools.opticalSignalTool, { contractId: identifiedContractId as string }, { agentRunId: agentRun.id }),
        );
      }

      // Se não houver PulseISP ou faltar contexto, agrega busca na base de conhecimento
      if (!pulseIspEnabled() && !realPulseContract) {
        const kbTool = createKnowledgeSearchTool(this.knowledgeService);
        const decisionKb = await this.policy.evaluate(kbTool.action);
        policyDecisions.push(decisionKb);
        toolResults.push(await this.executor.run(kbTool, { query: customerMessage }, { agentRunId: agentRun.id }));
      }
    } else if (!aiFailed && !declined) {
      const kbTool = createKnowledgeSearchTool(this.knowledgeService);
      const decision = await this.policy.evaluate(kbTool.action);
      policyDecisions.push(decision);
      toolResults.push(await this.executor.run(kbTool, { query: customerMessage }, { agentRunId: agentRun.id }));
    }

    const claims = this.buildClaims(toolResults);

    let outcome: AgentDecision['outcome'];
    if (declined) {
      outcome = 'ANSWERED';
    } else if (identityLocked || contractUnresolved) {
      outcome = 'HANDOFF';
    } else if (needsCpf) {
      outcome = 'ANSWERED';
    } else if (aiFailed) {
      outcome = 'HANDOFF';
    } else {
      try {
        this.claimValidator.assertValid(claims, toolResults);
        outcome = this.decideOutcome(toolResults, identityResult.method, accountAvailable, classification.intent);
      } catch (err) {
        if (err instanceof ClaimInvariantViolationError) {
          outcome = 'HANDOFF';
        } else {
          throw err;
        }
      }
    }

    if (outcome === 'HANDOFF') {
      const summary = identityLocked
        ? {
            reason: 'Identidade do cliente não confirmada: várias tentativas de documento sem correspondência.',
            customerId: null,
            contractId: null,
            intent: classification.intent,
            reportedProblem: customerMessage,
            toolsConsulted: [],
            actionsTaken: [],
            actionsFailed: [],
            suggestedNextAction: 'Confirmar a identidade do cliente por outro meio antes de qualquer consulta de conta.',
          }
        : contractUnresolved
          ? {
              reason: 'Cliente identificado, mas sem um único contrato ativo — o contrato precisa ser confirmado por um atendente.',
              customerId: identifiedCustomerId,
              contractId: null,
              intent: classification.intent,
              reportedProblem: customerMessage,
              toolsConsulted: [],
              actionsTaken: [],
              actionsFailed: [],
              suggestedNextAction: 'Perguntar ao cliente qual contrato ele quer consultar e seguir o atendimento.',
            }
        : aiFailed
        ? {
            reason: `IA indisponível para classificar a mensagem (${ai.name}) — encaminhado sem tentar adivinhar a intenção.`,
            customerId: identifiedCustomerId,
            contractId: identifiedContractId,
            intent: classification.intent,
            reportedProblem: customerMessage,
            toolsConsulted: [],
            actionsTaken: [],
            actionsFailed: [],
            suggestedNextAction: 'Ler a mensagem original do cliente (a IA não conseguiu processá-la) e responder manualmente.',
          }
        : this.buildHandoffSummary(classification.intent, identifiedCustomerId, identifiedContractId, customerMessage, toolResults);
      await this.handoff.createHandoff(conversationId, summary.reason, summary);
    }

    const primaryResult = toolResults[0];
    let replyText: string;
    if (identityLocked) {
      replyText = IDENTITY_LOCKED_MESSAGE;
    } else if (contractUnresolved) {
      replyText = CONTRACT_UNRESOLVED_MESSAGE;
    } else if (aiFailed) {
      replyText = AI_PROVIDER_FAILURE_MESSAGE;
    } else if (declined) {
      replyText = DECLINED_MESSAGE;
    } else if (realPulseContract && toolResults.length === 0 && PULSE_HANDOFF_MESSAGE[classification.intent]) {
      replyText = PULSE_HANDOFF_MESSAGE[classification.intent] as string;
    } else if (classification.intent === 'OUTRO' && primaryResult?.status === 'NOT_FOUND' && ai.mode !== 'LIVE') {
      replyText = OUT_OF_SCOPE_GUIDANCE_MESSAGE;
    } else {
      try {
        const allFacts = toolResults
          .filter((r) => r.status === 'OK')
          .flatMap((r) => r.facts.map((f) => ({ label: f.label, value: f.value })));

        const conv = await this.db.client.conversation.findUnique({
          where: { id: conversationId },
          select: { summary: true },
        });
        const history = await this.recentHistory(conversationId);
        const limits = await this.policy.getLimits();
        const providerName = await this.companyName(tenantId, tenantPolicy?.companyName);

        const replyInput: ComposeReplyInput = {
          intent: classification.intent,
          customerName: customerName,
          facts: allFacts,
          toolStatus: primaryResult ? primaryResult.status : null,
          followUp,
          customerMessage,
          history,
          needsCpf,
          justIdentified,
          cpfNotFound: attemptedTerm,
          providerName,
          maxOutputTokens: limits.maxTokensPerTurn,
          persona: {
            companyName: providerName,
            assistantName: tenantPolicy?.assistantName || 'Assistente Virtual',
            tone: tenantPolicy?.tone || 'caloroso, educado, empático e resolutivo (2 a 4 frases)',
            customRules: tenantPolicy?.customRules || undefined,
            supportHours: tenantPolicy?.supportHours || 'Segunda a Sexta, 08h às 18h',
            canCreateTicket,
          },
          summary: conv?.summary,
          intents: detectedIntents,
        };
        replyText = await ai.composeReply(replyInput);

        // O texto do LLM só sai se não afirmar nada além dos fatos; senão, resposta determinística.
        if (ai.mode === 'LIVE') {
          const verdict = checkReplyAgainstFacts(replyText, allFacts, { customerMessage, history });
          if (!verdict.ok) {
            this.logger.warn(
              `Resposta do LLM (${ai.name}) descartada pelo reply-guard: ${verdict.violations.join('; ')}`,
            );
            replyText = await this.deterministicAi.composeReply(replyInput);
          }
        }
      } catch (err) {
        this.logger.error(
          `composeReply (${ai.name}) falhou — encaminhando pra humano sem inventar resposta: ` +
            `${err instanceof Error ? err.message : String(err)}`,
        );
        replyText = AI_PROVIDER_FAILURE_MESSAGE;
        aiFailed = true;
        outcome = 'HANDOFF';
        const summary = this.buildHandoffSummary(classification.intent, identifiedCustomerId, identifiedContractId, customerMessage, toolResults);
        await this.handoff.createHandoff(
          conversationId,
          `IA indisponível para compor a resposta (${ai.name}) — ${summary.reason}`,
          summary,
        );
      }
    }

    await this.conversation.appendMessage(conversationId, aiFailed ? 'SYSTEM' : 'AGENT', replyText);

    await this.db.client.agentRun.update({
      where: { id: agentRun.id },
      data: {
        outcome,
        claims: claims as unknown as object,
        policyDecisions: policyDecisions as unknown as object,
      },
    });

    return {
      agentRunId: agentRun.id,
      tenantId,
      conversationId,
      intent: classification.intent,
      intentConfidence: classification.confidence,
      identity:
        identifiedCustomerId && identifiedContractId
          ? {
              customerId: identifiedCustomerId,
              contractId: identifiedContractId,
              method: identityResult.method,
              confidence: identityResult.confidence,
              resolvedAt: new Date().toISOString(),
            }
          : null,
      toolCalls: toolResults.map((r) => r.toolCallId),
      policyDecisions,
      claims,
      outcome,
      promptVersion: PROMPT_VERSION,
      model: ai.model,
      mode: ai.mode,
    };
  }

  /** Últimas falas (cliente/agente) antes da mensagem atual, mais antiga primeiro — contexto para a IA. */
  private async recentHistory(conversationId: string) {
    const rows = await this.db.client.message.findMany({
      where: { conversationId, role: { in: ['CUSTOMER', 'AGENT'] } },
      orderBy: { createdAt: 'desc' },
      take: 11,
    });
    // a mais recente é a mensagem atual do cliente (já gravada no início do turno) — vai à parte
    return rows
      .slice(1)
      .reverse()
      .map((m) => ({ role: m.role as 'CUSTOMER' | 'AGENT', content: m.content }));
  }

  private selectAccountTool(intent: Intent): { action: string; kind: 'billing' | 'plan' | 'get_ticket' | 'create_ticket' } {
    if (intent === 'PLANO') return { action: 'plan.view', kind: 'plan' };
    if (intent === 'STATUS_CHAMADO') return { action: 'support.get_ticket', kind: 'get_ticket' };
    if (intent === 'CHAMADO') return { action: 'support.create_ticket', kind: 'create_ticket' };
    return { action: 'billing.view', kind: 'billing' }; // FINANCEIRO, SEGUNDA_VIA, PAGAMENTO, BLOQUEIO
  }

  private async executeAccountTool(
    kind: 'billing' | 'plan' | 'get_ticket' | 'create_ticket',
    agentRunId: string,
    contractId: string,
    customerId: string,
    customerMessage: string,
  ): Promise<ToolResult> {
    switch (kind) {
      case 'billing':
        return this.executor.run(this.erpTools.billingTool, { contractId }, { agentRunId });
      case 'plan':
        return this.executor.run(this.erpTools.planViewTool, { customerId }, { agentRunId });
      case 'get_ticket':
        return this.executor.run(this.erpTools.supportGetTicketsTool, { contractId }, { agentRunId });
      case 'create_ticket':
        return this.executor.run(
          this.erpTools.supportCreateTicketTool,
          { contractId, category: 'GERAL', description: customerMessage },
          { agentRunId, idempotencyKey: `agentrun-${agentRunId}-create_ticket` },
        );
    }
  }

  private buildHandoffSummary(
    intent: Intent,
    customerId: string | null,
    contractId: string | null,
    customerMessage: string,
    toolResults: ToolResult[],
  ): HandoffSummary {
    const reason =
      customerId === null
        ? 'Identidade do cliente ambígua ou não encontrada para uma intenção que exige conta confirmada.'
        : 'Não foi possível responder com confiança dentro das garantias do agente (ver ferramentas consultadas).';

    return {
      reason,
      customerId,
      contractId,
      intent,
      reportedProblem: customerMessage,
      toolsConsulted: toolResults.map((r) => ({ tool: r.tool, result: r.status })),
      actionsTaken: toolResults
        .filter((r) => r.status === 'OK' && r.source.capability === 'create_ticket')
        .map((r) => `${r.tool} (${r.source.capability})`),
      actionsFailed: toolResults
        .filter((r) => ['UPSTREAM_ERROR', 'TIMEOUT', 'BLOCKED_BY_POLICY'].includes(r.status))
        .map((r) => `${r.tool}: ${r.status}`),
      suggestedNextAction:
        customerId === null
          ? 'Confirmar identidade do cliente (CPF/CNPJ ou contrato) antes de prosseguir.'
          : 'Revisar o histórico da conversa e os fatos já levantados antes de responder ao cliente.',
    };
  }

  private buildClaims(toolResults: ToolResult[]): Claim[] {
    const claims: Claim[] = [];
    for (const result of toolResults) {
      if (result.status !== 'OK') continue;
      for (const fact of result.facts) {
        claims.push({
          text: `${fact.label}: ${String(fact.value)}`,
          type: 'FACT',
          evidence: [`${result.toolCallId}#${fact.path}`],
        });
      }
    }
    return claims;
  }

  private decideOutcome(
    toolResults: ToolResult[],
    identityMethod: string,
    accountAvailable: boolean,
    intent: Intent,
  ): AgentDecision['outcome'] {
    const primary = toolResults[0];
    if (!primary) return 'HANDOFF';
    if (primary.status === 'BLOCKED_BY_POLICY') return 'BLOCKED';
    if (primary.status === 'NEEDS_CONFIRMATION') return 'AWAITING_CONFIRMATION';

    // Conversa solta / fora de escopo sem nada na base: responde com a orientação fixa, sem abrir handoff.
    if (intent === 'OUTRO' && primary.status === 'NOT_FOUND') return 'ANSWERED';

    const needsAccount = ACCOUNT_INTENTS.includes(intent);
    if (needsAccount && !accountAvailable && (identityMethod === 'AMBIGUOUS' || identityMethod === 'NOT_FOUND')) {
      return 'HANDOFF';
    }
    if (primary.status === 'OK') {
      return primary.tool === 'SupportTool' && primary.source.capability === 'create_ticket'
        ? 'ACTION_EXECUTED'
        : 'ANSWERED';
    }
    return 'HANDOFF';
  }

  /** Nome de exibição do provedor: persona do tenant, senão o nome do tenant sem sufixos técnicos. */
  private async companyName(tenantId: string, personaName?: string | null): Promise<string> {
    if (personaName?.trim()) return personaName.trim();
    const tenant = await this.db.client.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
    return tenant?.name.replace(/\s*\(.*\)\s*$/, '').trim() || 'seu provedor de internet';
  }

  /**
   * Identificação por documento digitado no chat. Regras (seção 5.1: nunca vincular a um contrato
   * incerto): só CPF/CNPJ completo; match exato e único; com telefone ambíguo o documento precisa bater
   * TAMBÉM com um dos telefones candidatos; exatamente um contrato ativo; confiança no máximo MEDIUM
   * quando só o documento prova (o documento vaza com facilidade). Falhas são contadas por conversa e,
   * ao atingir `handoffAfterFailures` da policy, bloqueiam novas tentativas (contra adivinhação de CPF).
   *
   * Fontes, nesta ordem: banco local → ERP ativo (ex.: SGP, que espelha o cliente no banco) → PulseISP
   * (login PPPoE = CPF). Toda fonte externa só ESPELHA o cliente; quem decide é sempre a mesma regra
   * exata do banco local, então nenhuma fonte "afrouxa" a identificação.
   */
  private async identifyByDocument(
    tenantId: string,
    conversationId: string,
    message: string,
    current: IdentityResolution,
  ): Promise<
    | { kind: 'none' }
    | { kind: 'identified'; resolution: Extract<IdentityResolution, { customerId: string }>; customerName: string | null }
    | { kind: 'not_found'; term: string }
    | { kind: 'locked' }
  > {
    const documentMatch =
      message.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/) || message.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/);
    const digits = documentMatch ? normalizeDocument(documentMatch[0]) : null;
    if (!digits) return { kind: 'none' };

    const { handoffAfterFailures } = await this.policy.getLimits();
    const failures = await this.db.client.auditLog.count({
      where: {
        action: IDENTITY_FAILURE_ACTION,
        entityId: conversationId,
        createdAt: { gte: new Date(Date.now() - IDENTITY_LOCK_WINDOW_MS) },
      },
    });
    if (failures >= handoffAfterFailures) return { kind: 'locked' };

    const conversationRecord = await this.db.client.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    const resolveLocal = () =>
      current.method === 'AMBIGUOUS'
        ? this.identity.resolveByPhoneAndDocument(conversationRecord.channelUserId, digits)
        : this.identity.resolveByDocument(digits);
    let resolution = await resolveLocal();

    // ERP ativo (SGP/IXC): busca SÓ pelo documento; o adapter espelha o cliente e os contratos no banco.
    if (resolution.method === 'NOT_FOUND') {
      try {
        const found = await this.erpTools.erp.findCustomer({ document: digits });
        if (found) resolution = await resolveLocal();
      } catch (err) {
        this.logger.warn(`[identity] Falha na busca por documento no ERP: ${err instanceof Error ? err.message : err}`);
      }
    }

    // PulseISP: login PPPoE costuma ser o CPF sem formatação. Só CPF (11 dígitos), não CNPJ.
    if (resolution.method === 'NOT_FOUND' && digits.length === 11 && pulseIspEnabled() && this.pulseClient && this.mirror) {
      try {
        const found = await this.pulseClient.findByPppoeLogin(tenantId, digits);
        if (found) {
          const c360 = await this.pulseClient.customer360(tenantId, found.id);
          await this.mirror.upsertFromCustomer360(tenantId, c360, { document: digits });
          resolution = await resolveLocal();
          this.logger.log(`[identity] CPF final ${digits.slice(-4)} identificado via PulseISP (login PPPoE)`);
        }
      } catch (err) {
        this.logger.warn(`[identity] Falha no fallback PulseISP: ${err instanceof Error ? err.message : err}`);
      }
    }

    if (resolution.method === 'DOCUMENT' && resolution.contractId) {
      const customer = await this.db.client.customer.findUnique({
        where: { id: resolution.customerId },
        select: { name: true },
      });
      return { kind: 'identified', resolution, customerName: customer?.name ?? null };
    }

    // O documento em si não vai para o log (é dado pessoal); só o motivo.
    await this.db.client.auditLog.create({
      data: {
        tenantId,
        actorType: 'AGENT',
        action: IDENTITY_FAILURE_ACTION,
        entityType: 'Conversation',
        entityId: conversationId,
        metadata: { reason: resolution.method === 'DOCUMENT' ? 'CONTRACT_NOT_UNIQUE' : resolution.method },
      },
    });
    // A última tentativa permitida já bloqueia: o handoff acontece no turno em que o limite estoura.
    if (failures + 1 >= handoffAfterFailures) return { kind: 'locked' };
    return { kind: 'not_found', term: digits };
  }
}
