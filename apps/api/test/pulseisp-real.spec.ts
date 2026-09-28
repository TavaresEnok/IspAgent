import { CustomerNetworkHealth } from '@ispagent/shared';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { PolicyEngineService } from '../src/policy/policy-engine.service';
import { ToolExecutorService } from '../src/tools/tool-executor.service';
import { MockERPAdapter } from '../src/integrations/erp/mock-erp.adapter';
import { ErpToolsService } from '../src/tools/erp-tools.service';
import { MockPulseISPAdapter } from '../src/integrations/pulseisp/mock-pulseisp.adapter';
import { TenantPulseISPAdapter } from '../src/integrations/pulseisp/tenant-pulseisp.adapter';
import { PulseISPAdapter } from '../src/integrations/pulseisp/pulseisp-adapter.interface';
import { PulseIspMirrorService } from '../src/integrations/pulseisp/pulseisp-mirror.service';
import { mapCustomer360ToNetworkHealth, PulseCustomer360 } from '../src/integrations/pulseisp/pulseisp-mapper';
import { KnowledgeService } from '../src/knowledge/knowledge.service';
import { MockAIProvider } from '../src/integrations/ai/mock-ai.provider';
import { ConversationService } from '../src/conversation/conversation.service';
import { IdentityResolutionService } from '../src/identity/identity-resolution.service';
import { AgentOrchestratorService } from '../src/agent/agent-orchestrator.service';
import { HandoffService } from '../src/handoff/handoff.service';
import { runWithTenant } from '../src/common/tenant-context';
import { fixedAiResolver } from './helpers/ai-resolver';
import { RealtimeEventsService } from '../src/events/events.service';

/**
 * Integração com o PulseISP REAL (simulador de cliente do painel). O formato de `PulseCustomer360` vem do
 * código do PulseISP (customers.controller.ts / engine/types.ts), não de um payload capturado — a validação
 * com dados reais é o botão "Testar" + o simulador na tela "PulseISP". Aqui provamos o que o ISPAgent faz
 * com esse formato: mapeamento sem inventar valor, espelho sem copiar dado sensível, identidade por canal,
 * e um agente que não responde fatura/chamado de cliente real (dado que o PulseISP não fornece).
 */
describe('mapCustomer360ToNetworkHealth', () => {
  const base: PulseCustomer360 = {
    asOf: '2026-09-18T12:00:00.000Z',
    customer: { id: 'c1', name: 'Fulano' },
    network: { onu: { status: 'ONLINE', lastRxDbm: -27.4, lastTxDbm: 2.1 } },
    health: { score: 42, band: 'ATTENTION', metrics: { optical: { trend: 'DEGRADING' }, connection: { drops7d: 14, lastDropAt: '2026-09-18T10:00:00.000Z' } } },
    anomalies: [],
    recommendations: [],
  };

  it('degradação individual: status DEGRADED, sinal e quedas reais, nada inventado', () => {
    const h = mapCustomer360ToNetworkHealth(base)!;
    expect(h.status).toBe('DEGRADED');
    expect(h.healthScore).toBe(42);
    expect(h.optical).toEqual({ rxDbm: -27.4, txDbm: 2.1, trend: 'DEGRADING' });
    expect(h.stability.disconnects7d).toBe(14);
    expect(h.stability.reconnects7d).toBeNull(); // o PulseISP não separa reconexões de quedas
    expect(h.activeAnomalies).toEqual([]);
    expect(h.mode).toBe('LIVE');
  });

  it('ONU em LOS/OFFLINE/DYING_GASP vira OFFLINE mesmo com a faixa de saúde boa', () => {
    const h = mapCustomer360ToNetworkHealth({ ...base, network: { onu: { status: 'LOS', lastRxDbm: null } }, health: { score: 90, band: 'HEALTHY' } })!;
    expect(h.status).toBe('OFFLINE');
  });

  it('anomalia ativa usa o detalhe (escopo PON, início real); resolvida é ignorada', () => {
    const c: PulseCustomer360 = {
      ...base,
      anomalies: [
        { id: 'a1', status: 'ACTIVE', affectedCustomers: 23, windowStart: '2026-09-18T09:00:00.000Z', summary: 'ONUs da PON offline' },
        { id: 'a2', status: 'RESOLVED', affectedCustomers: 5, summary: 'antiga' },
      ],
    };
    const h = mapCustomer360ToNetworkHealth(c, { a1: { scopeType: 'PON', firstDetectedAt: '2026-09-18T08:55:00.000Z' } })!;
    expect(h.activeAnomalies).toHaveLength(1);
    expect(h.activeAnomalies[0]).toMatchObject({ id: 'a1', scope: 'PON', affectedCustomers: 23, startedAt: '2026-09-18T08:55:00.000Z' });
  });

  it('sem o detalhe da anomalia, cai no escopo mais amplo (REGION) em vez de afirmar PON/OLT', () => {
    const c: PulseCustomer360 = { ...base, anomalies: [{ id: 'a1', status: 'ACTIVE', windowStart: '2026-09-18T09:00:00.000Z', summary: 'x' }] };
    const h = mapCustomer360ToNetworkHealth(c)!;
    expect(h.activeAnomalies[0].scope).toBe('REGION');
    expect(h.activeAnomalies[0].startedAt).toBe('2026-09-18T09:00:00.000Z');
  });

  it('cliente sem nenhuma telemetria (sem score e sem ONU) devolve null — nunca um "score 0" fabricado', () => {
    expect(mapCustomer360ToNetworkHealth({ customer: { id: 'c1' }, network: {}, health: null })).toBeNull();
  });

  it('métricas ausentes viram null/UNKNOWN, e só recomendações TÉCNICAS abertas passam', () => {
    const h = mapCustomer360ToNetworkHealth({
      ...base,
      health: { score: 80, band: 'HEALTHY' },
      recommendations: [
        { category: 'TECHNICAL', status: 'OPEN', recommendation: 'Agendar visita' },
        { category: 'RELATIONSHIP', status: 'OPEN', recommendation: 'Oferecer upgrade' },
        { category: 'TECHNICAL', status: 'DISMISSED', recommendation: 'Já tratada' },
      ],
    })!;
    expect(h.stability.disconnects7d).toBeNull();
    expect(h.optical.trend).toBe('UNKNOWN');
    expect(h.recommendations).toEqual(['Agendar visita']);
  });
});

