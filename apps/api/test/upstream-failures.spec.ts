import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { PolicyEngineService } from '../src/policy/policy-engine.service';
import { ToolExecutorService } from '../src/tools/tool-executor.service';
import { ErpToolsService } from '../src/tools/erp-tools.service';
import { createBillingTool } from '../src/tools/erp-tools';
import { MockERPAdapter } from '../src/integrations/erp/mock-erp.adapter';
import { MockPulseISPAdapter } from '../src/integrations/pulseisp/mock-pulseisp.adapter';
import { KnowledgeService } from '../src/knowledge/knowledge.service';
import { MockAIProvider } from '../src/integrations/ai/mock-ai.provider';
import { ConversationService } from '../src/conversation/conversation.service';
import { IdentityResolutionService } from '../src/identity/identity-resolution.service';
import { AgentOrchestratorService } from '../src/agent/agent-orchestrator.service';
import { HandoffService } from '../src/handoff/handoff.service';
import { runWithTenant } from '../src/common/tenant-context';
import { createTestAgentRun } from './helpers/agent-run';
import { fixedAiResolver } from './helpers/ai-resolver';
import { FailingERPAdapter, SlowERPAdapter, FailingPulseISPAdapter, FailingAIProvider } from './doubles/failing-adapters';
import { RealtimeEventsService } from '../src/events/events.service';

/**
 * P1 "comportamento correto quando o AI Provider/ERP falha" (seção 11, itens 9 e 10) — nunca exercitado
 * antes desta suíte porque `MockERPAdapter`/`MockAIProvider` sempre funcionam. Aqui provamos o mesmo
 * invariante em cada camada: upstream cai → o sistema NUNCA inventa resultado → `ToolResult`/turno
 * refletem o erro de verdade → cliente recebe resposta apropriada → nenhuma mensagem é perdida.
 */
