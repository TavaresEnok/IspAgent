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
import { HandoffService } from '../handoff/handoff.service';
import { ClaimValidatorService, ClaimInvariantViolationError } from './claim-validator.service';
import { IdentityResolution, IdentityResolutionService, normalizeDocument } from '../identity/identity-resolution.service';
import { MockAIProvider } from '../integrations/ai/mock-ai.provider';
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

const AFFIRMATIVE = /^\s*(sim|s|pode|pode sim|pode abrir|quero|claro|ok|okay|beleza|blz|por favor|abre|abra|isso|isso mesmo|manda|bora)(?!\p{L})/iu;
const NEGATIVE = /^\s*(n[ãa]o|nao|n|agora n[ãa]o|obrigad[oa]|valeu|deixa|tudo bem)(?!\p{L})/iu;
const FOLLOW_UP_WINDOW_MS = 30 * 60_000;

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
      // Só documento completo (CPF/CNPJ), exato e único identifica alguém pelo chat — nunca nome, código
      // ou trecho de texto (isso já foi uma porta aberta para ver a conta de outra pessoa).
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
    let aiFailed = false;
    try {
      classification = await ai.classifyIntent(customerMessage);
    } catch (err) {
      this.logger.error(
        `classifyIntent (${ai.name}) falhou — escalando para humano sem adivinhar intenção: ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
      classification = { intent: 'OUTRO', confidence: 'LOW' };
      aiFailed = true;
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

    // Continuação: "que sinal?", "sim", "não" logo depois de um diagnóstico de rede. Sem isso cada mensagem
    // era tratada isolada e o agente "esquecia" a própria pergunta ("quer que eu abra um chamado?").
    let followUp = false;
    let declined = false;
    if (!aiFailed && classification.intent === 'OUTRO') {
      const since = new Date(Date.now() - FOLLOW_UP_WINDOW_MS);
      // Uma das últimas falas do agente oferecendo chamado ("quer que eu abra um chamado?") — vale mesmo que no
      // meio o cliente tenha perguntado outra coisa.
      const recentAgentReplies = await this.db.client.message.findMany({
        where: { conversationId, role: 'AGENT', createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 3,
      });
      const offeredTicket = recentAgentReplies.some((m) => /chamado/i.test(m.content) && m.content.includes('?'));
      const lastNetworkRun = await this.db.client.agentRun.findFirst({
        where: { conversationId, createdAt: { gte: since }, intent: { in: NETWORK_INTENTS } },
        orderBy: { createdAt: 'desc' },
      });

      if (offeredTicket && AFFIRMATIVE.test(customerMessage)) {
        classification = { intent: 'CHAMADO', confidence: 'MEDIUM' };
      } else if (offeredTicket && NEGATIVE.test(customerMessage)) {
        declined = true;
      } else if (lastNetworkRun && !AFFIRMATIVE.test(customerMessage) && !NEGATIVE.test(customerMessage)) {
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

    const needsAccountOrNetwork =
      ACCOUNT_INTENTS.includes(classification.intent) ||
      NETWORK_INTENTS.includes(classification.intent);

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
    } else if (!aiFailed && accountAvailable && ACCOUNT_INTENTS.includes(classification.intent)) {
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
    } else if (!aiFailed && accountAvailable && NETWORK_INTENTS.includes(classification.intent) && (pulseIspEnabled() || realPulseContract)) {
      // P0.4: só entra aqui quando a flag está ligada — desligada, cai no ramo de KnowledgeTool abaixo,
      // exatamente como antes da Fase 7 (produto funciona sem PulseISP, seção 3.2).
      const pulseTool = realPulseContract ? this.pulseIspLiveTool : this.pulseIspTool;
      const decision = await this.policy.evaluate(pulseTool.action);
      policyDecisions.push(decision);
      toolResults.push(
        await this.executor.run(pulseTool, { contractId: identifiedContractId as string }, { agentRunId: agentRun.id }),
      );
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
        const replyFacts = primaryResult?.status === 'OK' ? primaryResult.facts.map((f) => ({ label: f.label, value: f.value })) : [];
        const history = await this.recentHistory(conversationId);
        const limits = await this.policy.getLimits();
        const replyInput = {
          intent: classification.intent,
          customerName: customerName,
          facts: replyFacts,
          toolStatus: primaryResult ? primaryResult.status : null,
          followUp,
          customerMessage,
          history,
          needsCpf,
          justIdentified,
          cpfNotFound: attemptedTerm,
          providerName: await this.providerName(tenantId),
          maxOutputTokens: limits.maxTokensPerTurn,
        };
        replyText = await ai.composeReply(replyInput);

        // O texto do LLM só sai se não afirmar nada além dos fatos; senão, resposta determinística.
        if (ai.mode === 'LIVE') {
          const verdict = checkReplyAgainstFacts(replyText, replyFacts, { customerMessage, history });
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

  /** Nome de exibição do provedor (tenant), sem sufixos técnicos como "(PulseISP real)". */
  private async providerName(tenantId: string): Promise<string | null> {
    const tenant = await this.db.client.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
    return tenant?.name.replace(/\s*\(.*\)\s*$/, '').trim() || null;
  }

  /**
   * Identificação por documento digitado no chat. Regras (seção 5.1: nunca vincular a um contrato
   * incerto): só CPF/CNPJ completo; match exato e único; com telefone ambíguo o documento precisa bater
   * TAMBÉM com um dos telefones candidatos; exatamente um contrato ativo; confiança no máximo MEDIUM
   * quando só o documento prova (o documento vaza com facilidade). Falhas são contadas por conversa e,
   * ao atingir `handoffAfterFailures` da policy, bloqueiam novas tentativas (contra adivinhação de CPF).
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
    const resolution =
      current.method === 'AMBIGUOUS'
        ? await this.identity.resolveByPhoneAndDocument(conversationRecord.channelUserId, digits)
        : await this.identity.resolveByDocument(digits);

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