describe('simulador: espelho + identidade + orquestrador com cliente real do PulseISP', () => {
  const TENANT = 'tnt_test_pulse';
  let prisma: PrismaService;
  let db: TenantPrismaService;
  let mirror: PulseIspMirrorService;
  let identity: IdentityResolutionService;
  let orchestrator: AgentOrchestratorService;
  let realCalls: string[];

  const c360: PulseCustomer360 = {
    customer: { id: 'abc123', externalId: '9001', name: 'Cliente Real de Teste', phone: '+5511900000001', status: 'ACTIVE' },
    contract: {
      id: 'k1',
      status: 'ACTIVE',
      addressLine: 'Rua Secreta 100',
      plan: { id: 'p1', name: 'Fibra 300', downloadMbps: 300, uploadMbps: 150, priceCents: 9990 },
    },
  };

  // Stub do PulseISP real: registra a chamada e devolve um diagnóstico fixo (nenhuma rede é usada).
  const fakeReal: PulseISPAdapter = {
    name: 'FakeRealPulse',
    async getCustomerNetworkHealth(contractId: string): Promise<CustomerNetworkHealth | null> {
      realCalls.push(contractId);
      return {
        healthScore: 33,
        status: 'CRITICAL',
        optical: { rxDbm: -29.1, txDbm: 2.0, trend: 'DEGRADING' },
        stability: { disconnects7d: 9, reconnects7d: null, lastEventAt: null },
        activeAnomalies: [],
        recommendations: [],
        observedAt: new Date().toISOString(),
        mode: 'LIVE',
      };
    },
  };

  async function wipe() {
    await runWithTenant(TENANT, async () => {
      const convs = await db.client.conversation.findMany({});
      for (const c of convs) {
        const runs = await db.client.agentRun.findMany({ where: { conversationId: c.id } });
        for (const r of runs) await db.client.toolCall.deleteMany({ where: { agentRunId: r.id } });
        await db.client.agentRun.deleteMany({ where: { conversationId: c.id } });
        await db.client.handoff.deleteMany({ where: { conversationId: c.id } });
        await db.client.satisfactionSurvey.deleteMany({ where: { conversationId: c.id } });
        await db.client.cancellationRequest.deleteMany({ where: { conversationId: c.id } });
        await db.client.message.deleteMany({ where: { conversationId: c.id } });
        await db.client.conversation.delete({ where: { id: c.id } });
      }
      await db.client.auditLog.deleteMany({});
      await db.client.contract.deleteMany({});
      await db.client.customer.deleteMany({});
      await db.client.plan.deleteMany({});
    });
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    db = new TenantPrismaService(prisma);
    await prisma.tenant.upsert({ where: { id: TENANT }, create: { id: TENANT, name: 'Teste PulseISP real' }, update: {} });
    // Os cenários de oferta de chamado exigem chamados habilitados (o padrão agora é `readOnlyMode`).
    const ticketsOn = { readOnlyMode: false, canCreateTicket: true };
    await prisma.tenantPolicyConfig.upsert({ where: { tenantId: TENANT }, create: { tenantId: TENANT, ...ticketsOn }, update: ticketsOn });
    await wipe();

    mirror = new PulseIspMirrorService(db);
    identity = new IdentityResolutionService(db);
    const policy = new PolicyEngineService(db);
    const executor = new ToolExecutorService(db, policy);
    const erpTools = new ErpToolsService(new MockERPAdapter(db));
    const conversation = new ConversationService(db, identity);
    const adapter = new TenantPulseISPAdapter(new MockPulseISPAdapter(db), fakeReal);
    orchestrator = new AgentOrchestratorService(
      db, conversation, executor, policy, erpTools, new KnowledgeService(db), fixedAiResolver(new MockAIProvider()), adapter, new HandoffService(db, new RealtimeEventsService()),
    );
  });

  beforeEach(() => {
    realCalls = [];
  });

  afterAll(async () => {
    await wipe();
    await prisma.tenantPolicyConfig.deleteMany({ where: { tenantId: TENANT } });
    await prisma.tenant.deleteMany({ where: { id: TENANT } });
    await prisma.$disconnect();
  });

  it('espelha só o necessário (nome, plano, status), sem endereço, e é idempotente', async () => {
    const first = await runWithTenant(TENANT, () => mirror.upsertFromCustomer360(TENANT, c360));
    const again = await runWithTenant(TENANT, () => mirror.upsertFromCustomer360(TENANT, c360));
    expect(again).toEqual(first);
    expect(first).toEqual({ channelUserId: 'pulse:abc123', customerName: 'Cliente Real de Teste', contractId: 'pulse_abc123' });

    const { customers, contract, plans } = await runWithTenant(TENANT, async () => ({
      customers: await db.client.customer.findMany({}),
      contract: await db.client.contract.findUniqueOrThrow({ where: { id: 'pulse_abc123' } }),
      plans: await db.client.plan.findMany({}),
    }));
    expect(customers).toHaveLength(1);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ name: 'Fibra 300', downloadMbps: 300, priceCents: 9990 });
    expect(contract.address).not.toContain('Rua Secreta');
    expect(customers[0].document).not.toMatch(/\d{3}/);
  });

  it('recusa espelhar cliente sem contrato ou sem plano (não inventa)', async () => {
    await expect(
      runWithTenant(TENANT, () => mirror.upsertFromCustomer360(TENANT, { customer: { id: 'x' }, contract: null })),
    ).rejects.toThrow(/contrato/i);
    await expect(
      runWithTenant(TENANT, () => mirror.upsertFromCustomer360(TENANT, { customer: { id: 'x' }, contract: { status: 'ACTIVE', plan: null } })),
    ).rejects.toThrow(/plano/i);
  });

  it('o canal do cliente simulado resolve identidade pelo fluxo normal (PHONE_EXACT → contrato pulse_*)', async () => {
    await runWithTenant(TENANT, () => mirror.upsertFromCustomer360(TENANT, c360));
    const r = await runWithTenant(TENANT, () => identity.resolveByPhone('pulse:abc123'));
    expect(r).toMatchObject({ method: 'PHONE_EXACT', customerId: 'pulse_abc123', contractId: 'pulse_abc123' });
  });

  async function ask(message: string) {
    return runWithTenant(TENANT, async () => {
      await mirror.upsertFromCustomer360(TENANT, c360);
      const conv = await db.client.conversation.create({
        data: { tenantId: TENANT, channel: 'WEBCHAT', channelUserId: 'pulse:abc123', status: 'AI_ACTIVE' },
      });
      const decision = await orchestrator.handleMessage(conv.id, message);
      const calls = await db.client.toolCall.findMany({ where: { id: { in: decision!.toolCalls } } });
      return { decision: decision!, calls };
    });
  }

  it('problema de rede de cliente real chama o PulseISP REAL e o ToolCall é rotulado LIVE (nunca DEMO)', async () => {
    const { decision, calls } = await ask('minha internet fica caindo toda hora');
    expect(realCalls).toEqual(['pulse_abc123']);
    expect(decision.outcome).toBe('ANSWERED');
    expect(calls).toHaveLength(1);
    expect(calls[0].tool).toBe('PulseISPTool');
    expect(calls[0].source).toMatchObject({ mode: 'LIVE', adapter: 'RealPulseISPAdapter' });
    expect(decision.claims.some((c) => c.text.includes('-29.1'))).toBe(true);
  });

  it('fatura de cliente real NÃO executa BillingTool (sem dado de fatura) e escala em vez de inventar "sem pendências"', async () => {
    const { decision, calls } = await ask('quero ver minha fatura');
    expect(calls).toHaveLength(0);
    expect(decision.claims).toHaveLength(0);
    expect(decision.outcome).toBe('HANDOFF');
    expect(realCalls).toEqual([]);
  });

  it('plano de cliente real responde com o plano espelhado do PulseISP', async () => {
    const { decision, calls } = await ask('qual o meu plano?');
    expect(calls).toHaveLength(1);
    expect(decision.claims.some((c) => c.text.includes('Fibra 300'))).toBe(true);
  });

  async function conversation(messages: string[]) {
    return runWithTenant(TENANT, async () => {
      await mirror.upsertFromCustomer360(TENANT, c360);
      const conv = await db.client.conversation.create({
        data: { tenantId: TENANT, channel: 'WEBCHAT', channelUserId: 'pulse:abc123', status: 'AI_ACTIVE' },
      });
      const decisions = [];
      for (const m of messages) decisions.push((await orchestrator.handleMessage(conv.id, m))!);
      const replies = (await db.client.message.findMany({ where: { conversationId: conv.id, role: 'AGENT' }, orderBy: { createdAt: 'asc' } })).map((x) => x.content);
      const handoffs = await db.client.handoff.count({ where: { conversationId: conv.id } });
      return { decisions, replies, handoffs };
    });
  }

  it('continuação: "que sinal?" depois do diagnóstico explica em linguagem simples (sem dBm), não cai na saudação', async () => {
    const { decisions, replies } = await conversation(['minha internet fica caindo toda hora', 'que sinal?']);
    expect(decisions[1].intent).toBe('QUEDAS');
    expect(replies[1]).toMatch(/mais fraca ou instável/);
    expect(replies[1]).not.toMatch(/dBm|-29|Consigo ajudar com/);
  });

  it('continuação: "sim" depois da oferta de chamado vira CHAMADO → atendente com mensagem clara (sem inventar chamado)', async () => {
    const { decisions, replies, handoffs } = await conversation(['minha internet fica caindo toda hora', 'sim']);
    expect(decisions[1].intent).toBe('CHAMADO');
    expect(decisions[1].outcome).toBe('HANDOFF');
    expect(decisions[1].toolCalls).toHaveLength(0);
    expect(handoffs).toBe(1);
    expect(replies[1]).toMatch(/Passei o seu caso para a equipe técnica/);
  });

  it('continuação: "não" encerra a oferta sem handoff', async () => {
    const { decisions, replies, handoffs } = await conversation(['minha internet fica caindo toda hora', 'não, obrigado']);
    expect(decisions[1].outcome).toBe('ANSWERED');
    expect(handoffs).toBe(0);
    expect(replies[1]).toMatch(/Tudo bem/);
  });

  it('sem diagnóstico antes, "que sinal?" recebe orientação (geral ou da base de conhecimento), nunca dado técnico', async () => {
    const { replies } = await conversation(['que sinal?']);
    expect(replies[0]).toMatch(/Posso te ajudar com|sinal/);
    expect(replies[0]).not.toMatch(/dBm|-29/);
  });

  it('com a policy em modo somente leitura, o agente não oferece chamado e "sim" não abre nada', async () => {
    await prisma.tenantPolicyConfig.update({ where: { tenantId: TENANT }, data: { readOnlyMode: true } });
    try {
      const { decisions, replies, handoffs } = await conversation(['minha internet fica caindo toda hora', 'sim']);
      expect(replies[0]).not.toMatch(/abr[ae] um chamado|abrir o chamado/i);
      expect(decisions[1].intent).not.toBe('CHAMADO');
      expect(handoffs).toBe(0);
    } finally {
      await prisma.tenantPolicyConfig.update({ where: { tenantId: TENANT }, data: { readOnlyMode: false } });
    }
  });
});
