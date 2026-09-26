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
import { isPulseId, toPulseId } from '../integrations/pulseisp/pulseisp-ids';
import { PulseIspClient } from '../integrations/pulseisp/pulseisp-client.service';
import { PulseIspMirrorService } from '../integrations/pulseisp/pulseisp-mirror.service';
import { HandoffService } from '../handoff/handoff.service';
import { ClaimValidatorService, ClaimInvariantViolationError } from './claim-validator.service';
import {
  CANCELLATION_REASON_QUESTION,
  cancellationStep,
  humanRequestReply,
  isHumanRequest,
  isScopeQuestion,
  leadReply,
  scopeReply,
} from './quick-flows';

const PROMPT_VERSION = 'agent-v1-2026-09-14';

const ACCOUNT_INTENTS: Intent[] = [
  'FINANCEIRO', 'SEGUNDA_VIA', 'PAGAMENTO', 'BLOQUEIO', 'PLANO', 'CHAMADO', 'STATUS_CHAMADO',
];

const NETWORK_INTENTS: Intent[] = ['SEM_CONEXAO', 'INTERNET_LENTA', 'QUEDAS', 'SUPORTE_INTERNET'];

const MAX_IDENTIFICATION_ASKS = 2;
const IDENTITY_HANDOFF_MESSAGE =
  'Não consegui localizar o seu cadastro por aqui. Vou te passar para um atendente, que confirma os seus dados e continua o atendimento com você.';

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
  ) {
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

    const hasCustomer = 'customerId' in identityResult && Boolean(identityResult.customerId);

    if (!hasCustomer) {
      const dynamic = await this.tryDynamicIdentification(tenantId, customerMessage);
      if (dynamic?.identified && dynamic.customerId && dynamic.contractId) {
        await this.db.client.conversation.update({
          where: { id: conversationId },
          data: {
            customerId: dynamic.customerId,
            contractId: dynamic.contractId,
            identityMethod: 'DOCUMENT',
            identityConfidence: 'HIGH',
          },
        });
        identityResult = {
          method: 'DOCUMENT',
          confidence: 'HIGH',
          customerId: dynamic.customerId,
          contractId: dynamic.contractId,
        };
        customerName = dynamic.customerName ?? null;
        justIdentified = true;
      } else if (dynamic?.searchedTerm) {
        attemptedTerm = dynamic.searchedTerm;
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
    const companyName = tenantPolicy?.companyName || 'Vibe Telecom';
    const quick = { tenantId, conversationId, ai, identity: decisionIdentity, reportedProblem: customerMessage };

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
      const phone = conversationRecord.channelUserId;
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
    const wantsIdentification = !accountAvailable && (needsAccountOrNetwork || askedCpfPreviously || Boolean(attemptedTerm));
    // Já pedimos o documento duas vezes sem conseguir identificar: para de insistir e passa para um atendente.
    const cpfAsks = recentAgentReplies.filter((m) => /cpf|cnpj/i.test(m.content)).length;
    const identityExhausted = wantsIdentification && cpfAsks >= MAX_IDENTIFICATION_ASKS;
    const needsCpf = wantsIdentification && !identityExhausted;

    // Se a classificação falhou, não escolhemos ferramenta nenhuma a partir dela — `toolResults`/
    // `policyDecisions` ficam vazios e o turno vai direto pro caminho de HANDOFF abaixo.
    if (declined || identityExhausted) {
      // nada a consultar
    } else if (needsCpf) {
      // Cliente ainda não identificado: não faz busca de KB inútil nem gera handoff.
      // O bot vai solicitar ou reiterar a necessidade do CPF para poder dar prosseguimento.
    } else if (!aiFailed && accountAvailable && hasNetwork && hasAccount) {
      // Cenário Multi-Intent: diagnóstico de rede (PulseISP ou base de conhecimento) + consulta de conta
      if (pulseIspEnabled() || realPulseContract) {
        const pulseTool = realPulseContract ? this.pulseIspLiveTool : this.pulseIspTool;
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
        const pulseTool = realPulseContract ? this.pulseIspLiveTool : this.pulseIspTool;
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
    } else if (identityExhausted) {
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
      const summary = aiFailed
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
              ...this.buildHandoffSummary(classification.intent, identifiedCustomerId, identifiedContractId, customerMessage, toolResults),
              reason: 'Não foi possível identificar o cliente: o documento foi pedido duas vezes sem localizar um cadastro único.',
              suggestedNextAction: 'Confirmar a identidade do cliente (CPF/CNPJ do titular) e seguir com o pedido.',
            }
          : this.buildHandoffSummary(classification.intent, identifiedCustomerId, identifiedContractId, customerMessage, toolResults);
      await this.handoff.createHandoff(conversationId, summary.reason, summary);
    }

    const primaryResult = toolResults[0];
    let replyText: string;
    if (aiFailed) {
      replyText = AI_PROVIDER_FAILURE_MESSAGE;
    } else if (declined) {
      replyText = DECLINED_MESSAGE;
    } else if (identityExhausted) {
      replyText = IDENTITY_HANDOFF_MESSAGE;
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

        replyText = await ai.composeReply({
          intent: classification.intent,
          customerName: customerName,
          facts: allFacts,
          toolStatus: primaryResult ? primaryResult.status : null,
          followUp,
          customerMessage,
          history: await this.recentHistory(conversationId),
          needsCpf,
          justIdentified,
          cpfNotFound: attemptedTerm,
          persona: {
            companyName: tenantPolicy?.companyName || 'Vibe Telecom',
            assistantName: tenantPolicy?.assistantName || 'Assistente Virtual',
            tone: tenantPolicy?.tone || 'caloroso, educado, empático e resolutivo (2 a 4 frases)',
            customRules: tenantPolicy?.customRules || undefined,
            supportHours: tenantPolicy?.supportHours || 'Segunda a Sexta, 08h às 18h',
            canCreateTicket,
          },
          summary: conv?.summary,
          intents: detectedIntents,
        });
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

  /** Últimas falas (cliente/agente) antes da mensagem atual, mais antiga primeiro — contexto para a IA. */
  /** Turno resolvido sem ferramenta: registra o AgentRun, abre handoff se for o caso e responde. */
  private async finishQuickTurn(
    ctx: {
      tenantId: string;
      conversationId: string;
      ai: { model: string; mode: AgentDecision['mode'] };
      identity: AgentDecision['identity'];
      reportedProblem: string;
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

    await this.conversation.appendMessage(ctx.conversationId, 'AGENT', turn.reply);

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

  /**
   * Tenta identificar o cliente dinamicamente a partir do texto da mensagem enviada no chat.
   * Suporta busca por CPF/CNPJ, telefone, código de cliente/contrato, login PPPoE ou nome.
   */
  private async tryDynamicIdentification(
    tenantId: string,
    message: string,
  ): Promise<{
    identified: boolean;
    customerId?: string;
    contractId?: string;
    customerName?: string;
    searchedTerm?: string;
  } | null> {
    const terms: string[] = [];
    let explicitIdentifier: string | null = null;

    // 1. CPF ou CNPJ (com ou sem pontuação)
    const docMatch =
      message.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/) ||
      message.match(/\b\d{11}\b/) ||
      message.match(/\b\d{14}\b/);
    if (docMatch) {
      const cleanDoc = docMatch[0].replace(/\D/g, '');
      terms.push(cleanDoc);
      explicitIdentifier = cleanDoc;
    }

    // 2. Telefone com DDD (10 ou 11 dígitos, ex.: 81982648003 ou (81) 98264-8003)
    const phoneMatch = message.match(/\b(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-\s]?\d{4}\b/);
    if (phoneMatch) {
      const cleanPhone = phoneMatch[0].replace(/\D/g, '');
      if ((cleanPhone.length === 10 || cleanPhone.length === 11) && !terms.includes(cleanPhone)) {
        terms.push(cleanPhone);
        explicitIdentifier = explicitIdentifier || cleanPhone;
      }
    }

    // 3. Código do cliente / contrato numérico (4 a 8 dígitos)
    const codeMatch =
      message.match(/\b(?:c[oó]digo|contrato|cliente|id)[:\s]+([0-9]+)\b/i) ||
      (message.trim().length <= 8 && message.trim().match(/^\d{4,8}$/));
    if (codeMatch) {
      const cleanCode = codeMatch[1] || codeMatch[0];
      if (!terms.includes(cleanCode)) {
        terms.push(cleanCode);
        explicitIdentifier = explicitIdentifier || cleanCode;
      }
    }

    // 4. Login declarado. Nome NÃO identifica (P0.7): "sou o João" vincularia o primeiro João do cadastro
    // e mostraria a fatura de outra pessoa.
    const introMatches = [
      /meu (?:login|usu[aá]rio) [eé]\s+([a-zA-Z0-9._-]+)/i,
      /login[:\s]+([a-zA-Z0-9._-]+)/i,
    ];

    for (const regex of introMatches) {
      const match = message.match(regex);
      if (match && match[1]) {
        const clean = match[1].trim().replace(/[.,!?;]+$/, '');
        if (clean.length >= 3 && !terms.includes(clean)) {
          terms.push(clean);
          explicitIdentifier = explicitIdentifier || clean;
        }
      }
    }

    // 5. Mensagem curta que parece um login (tem letra e dígito, sem espaço) — nunca um nome solto.
    const trimmed = message.trim().replace(/[.,!?;]+$/, '');
    const looksLikeLogin = /^(?=.*\d)(?=.*[a-zA-Z])[a-zA-Z0-9._-]+$/.test(trimmed);
    const isDescriptiveOrProblem =
      /(?:internet|sinal|ruim|lent[oa]|queda|caindo|caiu|fatura|boleto|bloqueio|plano|chamado|visita|t[eé]cnico|suporte|modem|roteador|fibra|conectar|conex[aã]o|ajuda|funciona|preciso|quero|meu|minha|n[aã]o|problema|ol[aá]|bom dia|boa tarde|boa noite|teste)/i;

    if (
      trimmed.length >= 3 &&
      trimmed.length <= 40 &&
      !terms.includes(trimmed) &&
      !isDescriptiveOrProblem.test(trimmed) &&
      looksLikeLogin
    ) {
      terms.push(trimmed);
    }

    // Banco local: só identificador exato e só se apontar para UM cliente (ambíguo nunca vincula).
    for (const term of terms) {
      const matches = await this.db.client.customer.findMany({
        where: {
          OR: [{ document: term }, { externalId: term }, { phones: { has: term } }],
        },
        include: { contracts: { where: { status: 'ACTIVE' } } },
        take: 2,
      });
      const localCust = matches.length === 1 ? matches[0] : null;
      if (localCust && localCust.contracts.length > 0) {
        return {
          identified: true,
          customerId: localCust.id,
          contractId: localCust.contracts[0].id,
          customerName: localCust.name,
        };
      }
    }

    // Tentar buscar via ERP ativo (ex.: SGP)
    if (this.erpTools?.erp) {
      for (const term of terms) {
        try {
          const isDoc = /^\d{11}$|^\d{14}$/.test(term);
          const isPhone = /^\d{10,11}$/.test(term);
          const found = await this.erpTools.erp.findCustomer({
            document: isDoc ? term : undefined,
            phone: isPhone ? term : undefined,
            contractId: !isDoc && !isPhone ? term : undefined,
          });
          if (found) {
            const contracts = await this.erpTools.erp.getContracts(found.id);
            const activeContract = contracts.find((c) => c.status === 'ACTIVE') || contracts[0];
            if (activeContract) {
              return {
                identified: true,
                customerId: found.id,
                contractId: activeContract.id,
                customerName: found.name,
              };
            }
          }
        } catch (err) {
          this.logger.warn(`Falha na busca dinâmica de cliente no ERP para '${term}': ${err}`);
        }
      }
    }

    // Se não achou no ERP, tentar buscar no PulseISP (telemetria real da Vibe Telecom)
    if (this.pulseClient && this.mirror) {
      for (const term of terms) {
        try {
          const results = await this.pulseClient.searchCustomers(tenantId, term);
          // Busca do PulseISP é textual: só aceita quando devolve exatamente um cliente.
          if (results?.items?.length === 1) {
            const chosen = results.items[0];
            const c360 = await this.pulseClient.customer360(tenantId, chosen.id);
            const mirrored = await this.mirror.upsertFromCustomer360(tenantId, c360);
            return {
              identified: true,
              customerId: mirrored.contractId,
              contractId: mirrored.contractId,
              customerName: mirrored.customerName,
            };
          }
        } catch (err) {
          this.logger.warn(`Falha na busca dinâmica de cliente no PulseISP para '${term}': ${err}`);
        }
      }
    }

    if (explicitIdentifier) {
      return {
        identified: false,
        searchedTerm: explicitIdentifier,
      };
    }

    return null;
  }
}
