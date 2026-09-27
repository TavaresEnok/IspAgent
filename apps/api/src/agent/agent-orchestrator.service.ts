import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
import { isErpContract } from '../integrations/pulseisp/tenant-pulseisp.adapter';
import { PulseIspClient } from '../integrations/pulseisp/pulseisp-client.service';
import { PulseIspMirrorService } from '../integrations/pulseisp/pulseisp-mirror.service';
import { HandoffService } from '../handoff/handoff.service';
import { ClaimValidatorService, ClaimInvariantViolationError } from './claim-validator.service';
import { IdentityResolution, IdentityResolutionService, normalizeDocument } from '../identity/identity-resolution.service';
import { MockAIProvider } from '../integrations/ai/mock-ai.provider';
import { ComposeReplyInput } from '../integrations/ai/ai-provider.interface';
import { checkReplyAgainstFacts } from './reply-guard';
import {
  CANCELLATION_REASON_QUESTION,
  cancellationStep,
  billingDisputeReply,
  competitorReply,
  deniesIdentity,
  documentPurposeReply,
  isBillingDispute,
  isCancellationNegated,
  isTitleTransfer,
  mentionsCompetitor,
  titleTransferReply,
  documentRefusalReply,
  humanRefusalReply,
  humanRequestReply,
  identifiedReply,
  identityDeniedReply,
  isComplaintAboutReply,
  isDocumentPurposeQuestion,
  isDocumentRefusal,
  isHumanRefusal,
  isHumanRequest,
  isScopeQuestion,
  leadReply,
  scopeReply,
} from './quick-flows';
import { isWithinSupportHours, offHoursNotice } from './support-hours';
import { FlowsService } from '../flows/flows.service';
import { FlowEngine, FlowRuntime } from '../flows/flow-engine';
import { FlowRunState } from '@ispagent/shared';

const PROMPT_VERSION = 'agent-v1-2026-09-14';

const ACCOUNT_INTENTS: Intent[] = [
  'FINANCEIRO', 'SEGUNDA_VIA', 'PAGAMENTO', 'BLOQUEIO', 'PLANO', 'CHAMADO', 'STATUS_CHAMADO',
];

const NETWORK_INTENTS: Intent[] = ['SEM_CONEXAO', 'INTERNET_LENTA', 'QUEDAS', 'SUPORTE_INTERNET'];

const MAX_IDENTIFICATION_ASKS = 2;

/** Transferência fora do expediente: avisa quando a equipe volta em vez de deixar o cliente esperando. */
function withOffHoursNotice(reply: string, supportHours: string | null | undefined): string {
  if (!supportHours || isWithinSupportHours(supportHours) !== false) return reply;
  // A resposta já falou do horário (texto da IA): repetir o aviso logo abaixo fica duplicado.
  if (/\b\d{1,2}\s*h(?:\d{2})?\b[^\n]{0,40}\b\d{1,2}\s*h(?:\d{2})?\b/i.test(reply)) return reply;
  return `${reply}\n\n${offHoursNotice(supportHours)}`;
}

const IDENTITY_HANDOFF_MESSAGE =
  'Não consegui localizar o seu cadastro por aqui. Vou te passar para um atendente, que confirma os seus dados e continua o atendimento com você.';

// Cliente não mandou documento nenhum: dizer "não localizei o seu cadastro" seria falso.
const IDENTITY_HANDOFF_NO_DOCUMENT_MESSAGE =
  'Sem o CPF ou CNPJ do titular eu não consigo acessar a sua conta por aqui. Vou te passar para um atendente, que confirma os seus dados de outra forma e continua o atendimento com você.';

