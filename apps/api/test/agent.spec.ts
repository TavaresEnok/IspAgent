import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { PolicyEngineService } from '../src/policy/policy-engine.service';
import { ToolExecutorService } from '../src/tools/tool-executor.service';
import { MockERPAdapter } from '../src/integrations/erp/mock-erp.adapter';
import { ErpToolsService } from '../src/tools/erp-tools.service';
import { MockPulseISPAdapter } from '../src/integrations/pulseisp/mock-pulseisp.adapter';
import { HandoffService } from '../src/handoff/handoff.service';
import { KnowledgeService } from '../src/knowledge/knowledge.service';
import { MockAIProvider } from '../src/integrations/ai/mock-ai.provider';
import { ConversationService } from '../src/conversation/conversation.service';
import { IdentityResolutionService } from '../src/identity/identity-resolution.service';
import { AgentOrchestratorService } from '../src/agent/agent-orchestrator.service';
import { runWithTenant } from '../src/common/tenant-context';

/**
 * Agent Orchestrator ponta a ponta (seção 3.3): mensagem → identidade → intenção → ferramenta permitida
 * → resposta, com o invariante de Claim (seção 3.4) valendo de verdade dentro do fluxo real, não só
 * isolado em claims.spec.ts. Roda inteiro em modo DEMO (MockAIProvider + MockERPAdapter) — sem chave
 * de IA nesta sessão, é o único caminho testável, exatamente como a seção 6.4 prevê.
 */
