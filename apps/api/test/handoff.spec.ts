import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { PolicyEngineService } from '../src/policy/policy-engine.service';
import { ToolExecutorService } from '../src/tools/tool-executor.service';
import { MockERPAdapter } from '../src/integrations/erp/mock-erp.adapter';
import { ErpToolsService } from '../src/tools/erp-tools.service';
import { MockPulseISPAdapter } from '../src/integrations/pulseisp/mock-pulseisp.adapter';
import { KnowledgeService } from '../src/knowledge/knowledge.service';
import { MockAIProvider } from '../src/integrations/ai/mock-ai.provider';
import { ConversationService } from '../src/conversation/conversation.service';
import { IdentityResolutionService } from '../src/identity/identity-resolution.service';
import { AgentOrchestratorService } from '../src/agent/agent-orchestrator.service';
import { HandoffService } from '../src/handoff/handoff.service';
import { runWithTenant } from '../src/common/tenant-context';
import { fixedAiResolver } from './helpers/ai-resolver';

/**
 * P0.5 — handoff gera resumo, entra na fila, atendente assume e a IA para de responder; teste de que
 * nova mensagem não gera AgentRun após takeover. Transições AI → HUMAN → AI auditadas.
 */
describe('Handoff', () => {
  let prisma: PrismaService;
  let db: TenantPrismaService;
  let handoff: HandoffService;
  let orchestrator: AgentOrchestratorService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    db = new TenantPrismaService(prisma);
    handoff = new HandoffService(db);

    const policy = new PolicyEngineService(db);
    const executor = new ToolExecutorService(db, policy);
    const erp = new MockERPAdapter(db);
    const erpTools = new ErpToolsService(erp);
    const knowledge = new KnowledgeService(db);
    const identity = new IdentityResolutionService(db);
    const conversation = new ConversationService(db, identity);
    const ai = new MockAIProvider();
    const pulseisp = new MockPulseISPAdapter(db);

    orchestrator = new AgentOrchestratorService(db, conversation, executor, policy, erpTools, knowledge, fixedAiResolver(ai), pulseisp, handoff);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function freshPhone() {
    return `+55${randomUUID().replace(/\D/g, '').slice(0, 10)}`;
  }

  async function ask(conversationId: string, message: string) {
    return orchestrator.handleMessage(conversationId, message);
  }

  it('P0.5 — identidade ambígua vira HANDOFF real: fila recebe resumo estruturado', async () => {
    const { conversationId, decision } = await runWithTenant('tnt_demo_alpha', async () => {
      const conv = await db.client.conversation.create({
        data: { tenantId: 'tnt_demo_alpha', channel: 'WEBCHAT', channelUserId: '+5511999990007', status: 'AI_ACTIVE' },
      });
      const decision = await ask(conv.id, 'quero ver minha fatura, por favor');
      return { conversationId: conv.id, decision };
    });

    expect(decision?.outcome).toBe('HANDOFF');

    const record = await runWithTenant('tnt_demo_alpha', () =>
      db.client.handoff.findFirst({ where: { conversationId } }),
    );
    expect(record).not.toBeNull();
    expect(record?.status).toBe('PENDING');

    const summary = record?.summary as {
      reason: string; customerId: string | null; intent: string; reportedProblem: string;
      toolsConsulted: Array<{ tool: string; result: string }>; suggestedNextAction: string;
    };
    expect(summary.customerId).toBeNull();
    expect(summary.reportedProblem).toContain('fatura');
    expect(summary.reason).toBeTruthy();
    expect(summary.suggestedNextAction).toBeTruthy();

    const conv = await runWithTenant('tnt_demo_alpha', () =>
      db.client.conversation.findUniqueOrThrow({ where: { id: conversationId } }),
    );
    expect(conv.status).toBe('HANDOFF_PENDING');
  });

  it('criar handoff é idempotente por conversa: não duplica entrada na fila', async () => {
    const conversationId = await runWithTenant('tnt_demo_alpha', async () => {
      const conv = await db.client.conversation.create({
        data: { tenantId: 'tnt_demo_alpha', channel: 'WEBCHAT', channelUserId: freshPhone(), status: 'AI_ACTIVE' },
      });
      return conv.id;
    });

    const summary = {
      reason: 'teste', customerId: null, contractId: null, intent: 'OUTRO', reportedProblem: 'x',
      toolsConsulted: [], actionsTaken: [], actionsFailed: [], suggestedNextAction: 'y',
    };

    await runWithTenant('tnt_demo_alpha', () => handoff.createHandoff(conversationId, 'teste', summary));
    await runWithTenant('tnt_demo_alpha', () => handoff.createHandoff(conversationId, 'teste', summary));

    const count = await runWithTenant('tnt_demo_alpha', () =>
      db.client.handoff.count({ where: { conversationId } }),
    );
    expect(count).toBe(1);
  });

  it('P0.5 — atendente assume: IA para de responder, nova mensagem não gera AgentRun', async () => {
    const { conversationId, handoffId } = await runWithTenant('tnt_demo_alpha', async () => {
      const conv = await db.client.conversation.create({
        data: { tenantId: 'tnt_demo_alpha', channel: 'WEBCHAT', channelUserId: freshPhone(), status: 'AI_ACTIVE' },
      });
      const h = await handoff.createHandoff(
        conv.id,
        'teste manual',
        { reason: 'x', customerId: null, contractId: null, intent: 'OUTRO', reportedProblem: 'y', toolsConsulted: [], actionsTaken: [], actionsFailed: [], suggestedNextAction: 'z' },
      );
      return { conversationId: conv.id, handoffId: h.id };
    });

    const runsBefore = await runWithTenant('tnt_demo_alpha', () =>
      db.client.agentRun.count({ where: { conversationId } }),
    );

    await runWithTenant('tnt_demo_alpha', () => handoff.assume(handoffId, 'usr_operador_alpha'));

    const convAfterAssume = await runWithTenant('tnt_demo_alpha', () =>
      db.client.conversation.findUniqueOrThrow({ where: { id: conversationId } }),
    );
    expect(convAfterAssume.status).toBe('HUMAN_ACTIVE');

    const decision = await runWithTenant('tnt_demo_alpha', () => ask(conversationId, 'mais uma mensagem do cliente'));
    expect(decision).toBeNull();

    const runsAfter = await runWithTenant('tnt_demo_alpha', () =>
      db.client.agentRun.count({ where: { conversationId } }),
    );
    expect(runsAfter).toBe(runsBefore); // nenhum AgentRun novo depois do takeover

    // a mensagem do cliente ainda é registrada, mesmo com a IA em silêncio.
    const messages = await runWithTenant('tnt_demo_alpha', () =>
      db.client.message.findMany({ where: { conversationId } }),
    );
    expect(messages.some((m) => m.content === 'mais uma mensagem do cliente')).toBe(true);
  });

  it('P0.5 — AI → HUMAN → AI: devolver ao agente reativa AgentRun na próxima mensagem', async () => {
    const { conversationId, handoffId } = await runWithTenant('tnt_demo_alpha', async () => {
      const conv = await db.client.conversation.create({
        data: { tenantId: 'tnt_demo_alpha', channel: 'WEBCHAT', channelUserId: freshPhone(), status: 'AI_ACTIVE' },
      });
      const h = await handoff.createHandoff(
        conv.id,
        'teste manual',
        { reason: 'x', customerId: null, contractId: null, intent: 'OUTRO', reportedProblem: 'y', toolsConsulted: [], actionsTaken: [], actionsFailed: [], suggestedNextAction: 'z' },
      );
      await handoff.assume(h.id, 'usr_operador_alpha');
      return { conversationId: conv.id, handoffId: h.id };
    });

    await runWithTenant('tnt_demo_alpha', () => handoff.returnToAI(handoffId, 'usr_operador_alpha'));

    const convAfterReturn = await runWithTenant('tnt_demo_alpha', () =>
      db.client.conversation.findUniqueOrThrow({ where: { id: conversationId } }),
    );
    expect(convAfterReturn.status).toBe('AI_ACTIVE');

    const decision = await runWithTenant('tnt_demo_alpha', () => ask(conversationId, 'internet lenta de novo'));
    expect(decision).not.toBeNull();

    const record = await runWithTenant('tnt_demo_alpha', () =>
      db.client.handoff.findUniqueOrThrow({ where: { id: handoffId } }),
    );
    expect(record.status).toBe('RETURNED_TO_AI');
    expect(record.assumedAt).not.toBeNull();
    expect(record.returnedAt).not.toBeNull();
  });

  it('fila de handoff é isolada por tenant', async () => {
    const alphaQueue = await runWithTenant('tnt_demo_alpha', () => handoff.listQueue('PENDING'));
    const betaQueue = await runWithTenant('tnt_demo_beta', () => handoff.listQueue('PENDING'));

    const alphaIds = new Set(alphaQueue.map((h) => h.id));
    for (const h of betaQueue) {
      expect(alphaIds.has(h.id)).toBe(false);
    }
  });

  it('transições de handoff são auditadas (created, assumed, returned_to_ai)', async () => {
    const { conversationId, handoffId } = await runWithTenant('tnt_demo_alpha', async () => {
      const conv = await db.client.conversation.create({
        data: { tenantId: 'tnt_demo_alpha', channel: 'WEBCHAT', channelUserId: freshPhone(), status: 'AI_ACTIVE' },
      });
      const h = await handoff.createHandoff(
        conv.id,
        'teste auditoria',
        { reason: 'x', customerId: null, contractId: null, intent: 'OUTRO', reportedProblem: 'y', toolsConsulted: [], actionsTaken: [], actionsFailed: [], suggestedNextAction: 'z' },
      );
      await handoff.assume(h.id, 'usr_operador_alpha');
      await handoff.returnToAI(h.id, 'usr_operador_alpha');
      return { conversationId: conv.id, handoffId: h.id };
    });

    const logs = await runWithTenant('tnt_demo_alpha', () =>
      db.client.auditLog.findMany({ where: { entityId: handoffId }, orderBy: { createdAt: 'asc' } }),
    );
    const actions = logs.map((l) => l.action);
    expect(actions).toEqual(['handoff.created', 'handoff.assumed', 'handoff.returned_to_ai']);
  });
});
