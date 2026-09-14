import { Inject, Injectable } from '@nestjs/common';
import { AgentDecision, Claim, Intent, PolicyDecision, ToolResult } from '@ispagent/shared';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { currentTenantId } from '../common/tenant-context';
import { ConversationService } from '../conversation/conversation.service';
import { ToolExecutorService } from '../tools/tool-executor.service';
import { PolicyEngineService } from '../policy/policy-engine.service';
import { ErpToolsService } from '../tools/erp-tools.service';
import { createKnowledgeSearchTool } from '../knowledge/knowledge-tool';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { AI_PROVIDER, AIProvider } from '../integrations/ai/ai-provider.interface';
import { ClaimValidatorService, ClaimInvariantViolationError } from './claim-validator.service';

const PROMPT_VERSION = 'agent-v1-2026-09-14';

const ACCOUNT_INTENTS: Intent[] = [
  'FINANCEIRO', 'SEGUNDA_VIA', 'PAGAMENTO', 'BLOQUEIO', 'PLANO', 'CHAMADO', 'STATUS_CHAMADO',
];

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

  constructor(
    private readonly db: TenantPrismaService,
    private readonly conversation: ConversationService,
    private readonly executor: ToolExecutorService,
    private readonly policy: PolicyEngineService,
    private readonly erpTools: ErpToolsService,
    private readonly knowledgeService: KnowledgeService,
    @Inject(AI_PROVIDER) private readonly ai: AIProvider,
  ) {}

  async handleMessage(conversationId: string, customerMessage: string): Promise<AgentDecision> {
    const tenantId = currentTenantId();
    if (!tenantId) throw new Error('[agent-orchestrator] requer contexto de tenant ativo.');

    await this.conversation.appendMessage(conversationId, 'CUSTOMER', customerMessage);

    const identityResult = await this.conversation.resolveIdentity(conversationId);
    const classification = await this.ai.classifyIntent(customerMessage);

    const agentRun = await this.db.client.agentRun.create({
      data: {
        tenantId,
        conversationId,
        intent: classification.intent,
        intentConfidence: classification.confidence,
        promptVersion: PROMPT_VERSION,
        model: this.ai.model,
        mode: this.ai.mode,
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

    if (accountAvailable && ACCOUNT_INTENTS.includes(classification.intent)) {
      const dispatch = this.selectAccountTool(classification.intent);
      const decision = await this.policy.evaluate(dispatch.action);
      policyDecisions.push(decision);

      const toolResult = await this.executeAccountTool(
        dispatch.kind,
        agentRun.id,
        identifiedContractId as string,
        identifiedCustomerId as string,
        customerMessage,
      );
      toolResults.push(toolResult);
    } else {
      const kbTool = createKnowledgeSearchTool(this.knowledgeService);
      const decision = await this.policy.evaluate(kbTool.action);
      policyDecisions.push(decision);
      toolResults.push(await this.executor.run(kbTool, { query: customerMessage }, { agentRunId: agentRun.id }));
    }

    const claims = this.buildClaims(toolResults);

    let outcome: AgentDecision['outcome'];
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

    const primaryResult = toolResults[0];
    const replyText = await this.ai.composeReply({
      intent: classification.intent,
      customerName: null,
      facts: primaryResult?.status === 'OK' ? primaryResult.facts.map((f) => ({ label: f.label, value: f.value })) : [],
      toolStatus: primaryResult ? primaryResult.status : null,
    });

    await this.conversation.appendMessage(conversationId, 'AGENT', replyText);

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
      model: this.ai.model,
      mode: this.ai.mode,
    };
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
}