describe('AgentOrchestratorService', () => {
  let prisma: PrismaService;
  let db: TenantPrismaService;
  let orchestrator: AgentOrchestratorService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    db = new TenantPrismaService(prisma);

    const policy = new PolicyEngineService(db);
    const executor = new ToolExecutorService(db, policy);
    const erp = new MockERPAdapter(db);
    const erpTools = new ErpToolsService(erp);
    const knowledge = new KnowledgeService(db);
    const identity = new IdentityResolutionService(db);
    const conversation = new ConversationService(db, identity);
    const ai = new MockAIProvider();
    const pulseisp = new MockPulseISPAdapter(db);
    const handoff = new HandoffService(db);

    orchestrator = new AgentOrchestratorService(db, conversation, executor, policy, erpTools, knowledge, ai, pulseisp, handoff);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function freshPhone() {
    return `+55${randomUUID().replace(/\D/g, '').slice(0, 10)}`;
  }

  // Nenhum destes testes envolve uma conversa já com humano assumido, então handleMessage nunca deveria
  // devolver null aqui — o wrapper só torna essa premissa explícita e evita `!` espalhado nos testes.
  async function ask(conversationId: string, message: string) {
    const decision = await orchestrator.handleMessage(conversationId, message);
    if (!decision) throw new Error('esperava AgentDecision, recebi null (conversa em HUMAN_ACTIVE?)');
    return decision;
  }

  it('pergunta financeira de cliente identificado (cus_demo_b) executa BillingTool e responde com o fato real (P0.2)', async () => {
    const decision = await runWithTenant('tnt_demo_alpha', async () => {
      const conv = await db.client.conversation.create({
        data: { tenantId: 'tnt_demo_alpha', channel: 'WEBCHAT', channelUserId: '+5511999990002', status: 'AI_ACTIVE' },
      });
      return ask(conv.id, 'Minha fatura está com atraso, o que houve?');
    });

    expect(decision.identity?.customerId).toBe('cus_demo_b');
    expect(decision.outcome).toBe('ANSWERED');
    expect(decision.toolCalls).toHaveLength(1);
    expect(decision.claims.some((c) => c.type === 'FACT')).toBe(true);
    for (const claim of decision.claims) {
      if (claim.type === 'FACT') expect(claim.evidence.length).toBeGreaterThan(0);
    }

    const messages = await runWithTenant('tnt_demo_alpha', () =>
      db.client.message.findMany({ where: { conversationId: decision.conversationId }, orderBy: { createdAt: 'asc' } }),
    );
    expect(messages).toHaveLength(2);
    expect(messages[1].role).toBe('AGENT');
    expect(messages[1].content.length).toBeGreaterThan(0);
  });

  it('telefone ambíguo (cus_demo_g/g2) nunca chama BillingTool e vira HANDOFF (P0.7)', async () => {
    const decision = await runWithTenant('tnt_demo_alpha', async () => {
      const conv = await db.client.conversation.create({
        data: { tenantId: 'tnt_demo_alpha', channel: 'WEBCHAT', channelUserId: '+5511999990007', status: 'AI_ACTIVE' },
      });
      return ask(conv.id, 'quero saber da minha fatura');
    });

    expect(decision.identity).toBeNull();
    expect(decision.outcome).toBe('HANDOFF');
    expect(decision.toolCalls).toHaveLength(1);

    const call = await runWithTenant('tnt_demo_alpha', () =>
      db.client.toolCall.findUnique({ where: { id: decision.toolCalls[0] } }),
    );
    expect(call?.tool).not.toBe('BillingTool'); // sem conta confirmada, nenhuma ferramenta de conta roda
  });

  it('telefone não cadastrado usa KnowledgeTool para dúvida técnica, sem tentar identidade', async () => {
    const decision = await runWithTenant('tnt_demo_alpha', async () => {
      const conv = await db.client.conversation.create({
        data: { tenantId: 'tnt_demo_alpha', channel: 'WEBCHAT', channelUserId: freshPhone(), status: 'AI_ACTIVE' },
      });
      return ask(conv.id, 'minha internet está muito lenta, o que eu faço?');
    });

    expect(decision.identity).toBeNull();
    expect(decision.intent).toBe('INTERNET_LENTA');
    const call = await runWithTenant('tnt_demo_alpha', () =>
      db.client.toolCall.findUnique({ where: { id: decision.toolCalls[0] } }),
    );
    expect(call?.tool).toBe('KnowledgeTool');
  });

  it('consulta de chamado existente (cus_demo_f) executa SupportTool e responde', async () => {
    const decision = await runWithTenant('tnt_demo_alpha', async () => {
      const conv = await db.client.conversation.create({
        data: { tenantId: 'tnt_demo_alpha', channel: 'WEBCHAT', channelUserId: '+5511999990006', status: 'AI_ACTIVE' },
      });
      return ask(conv.id, 'qual o status do meu chamado?');
    });

    expect(decision.identity?.customerId).toBe('cus_demo_f');
    expect(decision.outcome).toBe('ANSWERED');
    const call = await runWithTenant('tnt_demo_alpha', () =>
      db.client.toolCall.findUnique({ where: { id: decision.toolCalls[0] } }),
    );
    expect(call?.tool).toBe('SupportTool');
  });

  it('abertura de chamado (cus_demo_a) executa e persiste um SupportTicket real (ACTION_EXECUTED)', async () => {
    const decision = await runWithTenant('tnt_demo_alpha', async () => {
      const conv = await db.client.conversation.create({
        data: { tenantId: 'tnt_demo_alpha', channel: 'WEBCHAT', channelUserId: '+5511999990001', status: 'AI_ACTIVE' },
      });
      return ask(conv.id, 'preciso abrir um chamado, minha internet está com problema técnico');
    });

    expect(decision.outcome).toBe('ACTION_EXECUTED');
    const created = (await runWithTenant('tnt_demo_alpha', () =>
      db.client.toolCall.findUnique({ where: { id: decision.toolCalls[0] } }),
    )) as { data: unknown } | null;
    const ticket = (created?.data as { ticket: { id: string } } | undefined)?.ticket;
    expect(ticket?.id).toBeTruthy();

    const rows = await runWithTenant('tnt_demo_alpha', () =>
      db.client.supportTicket.findMany({ where: { id: ticket!.id } }),
    );
    expect(rows).toHaveLength(1);
  });

  it('billing bloqueado pela policy do tenant nunca executa a ferramenta (BLOCKED)', async () => {
    await runWithTenant('tnt_demo_alpha', () =>
      db.client.tenantPolicyConfig.update({ where: { tenantId: 'tnt_demo_alpha' }, data: { canAccessBilling: false } }),
    );
    try {
      const decision = await runWithTenant('tnt_demo_alpha', async () => {
        const conv = await db.client.conversation.create({
          data: { tenantId: 'tnt_demo_alpha', channel: 'WEBCHAT', channelUserId: '+5511999990001', status: 'AI_ACTIVE' },
        });
        return ask(conv.id, 'quero ver minha fatura');
      });

      expect(decision.outcome).toBe('BLOCKED');
      expect(decision.policyDecisions[0].allowed).toBe(false);
    } finally {
      await runWithTenant('tnt_demo_alpha', () =>
        db.client.tenantPolicyConfig.update({ where: { tenantId: 'tnt_demo_alpha' }, data: { canAccessBilling: true } }),
      );
    }
  });

  it('tenant isolado: mesma conversa/telefone em Beta não vê o cliente de Alpha', async () => {
    const decision = await runWithTenant('tnt_demo_beta', async () => {
      const conv = await db.client.conversation.create({
        data: { tenantId: 'tnt_demo_beta', channel: 'WEBCHAT', channelUserId: '+5511999990001', status: 'AI_ACTIVE' },
      });
      return ask(conv.id, 'quero ver minha fatura');
    });

    expect(decision.identity).toBeNull();
  });
});