describe('P1 — comportamento quando um upstream falha', () => {
  let prisma: PrismaService;
  let db: TenantPrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    db = new TenantPrismaService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function freshPhone() {
    return `+55${randomUUID().replace(/\D/g, '').slice(0, 10)}`;
  }

  function buildOrchestrator(overrides: {
    erpTools?: ErpToolsService;
    pulseisp?: MockPulseISPAdapter | FailingPulseISPAdapter;
    ai?: MockAIProvider | FailingAIProvider;
  }) {
    const policy = new PolicyEngineService(db);
    const executor = new ToolExecutorService(db, policy);
    const erpTools = overrides.erpTools ?? new ErpToolsService(new MockERPAdapter(db));
    const knowledge = new KnowledgeService(db);
    const identity = new IdentityResolutionService(db);
    const conversation = new ConversationService(db, identity);
    const ai = overrides.ai ?? new MockAIProvider();
    const pulseisp = overrides.pulseisp ?? new MockPulseISPAdapter(db);
    const handoff = new HandoffService(db, new RealtimeEventsService());

    return new AgentOrchestratorService(db, conversation, executor, policy, erpTools, knowledge, fixedAiResolver(ai), pulseisp as any, handoff);
  }

  async function ask(orchestrator: AgentOrchestratorService, conversationId: string, message: string) {
    const decision = await orchestrator.handleMessage(conversationId, message);
    if (!decision) throw new Error('esperava AgentDecision, recebi null');
    return decision;
  }

  // ---- Nível ToolExecutorService (unidade) ----------------------------------------------------

  it('ToolExecutorService: adapter que rejeita vira ToolResult UPSTREAM_ERROR, nunca um resultado fabricado', async () => {
    const executor = new ToolExecutorService(db, new PolicyEngineService(db));
    const billingTool = createBillingTool(new FailingERPAdapter());

    const result = await runWithTenant('tnt_demo_alpha', async () => {
      const agentRunId = await createTestAgentRun(db, freshPhone());
      return executor.run(billingTool, { contractId: 'ctt_demo_a' }, { agentRunId });
    });

    expect(result.status).toBe('UPSTREAM_ERROR');
    expect(result.data).toBeUndefined();
    expect(result.facts).toHaveLength(0);
    expect(result.error?.code).toBe('UPSTREAM_ERROR');

    const stored = await runWithTenant('tnt_demo_alpha', () =>
      db.client.toolCall.findUnique({ where: { id: result.toolCallId } }),
    );
    expect(stored?.status).toBe('UPSTREAM_ERROR');
  });

  it('ToolExecutorService: adapter mais lento que o timeout vira ToolResult TIMEOUT, não trava o turno', async () => {
    const executor = new ToolExecutorService(db, new PolicyEngineService(db));
    const billingTool = createBillingTool(new SlowERPAdapter(500));

    const result = await runWithTenant('tnt_demo_alpha', async () => {
      const agentRunId = await createTestAgentRun(db, freshPhone());
      return executor.run(billingTool, { contractId: 'ctt_demo_a' }, { agentRunId, timeoutMs: 50 });
    });

    expect(result.status).toBe('TIMEOUT');
    expect(result.error?.code).toBe('TIMEOUT');
    expect(result.facts).toHaveLength(0);
  });

  // ---- Nível AgentOrchestratorService (turno completo) -----------------------------------------

  it('ERP fora do ar: pergunta financeira nunca inventa dado, vira HANDOFF, cliente recebe resposta (não silêncio)', async () => {
    const erpTools = new ErpToolsService(new FailingERPAdapter());
    const orchestrator = buildOrchestrator({ erpTools });

    const decision = await runWithTenant('tnt_demo_alpha', async () => {
      const conv = await db.client.conversation.create({
        data: { tenantId: 'tnt_demo_alpha', channel: 'WEBCHAT', channelUserId: '+5511999990002', status: 'AI_ACTIVE' },
      });
      return ask(orchestrator, conv.id, 'minha fatura está certa? queria conferir o valor');
    });

    // Nenhum Claim FACT existe (o invariante da seção 3.4 nunca deixaria passar um fato sem
    // ToolResult real por trás, e aqui não existe nenhum ToolResult OK).
    expect(decision.claims.filter((c) => c.type === 'FACT')).toHaveLength(0);
    expect(decision.outcome).toBe('HANDOFF');

    const toolCalls = await runWithTenant('tnt_demo_alpha', () =>
      db.client.toolCall.findMany({ where: { id: { in: decision.toolCalls } } }),
    );
    expect(toolCalls.every((c) => c.status === 'UPSTREAM_ERROR')).toBe(true);

    // Handoff foi de fato criado — "eventualmente handoff" não é só o outcome, é um registro real na fila.
    const handoff = await runWithTenant('tnt_demo_alpha', () =>
      db.client.handoff.findFirst({ where: { conversationId: decision.conversationId, status: 'PENDING' } }),
    );
    expect(handoff).not.toBeNull();

    // Nenhuma mensagem é perdida: o cliente recebe uma resposta real, não fica sem nada.
    const lastMessage = await runWithTenant('tnt_demo_alpha', () =>
      db.client.message.findFirst({
        where: { conversationId: decision.conversationId, role: { in: ['AGENT', 'SYSTEM'] } },
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(lastMessage).not.toBeNull();
    expect(lastMessage!.content.length).toBeGreaterThan(0);
  });

  it('PulseISP fora do ar (com a flag ligada): problema de rede nunca inventa diagnóstico, vira HANDOFF', async () => {
    const originalFlag = process.env.ISPAGENT_PULSEISP_ENABLED;
    process.env.ISPAGENT_PULSEISP_ENABLED = 'true';

    try {
      const orchestrator = buildOrchestrator({ pulseisp: new FailingPulseISPAdapter() });

      const decision = await runWithTenant('tnt_demo_alpha', async () => {
        const conv = await db.client.conversation.create({
          data: { tenantId: 'tnt_demo_alpha', channel: 'WEBCHAT', channelUserId: '+5511999990003', status: 'AI_ACTIVE' },
        });
        return ask(orchestrator, conv.id, 'minha internet está caindo toda hora, pode verificar?');
      });

      expect(decision.claims.filter((c) => c.type === 'FACT')).toHaveLength(0);
      expect(decision.outcome).toBe('HANDOFF');

      const toolCalls = await runWithTenant('tnt_demo_alpha', () =>
        db.client.toolCall.findMany({ where: { id: { in: decision.toolCalls } } }),
      );
      expect(toolCalls.some((c) => c.status === 'UPSTREAM_ERROR')).toBe(true);
    } finally {
      process.env.ISPAGENT_PULSEISP_ENABLED = originalFlag;
    }
  });

  it('AI Provider fora do ar em classifyIntent: mensagem do cliente não se perde, vira HANDOFF com aviso (SYSTEM), sem chamar ferramenta nenhuma', async () => {
    const orchestrator = buildOrchestrator({ ai: new FailingAIProvider({ failClassify: true, failCompose: true }) });

    const decision = await runWithTenant('tnt_demo_alpha', async () => {
      const conv = await db.client.conversation.create({
        data: { tenantId: 'tnt_demo_alpha', channel: 'WEBCHAT', channelUserId: freshPhone(), status: 'AI_ACTIVE' },
      });
      return ask(orchestrator, conv.id, 'oi, minha internet caiu, socorro');
    });

    expect(decision.outcome).toBe('HANDOFF');
    // Sem classificação confiável, nenhuma ferramenta é chamada — não arriscamos agir com base numa
    // intenção que pode estar errada (a classificação real falhou).
    expect(decision.toolCalls).toHaveLength(0);
    expect(decision.claims).toHaveLength(0);

    const handoff = await runWithTenant('tnt_demo_alpha', () =>
      db.client.handoff.findFirst({ where: { conversationId: decision.conversationId, status: 'PENDING' } }),
    );
    expect(handoff).not.toBeNull();

    // A mensagem do cliente foi persistida (nunca se perde) e o aviso de indisponibilidade vem como
    // SYSTEM, não como se a IA tivesse "respondido" normalmente.
    const messages = await runWithTenant('tnt_demo_alpha', () =>
      db.client.message.findMany({ where: { conversationId: decision.conversationId }, orderBy: { createdAt: 'asc' } }),
    );
    expect(messages.some((m) => m.role === 'CUSTOMER' && m.content.includes('minha internet caiu'))).toBe(true);
    const systemMessage = messages.find((m) => m.role === 'SYSTEM');
    expect(systemMessage).toBeDefined();
    expect(systemMessage!.content.length).toBeGreaterThan(0);
  });

  it('AI Provider fora do ar só em composeReply (classifica bem, mas não consegue fraseiar): ferramenta já executada não vira resposta inventada, vira HANDOFF mesmo assim', async () => {
    const orchestrator = buildOrchestrator({ ai: new FailingAIProvider({ failClassify: false, failCompose: true }) });

    const decision = await runWithTenant('tnt_demo_alpha', async () => {
      const conv = await db.client.conversation.create({
        data: { tenantId: 'tnt_demo_alpha', channel: 'WEBCHAT', channelUserId: '+5511999990001', status: 'AI_ACTIVE' },
      });
      return ask(orchestrator, conv.id, 'quero ver minha fatura');
    });

    // A ferramenta rodou normalmente (MockERPAdapter, cus_demo_a) e o Claim tem evidência real — o
    // problema é só na hora de fraseiar pro cliente, e mesmo assim o outcome final precisa refletir
    // que a resposta não chegou a ser composta de verdade.
    expect(decision.outcome).toBe('HANDOFF');

    const handoff = await runWithTenant('tnt_demo_alpha', () =>
      db.client.handoff.findFirst({ where: { conversationId: decision.conversationId, status: 'PENDING' } }),
    );
    expect(handoff).not.toBeNull();

    const systemMessage = await runWithTenant('tnt_demo_alpha', () =>
      db.client.message.findFirst({ where: { conversationId: decision.conversationId, role: 'SYSTEM' } }),
    );
    expect(systemMessage).not.toBeNull();
  });
});
