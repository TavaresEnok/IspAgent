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
import { fixedAiResolver } from './helpers/ai-resolver';
import { RealtimeEventsService } from '../src/events/events.service';

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
    const handoff = new HandoffService(db, new RealtimeEventsService());

    orchestrator = new AgentOrchestratorService(db, conversation, executor, policy, erpTools, knowledge, fixedAiResolver(ai), pulseisp, handoff);
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

  it('telefone ambíguo (cus_demo_g/g2) nunca chama BillingTool: pede o documento e, sem identificação, vira HANDOFF (P0.7)', async () => {
    const { conversationId, turns } = await runWithTenant('tnt_demo_alpha', async () => {
      const conv = await db.client.conversation.create({
        data: { tenantId: 'tnt_demo_alpha', channel: 'WEBCHAT', channelUserId: '+5511999990007', status: 'AI_ACTIVE' },
      });
      const turns = [];
      for (const msg of ['quero saber da minha fatura', 'é sobre a fatura mesmo', 'não lembro o documento agora']) {
        turns.push(await ask(conv.id, msg));
      }
      return { conversationId: conv.id, turns };
    });

    // Enquanto pede o documento: responde, sem identidade e sem nenhuma ferramenta de conta.
    expect(turns[0].identity).toBeNull();
    expect(turns[0].outcome).toBe('ANSWERED');
    expect(turns[0].toolCalls).toHaveLength(0);
    expect(turns[1].outcome).toBe('ANSWERED');
    // Documento pedido duas vezes sem identificar: para de insistir e passa para humano.
    expect(turns[2].identity).toBeNull();
    expect(turns[2].outcome).toBe('HANDOFF');

    const calls = await runWithTenant('tnt_demo_alpha', () =>
      db.client.toolCall.findMany({ where: { agentRun: { conversationId } } }),
    );
    expect(calls.map((c) => c.tool)).not.toContain('BillingTool');
    const conv = await runWithTenant('tnt_demo_alpha', () => db.client.conversation.findUniqueOrThrow({ where: { id: conversationId } }));
    expect(conv.customerId).toBeNull();
  });

  it('nome solto na mensagem nunca identifica o cliente (P0.7): "sou o Bruno" não vincula ninguém', async () => {
    const decision = await runWithTenant('tnt_demo_alpha', async () => {
      const conv = await db.client.conversation.create({
        data: { tenantId: 'tnt_demo_alpha', channel: 'WEBCHAT', channelUserId: freshPhone(), status: 'AI_ACTIVE' },
      });
      return ask(conv.id, 'sou o Bruno, quero minha fatura');
    });
    expect(decision.identity).toBeNull();
    expect(decision.toolCalls).toHaveLength(0);
  });

  it('telefone ambíguo + CPF de um dos candidatos identifica exatamente esse cliente (cus_demo_g), nunca o outro', async () => {
    const decision = await runWithTenant('tnt_demo_alpha', async () => {
      const conv = await db.client.conversation.create({
        data: { tenantId: 'tnt_demo_alpha', channel: 'WEBCHAT', channelUserId: '+5511999990007', status: 'AI_ACTIVE' },
      });
      await ask(conv.id, 'quero saber da minha fatura');
      return ask(conv.id, 'meu cpf é 111.111.111-07');
    });

    expect(decision.identity?.customerId).toBe('cus_demo_g');
    expect(decision.identity?.method).toBe('DOCUMENT');
  });

  it('telefone ambíguo + CPF de um cliente que NÃO é candidato nunca vincula (P0.7)', async () => {
    const decision = await runWithTenant('tnt_demo_alpha', async () => {
      const conv = await db.client.conversation.create({
        data: { tenantId: 'tnt_demo_alpha', channel: 'WEBCHAT', channelUserId: '+5511999990007', status: 'AI_ACTIVE' },
      });
      await ask(conv.id, 'quero saber da minha fatura');
      return ask(conv.id, 'meu cpf é 111.111.111-01'); // cus_demo_a: existe, mas não compartilha este telefone
    });

    expect(decision.identity).toBeNull();
    expect(decision.toolCalls).toHaveLength(0);
  });

  it('telefone não cadastrado com problema de rede pede o documento antes de diagnosticar, sem inventar identidade', async () => {
    const decision = await runWithTenant('tnt_demo_alpha', async () => {
      const conv = await db.client.conversation.create({
        data: { tenantId: 'tnt_demo_alpha', channel: 'WEBCHAT', channelUserId: freshPhone(), status: 'AI_ACTIVE' },
      });
      return ask(conv.id, 'minha internet está muito lenta, o que eu faço?');
    });

    expect(decision.identity).toBeNull();
    expect(decision.intent).toBe('INTERNET_LENTA');
    expect(decision.outcome).toBe('ANSWERED');
    expect(decision.toolCalls).toHaveLength(0);
  });

  it('cancelamento: pergunta o motivo, e a resposta (mesmo sem "cancelar") vai para a retenção humana', async () => {
    const phone = freshPhone();
    const { first, second, conversationId } = await runWithTenant('tnt_demo_alpha', async () => {
      const conv = await db.client.conversation.create({
        data: { tenantId: 'tnt_demo_alpha', channel: 'WEBCHAT', channelUserId: phone, status: 'AI_ACTIVE' },
      });
      const first = await ask(conv.id, 'quero cancelar minha assinatura');
      const second = await ask(conv.id, 'está muito caro pra mim');
      return { first, second, conversationId: conv.id };
    });

    expect(first.outcome).toBe('ANSWERED');
    expect(second.intent).toBe('CANCELAMENTO');
    expect(second.outcome).toBe('HANDOFF');
    const [request, handoff] = await runWithTenant('tnt_demo_alpha', () =>
      Promise.all([
        db.client.cancellationRequest.findFirst({ where: { conversationId } }),
        db.client.handoff.findFirst({ where: { conversationId } }),
      ]),
    );
    expect(request).toMatchObject({ discountOffered: true, status: 'TRANSFERRED' });
    expect((handoff?.summary as { suggestedNextAction: string }).suggestedNextAction).toMatch(/preço/);
  });

  it('transferência fora do expediente avisa quando a equipe volta; dentro do expediente, não', async () => {
    const askHuman = (supportHours: string) =>
      runWithTenant('tnt_demo_alpha', async () => {
        await db.client.tenantPolicyConfig.update({ where: { tenantId: 'tnt_demo_alpha' }, data: { supportHours } });
        const conv = await db.client.conversation.create({
          data: { tenantId: 'tnt_demo_alpha', channel: 'WEBCHAT', channelUserId: freshPhone(), status: 'AI_ACTIVE' },
        });
        const decision = await ask(conv.id, 'quero falar com um atendente');
        const reply = await db.client.message.findFirst({ where: { conversationId: conv.id, role: 'AGENT' } });
        return { decision, reply: reply!.content };
      });

    const original = await runWithTenant('tnt_demo_alpha', () =>
      db.client.tenantPolicyConfig.findUniqueOrThrow({ where: { tenantId: 'tnt_demo_alpha' } }),
    );
    try {
      const closed = await askHuman('Segunda, 00h às 00h');
      expect(closed.decision.outcome).toBe('HANDOFF');
      expect(closed.reply).toMatch(/assim que o expediente começar/);

      const open = await askHuman('Todos os dias, 24h');
      expect(open.reply).not.toMatch(/expediente/);
    } finally {
      await runWithTenant('tnt_demo_alpha', () =>
        db.client.tenantPolicyConfig.update({ where: { tenantId: 'tnt_demo_alpha' }, data: { supportHours: original.supportHours } }),
      );
    }
  });

  it('interesse comercial repetido na mesma conversa não duplica o lead', async () => {
    const phone = freshPhone();
    const leads = await runWithTenant('tnt_demo_alpha', async () => {
      const conv = await db.client.conversation.create({
        data: { tenantId: 'tnt_demo_alpha', channel: 'WHATSAPP', channelUserId: phone, status: 'AI_ACTIVE' },
      });
      await ask(conv.id, 'quero contratar internet');
      await ask(conv.id, 'quero contratar o plano de 500 mega');
      return db.client.commercialLead.findMany({ where: { phone } });
    });

    expect(leads).toHaveLength(1);
    expect(leads[0].originChannel).toBe('WHATSAPP');
    expect(leads[0].notes).toContain('500 mega');
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

  it('saudação/conversa solta recebe a orientação fixa (não a frase de "registro não encontrado") e NÃO abre handoff', async () => {
    for (const message of ['olá', 'confirmar o quê?', 'quanto é 2 + 2?']) {
      const { decision, reply, handoffs } = await runWithTenant('tnt_demo_alpha', async () => {
        const conv = await db.client.conversation.create({
          data: { tenantId: 'tnt_demo_alpha', channel: 'WEBCHAT', channelUserId: freshPhone(), status: 'AI_ACTIVE' },
        });
        const d = await ask(conv.id, message);
        const last = await db.client.message.findFirst({
          where: { conversationId: conv.id, role: 'AGENT' },
          orderBy: { createdAt: 'desc' },
        });
        const h = await db.client.handoff.count({ where: { conversationId: conv.id } });
        return { decision: d, reply: last?.content ?? '', handoffs: h };
      });

      expect(decision.intent).toBe('OUTRO');
      expect(decision.outcome).toBe('ANSWERED');
      expect(decision.claims).toHaveLength(0);
      expect(handoffs).toBe(0);
      expect(reply).toMatch(/atendimento da|Posso te ajudar com|Pode falar|Me conta/);
      expect(reply).not.toMatch(/não encontrei esse registro/i);
    }
  });
});
