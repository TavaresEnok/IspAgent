import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { PolicyEngineService } from '../src/policy/policy-engine.service';
import { ToolExecutorService } from '../src/tools/tool-executor.service';
import { MockPulseISPAdapter } from '../src/integrations/pulseisp/mock-pulseisp.adapter';
import { createPulseISPQueryTool } from '../src/tools/pulseisp-tool';
import { MockERPAdapter } from '../src/integrations/erp/mock-erp.adapter';
import { ErpToolsService } from '../src/tools/erp-tools.service';
import { KnowledgeService } from '../src/knowledge/knowledge.service';
import { MockAIProvider } from '../src/integrations/ai/mock-ai.provider';
import { ConversationService } from '../src/conversation/conversation.service';
import { IdentityResolutionService } from '../src/identity/identity-resolution.service';
import { AgentOrchestratorService } from '../src/agent/agent-orchestrator.service';
import { ClaimValidatorService } from '../src/agent/claim-validator.service';
import { HandoffService } from '../src/handoff/handoff.service';
import { runWithTenant } from '../src/common/tenant-context';
import { fixedAiResolver } from './helpers/ai-resolver';

/**
 * P0.4 — com MockPulseISP, problema coletivo muda o comportamento; sem PulseISP (flag desligada) o
 * produto continua funcionando. A MESMA conversa/mensagem roda nos dois modos.
 */