/** CPF/CNPJ completo digitado na mensagem (só dígitos), ou `null`. */
function extractDocument(message: string): string | null {
  const match =
    message.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/) || message.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/);
  return match ? normalizeDocument(match[0]) : null;
}

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
  private readonly flows: FlowsService;
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
    @Optional() flows?: FlowsService,
  ) {
    this.identity = identity ?? new IdentityResolutionService(db);
    this.flows = flows ?? new FlowsService(db);
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

    // Fluxo visual ativo (construtor de fluxo do painel): ele conduz a conversa até passar para a IA,
    // transferir ou terminar. Sem fluxo ativo, o atendimento segue exatamente como antes.
    const flowDecision = await this.runFlowTurn(conversationRecord, customerMessage);
    if (flowDecision) return flowDecision;

    let identityResult = await this.conversation.resolveIdentity(conversationId);
    let customerName: string | null = null;
    let justIdentified = false;
    let attemptedTerm: string | null = null;
    let identityLocked = false;
    let identitySwitched = false;
    let identityDenied = false;

    // Conversa já vinculada, mas o cliente diz "não sou o Fulano" ou manda OUTRO documento ("mandei o CPF
    // errado, o certo é..."): a conversa não pode continuar presa ao primeiro cadastro. Desvincula e, se
    // veio documento, ele passa pela mesma identificação (mesmas regras e mesmo limite de tentativas).
    if ('customerId' in identityResult && identityResult.customerId) {
      const linked = await this.db.client.customer.findUnique({
        where: { id: identityResult.customerId },
        select: { name: true, document: true },
      });
      const typedDocument = extractDocument(customerMessage);
      const otherDocument = typedDocument !== null && typedDocument !== normalizeDocument(linked?.document ?? '');
      if (otherDocument || deniesIdentity(customerMessage, linked?.name ?? null)) {
        await this.db.client.conversation.update({
          where: { id: conversationId },
          data: { customerId: null, contractId: null, identityMethod: 'NOT_FOUND', identityConfidence: 'LOW' },
        });
        identityResult = { method: 'NOT_FOUND', confidence: 'LOW' };
        identitySwitched = otherDocument;
        identityDenied = !otherDocument;
      }
    }

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

    const identifiedContractId =
      identityResult.method === 'PHONE_EXACT' || identityResult.method === 'DOCUMENT'
        ? identityResult.contractId
        : null;
    const identifiedCustomerId =
      identityResult.method === 'PHONE_EXACT' || identityResult.method === 'DOCUMENT'
        ? identityResult.customerId
        : null;
    const decisionIdentity: AgentDecision['identity'] =
      identifiedCustomerId && identifiedContractId
        ? {
            customerId: identifiedCustomerId,
            contractId: identifiedContractId,
            method: identityResult.method,
            confidence: identityResult.confidence,
            resolvedAt: new Date().toISOString(),
          }
        : null;
    const tenantPolicy = await this.db.client.tenantPolicyConfig.findUnique({ where: { tenantId } });
    const companyName = await this.companyName(tenantId, tenantPolicy?.companyName);
    const quick = {
      tenantId,
      conversationId,
      ai,
      identity: decisionIdentity,
      reportedProblem: customerMessage,
      supportHours: tenantPolicy?.supportHours ?? null,
    };

    // 0. Identidade negada ("não sou o Fulano"): já desvinculado acima, pede o documento certo.
    if (identityDenied) {
      return this.finishQuickTurn(quick, { intent: 'OUTRO', outcome: 'ANSWERED', reply: identityDeniedReply() });
    }

    // "Não quero falar com atendente" — o contrário de pedir transferência.
    if (isHumanRefusal(customerMessage)) {
      return this.finishQuickTurn(quick, { intent: 'OUTRO', outcome: 'ANSWERED', reply: humanRefusalReply(customerName) });
    }

    // Cliente ainda sem cadastro perguntando por que precisa do CPF, ou preferindo não informar: explica e
    // segue. Não é tentativa de identificação e não conta para o limite de pedidos de documento.
    if (!decisionIdentity && !extractDocument(customerMessage)) {
      if (isDocumentPurposeQuestion(customerMessage)) {
        return this.finishQuickTurn(quick, { intent: 'OUTRO', outcome: 'ANSWERED', reply: documentPurposeReply(companyName) });
      }
      if (isDocumentRefusal(customerMessage) && (await this.lastAgentAskedDocument(conversationId))) {
        return this.finishQuickTurn(quick, { intent: 'OUTRO', outcome: 'ANSWERED', reply: documentRefusalReply() });
      }
    }

    // 1. Pedido explícito de atendimento humano ou irritação: direto para a fila.
    if (isHumanRequest(customerMessage)) {
      return this.finishQuickTurn(quick, {
        intent: 'OUTRO',
        outcome: 'HANDOFF',
        reply: humanRequestReply(customerName),
        handoff: {
          reason: 'Cliente solicitou atendimento humano ou expressou insatisfação.',
          suggestedNextAction: 'Atendimento manual por operador.',
        },
      });
    }

    // 2. "O que você faz?" sem nenhum assunto reconhecido: menu.
    if (!aiFailed && isScopeQuestion(customerMessage, classification.intent)) {
      return this.finishQuickTurn(quick, { intent: 'OUTRO', outcome: 'ANSWERED', reply: scopeReply(customerName, companyName) });
    }

    // 3. Solicitação pendente de cobrança / "e minhas outras solicitações?" / "pedi o pix" / "pdf sem ser link"
    if (PENDING_BILLING_TRIGGER.test(customerMessage)) {
      classification = { intent: 'SEGUNDA_VIA', confidence: 'HIGH' };
    }

    // "Eu nem pedi boleto", "não mencionei pagamento": reclamação da resposta anterior, não um pedido — a
    // palavra-chave ali não pode disparar a consulta de novo.
    if (isComplaintAboutReply(customerMessage)) {
      classification = { intent: 'OUTRO', confidence: 'HIGH' };
      detectedIntents = ['OUTRO'];
    }

    // Pedidos que a palavra-chave classificaria errado: vão direto para o setor certo, sem ferramenta.
    // Troca de titularidade ("sem cancelar o plano") não é cancelamento; contestação de cobrança não recebe
    // PIX; oferta de concorrente é caso de retenção, não "interesse em contratar".
    if (isTitleTransfer(customerMessage)) {
      return this.finishQuickTurn(quick, {
        intent: 'FINANCEIRO',
        outcome: 'HANDOFF',
        reply: titleTransferReply(customerName),
        handoff: {
          reason: 'Cliente pediu troca de titularidade do contrato.',
          suggestedNextAction: 'Informar os documentos necessários e conduzir a troca de titularidade (sem cancelar o contrato).',
        },
      });
    }
    if (isBillingDispute(customerMessage)) {
      return this.finishQuickTurn(quick, {
        intent: 'FINANCEIRO',
        outcome: 'HANDOFF',
        reply: billingDisputeReply(customerName),
        handoff: {
          reason: 'Cliente contesta uma cobrança (pagamento não reconhecido, duplicidade, negativação ou estorno).',
          suggestedNextAction: 'Conferir pagamentos no ERP e o comprovante do cliente antes de qualquer nova cobrança.',
        },
      });
    }
    if (mentionsCompetitor(customerMessage)) {
      return this.finishQuickTurn(quick, {
        intent: 'CANCELAMENTO',
        outcome: 'HANDOFF',
        reply: competitorReply(customerName, companyName),
        handoff: {
          reason: 'Cliente recebeu oferta de concorrente e avalia trocar de operadora.',
          suggestedNextAction: 'Retenção: entender a oferta recebida e avaliar uma condição para manter o cliente.',
        },
      });
    }
    if (isCancellationNegated(customerMessage) && detectedIntents.includes('CANCELAMENTO')) {
      detectedIntents = detectedIntents.filter((it) => it !== 'CANCELAMENTO');
      if (detectedIntents.length === 0) detectedIntents = ['OUTRO'];
      classification = { intent: detectedIntents[0], confidence: 'MEDIUM' };
    }

    // Se o cliente acabou de se identificar dinamicamente (ex.: enviou o CPF/código agora),
    // recuperar a intenção que estava pendente da conversa se a fala atual foi classificada como OUTRO/SUPORTE.
    // Não vale na troca de documento: o pedido anterior era do outro cadastro (e costuma ser a reclamação).
    if (
      justIdentified &&
      !identitySwitched &&
      (classification.intent === 'OUTRO' || classification.intent === 'SUPORTE_INTERNET')
    ) {
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

    // Acabou de se identificar sem pedido pendente: confirma o cadastro e pergunta o assunto. Deixar isso
    // para a busca na base de conhecimento fazia o LLM ler "não encontrado" e dizer que o cadastro não existia.
    if (justIdentified && classification.intent === 'OUTRO') {
      return this.finishQuickTurn(quick, {
        intent: 'OUTRO',
        outcome: 'ANSWERED',
        reply: identifiedReply(customerName, identitySwitched),
      });
    }

    // Continuação: "que sinal?", "sim", "não" logo depois de um diagnóstico de rede.
    let followUp = false;
    let declined = false;
    const canCreateTicket = !tenantPolicy?.readOnlyMode && Boolean(tenantPolicy?.canCreateTicket);

    const lastAgentReply = await this.db.client.message.findFirst({
      where: { conversationId, role: 'AGENT', createdAt: { gte: new Date(Date.now() - FOLLOW_UP_WINDOW_MS) } },
      orderBy: { createdAt: 'desc' },
    });
    const answeringCancellationReason = Boolean(lastAgentReply?.content.includes(CANCELLATION_REASON_QUESTION));
    if (!aiFailed && answeringCancellationReason) {
      classification = { intent: 'CANCELAMENTO', confidence: 'MEDIUM' };
    }

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

    const policyDecisions: PolicyDecision[] = [];
    const toolResults: ToolResult[] = [];

    const accountAvailable = Boolean(identifiedContractId && identifiedCustomerId);
    const realPulseContract = isPulseId(identifiedContractId);
    // Diagnóstico de rede de cliente real (PulseISP ou ERP) é dado LIVE na auditoria, nunca rotulado DEMO.
    const liveNetwork = realPulseContract || isErpContract(identifiedContractId);

    // 4. Cancelamento: pede o motivo uma vez e passa para a retenção humana (sem prometer condição).
    if (classification.intent === 'CANCELAMENTO') {
      const step = cancellationStep(customerMessage, customerName, answeringCancellationReason);
      if (step.kind === 'ASK_REASON') {
        return this.finishQuickTurn(quick, { agentRunId: agentRun.id, intent: 'CANCELAMENTO', outcome: 'ANSWERED', reply: step.reply });
      }
      await this.db.client.cancellationRequest.create({
        data: {
          tenantId,
          conversationId,
          customerId: identifiedCustomerId,
          contractId: identifiedContractId,
          reason: customerMessage,
          discountOffered: step.priceRelated,
          status: 'TRANSFERRED',
        },
      });
      return this.finishQuickTurn(quick, {
        agentRunId: agentRun.id,
        intent: 'CANCELAMENTO',
        outcome: 'HANDOFF',
        reply: step.reply,
        handoff: { reason: 'Cliente solicitou cancelamento da assinatura.', suggestedNextAction: step.nextAction },
      });
    }

    // 5. Contratação/upgrade: um lead em aberto por contato (mensagens seguintes viram anotação nele).
    if (classification.intent === 'CONTRATACAO' || classification.intent === 'UPGRADE') {
      // No Web Chat o id do canal é uma sessão aleatória, não telefone: o lead fica marcado sem telefone
      // (e continua único por sessão, para as mensagens seguintes virarem anotação nele).
      const channelId = conversationRecord.channelUserId;
      const phone = /^\+?\d{10,13}$/.test(channelId) ? channelId : `sem telefone (web chat …${channelId.slice(-6)})`;
      const existingLead = await this.db.client.commercialLead.findFirst({
        where: { phone, status: 'NEW' },
        orderBy: { createdAt: 'desc' },
      });
      if (existingLead) {
        await this.db.client.commercialLead.update({
          where: { id: existingLead.id },
          data: { notes: [existingLead.notes, customerMessage].filter(Boolean).join('\n') },
        });
      } else {
        await this.db.client.commercialLead.create({
          data: {
            tenantId,
            name: customerName || 'Interessado via chat',
            phone,
            desiredPlan: classification.intent === 'UPGRADE' ? 'Upgrade de velocidade' : 'Novo plano',
            originChannel: conversationRecord.channel,
            status: 'NEW',
            notes: customerMessage,
          },
        });
      }
      return this.finishQuickTurn(quick, {
        agentRunId: agentRun.id,
        intent: classification.intent,
        outcome: 'ACTION_EXECUTED',
        reply: leadReply(customerName, companyName, Boolean(existingLead)),
      });
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
    const wantsIdentification =
      !identityLocked &&
      !contractUnresolved &&
      !accountAvailable &&
      (needsAccountOrNetwork || askedCpfPreviously || Boolean(attemptedTerm));
    // Já pedimos o documento duas vezes sem conseguir identificar: para de insistir e passa para um atendente.
    const cpfAsks = recentAgentReplies.filter((m) => /cpf|cnpj/i.test(m.content)).length;
    // Só conta quando há um pedido de conta/conexão em aberto (ou o cliente tentou um documento): depois
    // de um "bom dia", conversa solta não é "tentativa falhada" e não pode virar transferência.
    const identityExhausted =
      wantsIdentification &&
      cpfAsks >= MAX_IDENTIFICATION_ASKS &&
      (needsAccountOrNetwork || Boolean(attemptedTerm) || (await this.hasAccountRequest(conversationId)));
    const needsCpf = wantsIdentification && !identityExhausted;

    // Se a classificação falhou, não escolhemos ferramenta nenhuma a partir dela — `toolResults`/
    // `policyDecisions` ficam vazios e o turno vai direto pro caminho de HANDOFF abaixo.
    if (declined || identityLocked || contractUnresolved || identityExhausted) {
      // nada a consultar — só encerra a oferta / a identidade não está confirmada (vira handoff abaixo)
    } else if (needsCpf) {
      // Cliente ainda não identificado: não faz busca de KB inútil nem gera handoff.
      // O bot vai solicitar ou reiterar a necessidade do CPF para poder dar prosseguimento.
    } else if (!aiFailed && accountAvailable && hasNetwork && hasAccount) {
      // Cenário Multi-Intent: diagnóstico de rede (PulseISP ou base de conhecimento) + consulta de conta
      if (pulseIspEnabled() || realPulseContract) {
        const pulseTool = liveNetwork ? this.pulseIspLiveTool : this.pulseIspTool;
        const decisionPulse = await this.policy.evaluate(pulseTool.action);
        policyDecisions.push(decisionPulse);
        toolResults.push(
          await this.executor.run(pulseTool, { contractId: identifiedContractId as string }, { agentRunId: agentRun.id }),
        );
      } else {
        const kbTool = createKnowledgeSearchTool(this.knowledgeService);
        const decisionKb = await this.policy.evaluate(kbTool.action);
        policyDecisions.push(decisionKb);
        toolResults.push(await this.executor.run(kbTool, { query: customerMessage }, { agentRunId: agentRun.id }));
      }

      // Desbloqueio em confiança se solicitado
      const isUnlockRequest = /(?:desbloque|libera|libera[cç][aã]o|confian[cç]a|j[aá] paguei|promessa|comprovante)/i.test(customerMessage);
      if (isUnlockRequest && !realPulseContract) {
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
      if ((isUnlockRequest || classification.intent === 'BLOQUEIO') && !realPulseContract) {
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
        const pulseTool = liveNetwork ? this.pulseIspLiveTool : this.pulseIspTool;
        const decision = await this.policy.evaluate(pulseTool.action);
        policyDecisions.push(decision);
        toolResults.push(
          await this.executor.run(pulseTool, { contractId: identifiedContractId as string }, { agentRunId: agentRun.id }),
        );
      } else {
        // Sem PulseISP: a base de conhecimento é a resposta principal; a leitura da ONU pelo ERP (quando o
        // ERP a fornece) entra como complemento. Com PulseISP ela não roda: o diagnóstico já traz o sinal
        // óptico, e duas fontes no mesmo turno chegaram a se contradizer.
        const kbTool = createKnowledgeSearchTool(this.knowledgeService);
        const decisionKb = await this.policy.evaluate(kbTool.action);
        policyDecisions.push(decisionKb);
        toolResults.push(await this.executor.run(kbTool, { query: customerMessage }, { agentRunId: agentRun.id }));

        const opticalDecision = await this.policy.evaluate(this.erpTools.opticalSignalTool.action);
        policyDecisions.push(opticalDecision);
        if (opticalDecision.allowed) {
          toolResults.push(
            await this.executor.run(this.erpTools.opticalSignalTool, { contractId: identifiedContractId as string }, { agentRunId: agentRun.id }),
          );
        }
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
    } else if (identityLocked || contractUnresolved || identityExhausted) {
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
      // Nos transbordos por identidade a última fala costuma ser só o documento: o atendente precisa do pedido.
      const reportedProblem =
        identityLocked || identityExhausted ? await this.lastCustomerRequest(conversationId, customerMessage) : customerMessage;
      const summary = identityLocked
        ? {
            reason: 'Identidade do cliente não confirmada: várias tentativas de documento sem correspondência.',
            customerId: null,
            contractId: null,
            intent: classification.intent,
            reportedProblem,
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
        : identityExhausted
          ? {
              ...this.buildHandoffSummary(classification.intent, identifiedCustomerId, identifiedContractId, reportedProblem, toolResults),
              reason: 'Não foi possível identificar o cliente: o documento foi pedido duas vezes sem localizar um cadastro único.',
              suggestedNextAction: 'Confirmar a identidade do cliente (CPF/CNPJ do titular) e seguir com o pedido.',
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
    } else if (identityExhausted) {
      replyText = attemptedTerm ? IDENTITY_HANDOFF_MESSAGE : IDENTITY_HANDOFF_NO_DOCUMENT_MESSAGE;
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
          handedOff: outcome === 'HANDOFF',
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
          const verdict = checkReplyAgainstFacts(replyText, allFacts, {
            customerMessage,
            history,
            trustedTexts: [replyInput.persona?.supportHours ?? ''],
            customerIdentified: Boolean(decisionIdentity),
          });
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

    if (outcome === 'HANDOFF') replyText = withOffHoursNotice(replyText, tenantPolicy?.supportHours);
    await this.conversation.appendMessage(conversationId, aiFailed ? 'SYSTEM' : 'AGENT', replyText);

    await this.db.client.agentRun.update({
      where: { id: agentRun.id },
      data: {
        outcome,
        // A IA pode ter caído no meio do turno: registra quem respondeu de fato.
        model: ai.model,
        mode: ai.mode,
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
      identity: decisionIdentity,
      toolCalls: toolResults.map((r) => r.toolCallId),
      policyDecisions,
      claims,
      outcome,
      promptVersion: PROMPT_VERSION,
      model: ai.model,
      mode: ai.mode,
    };
  }

  /**
   * Um turno conduzido pelo fluxo visual ativo, ou `null` para seguir o atendimento normal (sem fluxo
   * ativo, fluxo já passou para a IA/terminou, ou a conversa começou antes de o fluxo existir).
   *
   * O fluxo usa as MESMAS garantias do atendimento: identificação só por documento (com o limite de
   * tentativas), consultas pelas ferramentas com policy e auditoria, e texto das consultas montado só com
   * os fatos do SGP (respostas por regras, nunca geradas livremente).
   */
  private async runFlowTurn(
    conversationRecord: { id: string; flowState: unknown },
    customerMessage: string,
  ): Promise<AgentDecision | null> {
    const previous = (conversationRecord.flowState ?? null) as FlowRunState | null;
    if (previous && previous.status !== 'running') return null;
    const active = await this.flows.activeFlow();
    if (!active) return null;
    const conversationId = conversationRecord.id;
    if (!previous) {
      // Conversa já em andamento com a IA quando o fluxo foi ativado: não interrompe no meio.
      const answered = await this.db.client.message.count({ where: { conversationId, role: 'AGENT' } });
      if (answered > 0) return null;
    }

    const tenantId = currentTenantId() as string;
    const tenantPolicy = await this.db.client.tenantPolicyConfig.findUnique({ where: { tenantId } });
    const companyName = await this.companyName(tenantId, tenantPolicy?.companyName);
    const mode = this.erpTools.erp.mode;
    const toolResults: ToolResult[] = [];
    const policyDecisions: PolicyDecision[] = [];
    let ticketOpened = false;

    let agentRunId: string | null = null;
    const ensureRun = async () => {
      if (!agentRunId) {
        const run = await this.db.client.agentRun.create({
          data: {
            tenantId,
            conversationId,
            intent: 'OUTRO',
            intentConfidence: 'HIGH',
            promptVersion: `flow-${active.id.slice(0, 8)}-v${active.version}`,
            model: `fluxo v${active.version}`,
            mode,
          },
        });
        agentRunId = run.id;
      }
      return agentRunId;
    };

    // Identidade atual da conversa (o fluxo pode identificar no meio do caminho).
    let identity = await this.conversation.resolveIdentity(conversationId);
    const who = { customerId: null as string | null, contractId: null as string | null, name: null as string | null };
    const loadWho = async () => {
      if ((identity.method === 'DOCUMENT' || identity.method === 'PHONE_EXACT') && identity.customerId) {
        who.customerId = identity.customerId;
        who.contractId = identity.contractId ?? null;
        const c = await this.db.client.customer.findUnique({ where: { id: identity.customerId }, select: { name: true } });
        who.name = c?.name ?? null;
      }
    };
    await loadWho();

    const composeFromFacts = async (intent: Intent, result: ToolResult) =>
      this.deterministicAi.composeReply({
        intent,
        customerName: who.name,
        facts: result.facts.map((f) => ({ label: f.label, value: f.value })),
        toolStatus: result.status,
        customerMessage,
        providerName: companyName,
        persona: { companyName, canCreateTicket: false },
      });

    const runTool = async (action: string, exec: (runId: string) => Promise<ToolResult>): Promise<ToolResult | null> => {
      const decision = await this.policy.evaluate(action);
      policyDecisions.push(decision);
      if (!decision.allowed) return null;
      const result = await exec(await ensureRun());
      toolResults.push(result);
      return result;
    };

    const rt: FlowRuntime = {
      companyName,
      customerName: () => who.name,
      isIdentified: () => Boolean(who.customerId && who.contractId),
      identify: async (document) => {
        const outcome = await this.identifyByDocument(tenantId, conversationId, document, identity);
        if (outcome.kind === 'locked') return 'locked';
        if (outcome.kind !== 'identified') return 'not_found';
        await this.db.client.conversation.update({
          where: { id: conversationId },
          data: {
            customerId: outcome.resolution.customerId,
            contractId: outcome.resolution.contractId,
            identityMethod: outcome.resolution.method,
            identityConfidence: outcome.resolution.confidence,
          },
        });
        identity = outcome.resolution;
        await loadWho();
        return 'identified';
      },
      lookup: async (query) => {
        if (!who.customerId || !who.contractId) return { status: 'not_found' };
        const contractId = who.contractId;
        const customerId = who.customerId;
        let result: ToolResult | null;
        let intent: Intent;
        if (query === 'invoice') {
          intent = 'SEGUNDA_VIA';
          result = await runTool('billing.view', (id) => this.executeAccountTool('billing', id, contractId, customerId, customerMessage));
        } else if (query === 'plan') {
          intent = 'PLANO';
          result = await runTool('plan.view', (id) => this.executeAccountTool('plan', id, contractId, customerId, customerMessage));
        } else {
          intent = 'SUPORTE_INTERNET';
          const live = isPulseId(contractId) || isErpContract(contractId);
          const tool = pulseIspEnabled() || isPulseId(contractId)
            ? live ? this.pulseIspLiveTool : this.pulseIspTool
            : this.erpTools.opticalSignalTool;
          result = await runTool(tool.action, (id) => this.executor.run(tool, { contractId }, { agentRunId: id }));
        }
        if (!result) return { status: 'error' };
        if (result.status === 'NOT_FOUND') return { status: 'not_found' };
        if (result.status !== 'OK') return { status: 'error' };
        return { status: 'ok', reply: await composeFromFacts(intent, result) };
      },
      openTicket: async (description) => {
        if (!who.customerId || !who.contractId) return { status: 'error' };
        if (tenantPolicy?.readOnlyMode || !tenantPolicy?.canCreateTicket) return { status: 'error' };
        const contractId = who.contractId;
        const customerId = who.customerId;
        const result = await runTool('support.create_ticket', (id) =>
          this.executeAccountTool('create_ticket', id, contractId, customerId, description),
        );
        const protocol = result?.status === 'OK' ? result.facts.find((f) => f.label === 'Chamado criado')?.value : null;
        if (!protocol) return { status: 'error' };
        ticketOpened = true;
        return { status: 'ok', reply: `Pronto! Abri o chamado ${String(protocol)} para a nossa equipe técnica.` };
      },
      isBusinessHours: () => isWithinSupportHours(tenantPolicy?.supportHours),
      isHumanRequest,
    };

    const engine = new FlowEngine(active.definition, active.id, active.version);
    const result = await engine.step(previous, customerMessage, rt);

    await this.db.client.conversation.update({
      where: { id: conversationId },
      data: { flowState: result.state as unknown as Prisma.InputJsonValue },
    });

    // "Passar para a IA" sem mensagem própria: a IA responde já esta mensagem.
    if (result.outcome === 'ai' && result.replies.length === 0 && !agentRunId) return null;

    const runId = await ensureRun();
    const claims = this.buildClaims(toolResults);
    const outcome: AgentDecision['outcome'] =
      result.outcome === 'handoff' ? 'HANDOFF' : ticketOpened ? 'ACTION_EXECUTED' : 'ANSWERED';

    if (result.handoff) {
      const answered = Object.entries(result.state.vars)
        .filter(([k]) => !['empresa', 'nome', 'primeiro_nome', 'cpf'].includes(k))
        .map(([k, v]) => `${k}: ${v}`)
        .join('; ');
      const summary: HandoffSummary = {
        reason: result.handoff.reason,
        customerId: who.customerId,
        contractId: who.contractId,
        intent: 'OUTRO',
        reportedProblem: [customerMessage, answered && `Respostas no fluxo: ${answered}`].filter(Boolean).join(' — '),
        toolsConsulted: toolResults.map((r) => ({ tool: r.tool, result: r.status })),
        actionsTaken: ticketOpened ? ['Chamado aberto pelo fluxo'] : [],
        actionsFailed: toolResults.filter((r) => r.status !== 'OK').map((r) => `${r.tool}: ${r.status}`),
        suggestedNextAction: 'Continuar o atendimento de onde o fluxo parou (ver as mensagens da conversa).',
      };
      await this.handoff.createHandoff(conversationId, summary.reason, summary, result.handoff.department);
    }

    for (let i = 0; i < result.replies.length; i++) {
      const last = i === result.replies.length - 1;
      const text = last && result.outcome === 'handoff' ? withOffHoursNotice(result.replies[i], tenantPolicy?.supportHours) : result.replies[i];
      await this.conversation.appendMessage(conversationId, 'AGENT', text);
    }

    await this.db.client.agentRun.update({
      where: { id: runId },
      data: {
        outcome,
        claims: claims as unknown as object,
        policyDecisions: policyDecisions as unknown as object,
      },
    });

    const decisionIdentity: AgentDecision['identity'] =
      who.customerId && who.contractId && (identity.method === 'DOCUMENT' || identity.method === 'PHONE_EXACT')
        ? {
            customerId: who.customerId,
            contractId: who.contractId,
            method: identity.method,
            confidence: identity.confidence,
            resolvedAt: new Date().toISOString(),
          }
        : null;

    return {
      agentRunId: runId,
      tenantId,
      conversationId,
      intent: 'OUTRO',
      intentConfidence: 'HIGH',
      identity: decisionIdentity,
      toolCalls: toolResults.map((r) => r.toolCallId),
      policyDecisions,
      claims,
      outcome,
      promptVersion: `flow-v${active.version}`,
      model: `fluxo v${active.version}`,
      mode,
    };
  }

  /** O cliente já pediu nesta conversa algo que exige a conta ou a conexão dele. */
  private async hasAccountRequest(conversationId: string): Promise<boolean> {
    const run = await this.db.client.agentRun.findFirst({
      where: { conversationId, intent: { in: [...ACCOUNT_INTENTS, ...NETWORK_INTENTS] } },
      select: { id: true },
    });
    return Boolean(run);
  }

  /** A resposta anterior do agente pediu CPF/CNPJ (a mensagem atual é a réplica a esse pedido). */
  private async lastAgentAskedDocument(conversationId: string): Promise<boolean> {
    const last = await this.db.client.message.findFirst({
      where: { conversationId, role: 'AGENT' },
      orderBy: { createdAt: 'desc' },
    });
    return Boolean(last && /cpf|cnpj/i.test(last.content));
  }

  /** Última fala do cliente que não é só um documento (o pedido de verdade), ou `fallback`. */
  private async lastCustomerRequest(conversationId: string, fallback: string): Promise<string> {
    const recent = await this.db.client.message.findMany({
      where: { conversationId, role: 'CUSTOMER' },
      orderBy: { createdAt: 'desc' },
      take: 8,
    });
    const onlyDocument = /^\s*(?:(?:meu\s+)?(?:cpf|cnpj|documento)\s*(?:[ée]|:)?\s*)?[\d.\-/\s]{11,20}\s*$/i;
    return recent.find((m) => !onlyDocument.test(m.content))?.content ?? fallback;
  }

  /** Últimas falas (cliente/agente) antes da mensagem atual, mais antiga primeiro — contexto para a IA. */
  /** Turno resolvido sem ferramenta: registra o AgentRun, abre handoff se for o caso e responde. */
  private async finishQuickTurn(
    ctx: {
      tenantId: string;
      conversationId: string;
      ai: { model: string; mode: AgentDecision['mode'] };
      identity: AgentDecision['identity'];
      reportedProblem: string;
      supportHours: string | null;
    },
    turn: {
      intent: Intent;
      outcome: AgentDecision['outcome'];
      reply: string;
      agentRunId?: string;
      handoff?: { reason: string; suggestedNextAction: string };
    },
  ): Promise<AgentDecision> {
    const agentRun = turn.agentRunId
      ? await this.db.client.agentRun.update({ where: { id: turn.agentRunId }, data: { outcome: turn.outcome } })
      : await this.db.client.agentRun.create({
          data: {
            tenantId: ctx.tenantId,
            conversationId: ctx.conversationId,
            intent: turn.intent,
            intentConfidence: 'HIGH',
            promptVersion: PROMPT_VERSION,
            model: ctx.ai.model,
            mode: ctx.ai.mode,
            outcome: turn.outcome,
          },
        });

    if (turn.handoff) {
      await this.handoff.createHandoff(ctx.conversationId, turn.handoff.reason, {
        intent: turn.intent,
        reason: turn.handoff.reason,
        reportedProblem: ctx.reportedProblem,
        customerId: ctx.identity?.customerId ?? null,
        contractId: ctx.identity?.contractId ?? null,
        toolsConsulted: [],
        actionsTaken: [],
        actionsFailed: [],
        suggestedNextAction: turn.handoff.suggestedNextAction,
      });
    }

    const reply = turn.handoff ? withOffHoursNotice(turn.reply, ctx.supportHours) : turn.reply;
    await this.conversation.appendMessage(ctx.conversationId, 'AGENT', reply);

    return {
      agentRunId: agentRun.id,
      tenantId: ctx.tenantId,
      conversationId: ctx.conversationId,
      intent: turn.intent,
      intentConfidence: agentRun.intentConfidence as AgentDecision['intentConfidence'],
      identity: ctx.identity,
      toolCalls: [],
      policyDecisions: [],
      claims: [],
      outcome: turn.outcome,
      promptVersion: PROMPT_VERSION,
      model: ctx.ai.model,
      mode: ctx.ai.mode,
    };
  }

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
    const digits = extractDocument(message);
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
    // ERP real (SGP) é o cadastro oficial (fatura, plano, contrato): consultado ANTES, só pelo documento,
    // e o adapter espelha/atualiza o cliente no banco. Com ERP DEMO, só se o banco não tiver o documento.
    const erpIsLive = this.erpTools.erp.mode === 'LIVE';
    let resolution = erpIsLive ? null : await resolveLocal();
    if (!resolution || resolution.method === 'NOT_FOUND') {
      try {
        await this.erpTools.erp.findCustomer({ document: digits });
      } catch (err) {
        this.logger.warn(`[identity] Falha na busca por documento no ERP: ${err instanceof Error ? err.message : err}`);
      }
      resolution = await resolveLocal();
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