describe('PulseISP', () => {
  let prisma: PrismaService;
  let db: TenantPrismaService;
  let pulseisp: MockPulseISPAdapter;
  let executor: ToolExecutorService;
  let orchestrator: AgentOrchestratorService;

  const originalFlag = process.env.ISPAGENT_PULSEISP_ENABLED;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    db = new TenantPrismaService(prisma);
    pulseisp = new MockPulseISPAdapter(db);

    const policy = new PolicyEngineService(db);
    executor = new ToolExecutorService(db, policy);
    const erp = new MockERPAdapter(db);
    const erpTools = new ErpToolsService(erp);
    const knowledge = new KnowledgeService(db);
    const identity = new IdentityResolutionService(db);
    const conversation = new ConversationService(db, identity);
    const ai = new MockAIProvider();
    const handoff = new HandoffService(db);

    orchestrator = new AgentOrchestratorService(db, conversation, executor, policy, erpTools, knowledge, fixedAiResolver(ai), pulseisp, handoff);
  });

  afterAll(async () => {
    process.env.ISPAGENT_PULSEISP_ENABLED = originalFlag;
    await prisma.$disconnect();
  });

  function freshPhone() {
    return `+55${randomUUID().replace(/\D/g, '').slice(0, 10)}`;
  }

  async function ask(conversationId: string, message: string) {
    const decision = await orchestrator.handleMessage(conversationId, message);
    if (!decision) throw new Error('esperava AgentDecision, recebi null (conversa em HUMAN_ACTIVE?)');
    return decision;
  }

  describe('MockPulseISPAdapter', () => {
    it('cus_demo_c (degradação individual): DEGRADED, sem anomalia coletiva', async () => {
      const health = await runWithTenant('tnt_demo_alpha', () => pulseisp.getCustomerNetworkHealth('ctt_demo_c'));
      expect(health?.status).toBe('DEGRADED');
      expect(health?.activeAnomalies).toHaveLength(0);
      expect(health?.optical.trend).toBe('DEGRADING');
    });

    it('cus_demo_d (incidente coletivo na PON): anomalia com escopo PON e vários clientes afetados', async () => {
      const health = await runWithTenant('tnt_demo_alpha', () => pulseisp.getCustomerNetworkHealth('ctt_demo_d'));
      expect(health?.activeAnomalies).toHaveLength(1);
      expect(health?.activeAnomalies[0].scope).toBe('PON');
      expect(health?.activeAnomalies[0].affectedCustomers).toBeGreaterThan(1);
    });

    it('cliente saudável: HEALTHY, sem anomalia', async () => {
      const health = await runWithTenant('tnt_demo_alpha', () => pulseisp.getCustomerNetworkHealth('ctt_demo_a'));
      expect(health?.status).toBe('HEALTHY');
      expect(health?.activeAnomalies).toHaveLength(0);
    });

    it('contrato inexistente devolve null, nunca telemetria fabricada', async () => {
      const health = await runWithTenant('tnt_demo_alpha', () => pulseisp.getCustomerNetworkHealth('ctt_nao_existe'));
      expect(health).toBeNull();
    });
  });

  describe('PulseISPTool', () => {
    it('P0.3 — degradação individual: facts incluem sinal óptico (dado real retornado)', async () => {
      const tool = createPulseISPQueryTool(pulseisp);
      const result = await runWithTenant('tnt_demo_alpha', async () => {
        const conv = await db.client.conversation.create({
          data: { tenantId: 'tnt_demo_alpha', channel: 'WEBCHAT', channelUserId: freshPhone(), status: 'AI_ACTIVE' },
        });
        const agentRun = await db.client.agentRun.create({
          data: {
            tenantId: 'tnt_demo_alpha', conversationId: conv.id, intent: 'QUEDAS', intentConfidence: 'MEDIUM',
            promptVersion: 'test', model: 'test', mode: 'DEMO',
          },
        });
        return executor.run(tool, { contractId: 'ctt_demo_c' }, { agentRunId: agentRun.id });
      });

      expect(result.status).toBe('OK');
      expect(result.facts.some((f) => f.path === 'data.optical.rxDbm')).toBe(true);
      expect(result.facts.some((f) => f.path === 'data.collectiveAnomaly.scope')).toBe(false);
    });

    it('P0.3 — incidente coletivo: facts NÃO incluem sinal óptico (não foi um dado relevante retornado)', async () => {
      const tool = createPulseISPQueryTool(pulseisp);
      const result = await runWithTenant('tnt_demo_alpha', async () => {
        const conv = await db.client.conversation.create({
          data: { tenantId: 'tnt_demo_alpha', channel: 'WEBCHAT', channelUserId: freshPhone(), status: 'AI_ACTIVE' },
        });
        const agentRun = await db.client.agentRun.create({
          data: {
            tenantId: 'tnt_demo_alpha', conversationId: conv.id, intent: 'QUEDAS', intentConfidence: 'MEDIUM',
            promptVersion: 'test', model: 'test', mode: 'DEMO',
          },
        });
        return executor.run(tool, { contractId: 'ctt_demo_d' }, { agentRunId: agentRun.id });
      });

      expect(result.status).toBe('OK');
      expect(result.facts.some((f) => f.path === 'data.optical.rxDbm')).toBe(false);
      expect(result.facts.some((f) => f.path === 'data.collectiveAnomaly.scope')).toBe(true);

      // P0.3 (evidência direta): a resposta final nunca cita sinal óptico, porque o fact não existe
      // neste ToolResult — a mesma garantia estrutural que claims.spec.ts prova de forma isolada.
      const validator = new ClaimValidatorService();
      const claims = result.facts.map((f) => ({
        text: `${f.label}: ${String(f.value)}`,
        type: 'FACT' as const,
        evidence: [`${result.toolCallId}#${f.path}`],
      }));
      expect(() => validator.assertValid(claims, [result])).not.toThrow();

      const ai = new MockAIProvider();
      const reply = await ai.composeReply({
        intent: 'QUEDAS',
        customerName: null,
        facts: result.facts.map((f) => ({ label: f.label, value: f.value })),
        toolStatus: result.status,
      });
      expect(reply.toLowerCase()).not.toMatch(/óptic|optic/);
    });
  });

  describe('AgentOrchestratorService — mesma conversa, flag ligada e desligada', () => {
    it('flag DESLIGADA: intenção de rede cai para KnowledgeTool (produto funciona sem PulseISP)', async () => {
      process.env.ISPAGENT_PULSEISP_ENABLED = 'false';
      const decision = await runWithTenant('tnt_demo_alpha', async () => {
        const conv = await db.client.conversation.create({
          data: { tenantId: 'tnt_demo_alpha', channel: 'WEBCHAT', channelUserId: '+5511999990003', status: 'AI_ACTIVE' },
        });
        return ask(conv.id, 'minha internet está caindo toda hora');
      });

      const call = await runWithTenant('tnt_demo_alpha', () =>
        db.client.toolCall.findUnique({ where: { id: decision.toolCalls[0] } }),
      );
      expect(call?.tool).toBe('KnowledgeTool');
    });

    it('flag LIGADA: mesma intenção de rede para cus_demo_c chama PulseISPTool e reflete degradação individual', async () => {
      process.env.ISPAGENT_PULSEISP_ENABLED = 'true';
      const decision = await runWithTenant('tnt_demo_alpha', async () => {
        const conv = await db.client.conversation.create({
          data: { tenantId: 'tnt_demo_alpha', channel: 'WEBCHAT', channelUserId: '+5511999990003', status: 'AI_ACTIVE' },
        });
        return ask(conv.id, 'minha internet está caindo toda hora');
      });

      const call = await runWithTenant('tnt_demo_alpha', () =>
        db.client.toolCall.findUnique({ where: { id: decision.toolCalls[0] } }),
      );
      expect(call?.tool).toBe('PulseISPTool');
      expect(decision.outcome).toBe('ANSWERED');
    });

    it('flag LIGADA: cliente afetado por incidente coletivo (cus_demo_d) recebe diagnóstico coletivo, não individual', async () => {
      process.env.ISPAGENT_PULSEISP_ENABLED = 'true';
      const decision = await runWithTenant('tnt_demo_alpha', async () => {
        const conv = await db.client.conversation.create({
          data: { tenantId: 'tnt_demo_alpha', channel: 'WEBCHAT', channelUserId: '+5511999990004', status: 'AI_ACTIVE' },
        });
        return ask(conv.id, 'estou sem internet, caiu de novo');
      });

      const claimTexts = decision.claims.map((c) => c.text).join(' | ');
      expect(claimTexts).toMatch(/PON|coletivo|Clientes afetados/i);

      const call = await runWithTenant('tnt_demo_alpha', () =>
        db.client.toolCall.findUnique({ where: { id: decision.toolCalls[0] } }),
      );
      expect(call?.tool).toBe('PulseISPTool');
    });
  });
});
