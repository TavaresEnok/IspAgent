import { randomUUID } from 'node:crypto';
import { FlowRunState, starterFlow } from '@ispagent/shared';
import { runWithTenant } from '../src/common/tenant-context';
import { FlowEngine, FlowRuntime } from '../src/flows/flow-engine';
import { interpretMenuChoice } from '../src/flows/menu-interpreter';
import { MockAIProvider } from '../src/integrations/ai/mock-ai.provider';
import { outOfScopeReply, smallTalkKind } from '../src/agent/quick-flows';
import { EvolutionClient } from '../src/channels/evolution.client';
import { STALE_MESSAGE_SECONDS, WhatsAppChannelService, phoneKey } from '../src/channels/whatsapp-channel.service';
import { buildOrchestrator } from './helpers/build-orchestrator';

/**
 * Bateria de qualidade de conversa: cada caso vem de uma conversa real de teste no WhatsApp (28/09) em
 * que o atendimento pareceu robótico. O que se verifica é o comportamento (caminho, transferência,
 * silêncio, repetição) — não a redação exata, que pode evoluir.
 */

const rules = new MockAIProvider();

function menuRuntime(): FlowRuntime {
  return {
    companyName: 'Vibe Telecom',
    customerName: () => null,
    isIdentified: () => false,
    identify: async () => 'not_found',
    lookup: async () => ({ status: 'not_found' }),
    openTicket: async () => ({ status: 'error' }),
    isBusinessHours: () => true,
    isHumanRequest: (t) => /atendente/i.test(t),
    interpretMenu: async (input, options) => interpretMenuChoice((await rules.classifyIntents(input)).intents, options),
  };
}

async function menuTurn(message: string) {
  const engine = new FlowEngine(starterFlow(), 'flow-q', 1);
  const first = await engine.step(null, 'oi', menuRuntime());
  return engine.step(first.state as FlowRunState, message, menuRuntime());
}

describe('menu do fluxo entende texto livre', () => {
  it('"minha internet caiu de novo" escolhe "Problema na internet" (sem exigir o número)', async () => {
    const turn = await menuTurn('minha internet caiu de novo');
    expect(turn.trace.find((t) => t.nodeId === 'menu')?.via).toBe('op_conexao');
  });

  it('"quero pagar o boleto" escolhe a 2ª via da fatura', async () => {
    const turn = await menuTurn('quero pagar o boleto');
    expect(turn.trace.find((t) => t.nodeId === 'menu')?.via).toBe('op_fatura');
  });

  it('"Eita poxa", "Kkkkk": nada de "responda com o número" — a IA assume a conversa', async () => {
    for (const msg of ['Eita poxa', 'Kkkkk', 'Entendi, esperar Arthur dizer alguma coisa']) {
      const turn = await menuTurn(msg);
      expect(turn.outcome).toBe('ai');
      expect(turn.replies.join(' ')).not.toMatch(/n[uú]mero/i);
    }
  });

  it('número continua funcionando como atalho', async () => {
    const turn = await menuTurn('2');
    expect(turn.trace.find((t) => t.nodeId === 'menu')?.via).toBe('op_conexao');
  });
});

describe('conversa solta e tom', () => {
  it('reconhece risada, agradecimento, "ok" e saudação — e não confunde pedido com conversa solta', () => {
    expect(smallTalkKind('Kkkkk')).toBe('laugh');
    expect(smallTalkKind('muito obrigado!')).toBe('thanks');
    expect(smallTalkKind('Tá tudo certo')).toBe('ack');
    expect(smallTalkKind('Bom dia, pessoal!')).toBe('greeting');
    expect(smallTalkKind('ok, e a minha fatura?')).toBeNull();
    expect(smallTalkKind('minha internet caiu')).toBeNull();
  });

  it('a apresentação por regras não se repete palavra por palavra', () => {
    const first = outOfScopeReply('Vibe Telecom', false);
    const second = outOfScopeReply('Vibe Telecom', true);
    expect(first).toContain('Vibe Telecom');
    expect(second).not.toBe(first);
    expect(first).not.toMatch(/seu provedor de internet/);
  });
});

describe('atendimento (orquestrador)', () => {
  let ctx: Awaited<ReturnType<typeof buildOrchestrator>>;
  const TENANT = 'tnt_demo_alpha';

  beforeAll(async () => {
    ctx = await buildOrchestrator();
  });

  afterAll(async () => {
    await ctx.prisma.$disconnect();
  });

  const newConversation = () =>
    runWithTenant(TENANT, () =>
      ctx.db.client.conversation.create({
        data: { tenantId: TENANT, channel: 'WHATSAPP', channelUserId: `55119${Date.now().toString().slice(-8)}`, status: 'AI_ACTIVE' },
      }),
    );
  const ask = (id: string, msg: string) => runWithTenant(TENANT, () => ctx.orchestrator.handleMessage(id, msg));
  const agentReplies = async (id: string) =>
    (
      await runWithTenant(TENANT, () =>
        ctx.db.client.message.findMany({ where: { conversationId: id, role: 'AGENT' }, orderBy: { createdAt: 'asc' } }),
      )
    ).map((m) => m.content);

  it('"Tá tudo certo" duas vezes: resposta curta, sem reiniciar o atendimento e sem repetir a mesma frase', async () => {
    const conv = await newConversation();
    await ask(conv.id, 'Tá tudo certo');
    await ask(conv.id, 'Tá tudo certo');
    const [a, b] = await agentReplies(conv.id);
    expect(a).not.toBe(b);
    for (const r of [a, b]) expect(r).not.toMatch(/Posso te ajudar com internet lenta|Sou o assistente/);
  });

  it('"ok" logo depois de o atendimento pedir o CPF não vira conversa solta', async () => {
    const conv = await newConversation();
    await ask(conv.id, 'quero a segunda via do boleto');
    await ask(conv.id, 'ok');
    const replies = await agentReplies(conv.id);
    expect(replies[1]).not.toMatch(/^Combinado|^Certo! Se precisar/);
  });

  it('pedido simples de atendente não pede desculpas; irritação é reconhecida', async () => {
    const simple = await newConversation();
    const d1 = await ask(simple.id, 'Só quero conversar com seu operador');
    expect(d1?.outcome).toBe('HANDOFF');
    expect((await agentReplies(simple.id))[0]).not.toMatch(/desculpas/i);

    const angry = await newConversation();
    await ask(angry.id, 'isso é um absurdo, quero um atendente');
    expect((await agentReplies(angry.id))[0]).toMatch(/frustra/i);
  });

  it('na fila humana a IA fica quieta ("Que loop é esse kkkk" não recebe outra saudação)', async () => {
    const conv = await newConversation();
    await ask(conv.id, 'quero falar com um atendente');
    const before = (await agentReplies(conv.id)).length;
    expect(await ask(conv.id, 'Que loop é esse kkkk')).toBeNull();
    expect(await ask(conv.id, 'Tá tudo certo')).toBeNull();
    expect((await agentReplies(conv.id)).length).toBe(before);
  });

  it('na fila humana, depois de muito tempo sem resposta, um único aviso de que a conversa não foi esquecida', async () => {
    const conv = await newConversation();
    await ask(conv.id, 'quero falar com um atendente');
    // Simula 25 minutos sem ninguém falar com o cliente.
    await ctx.prisma.message.updateMany({
      where: { conversationId: conv.id },
      data: { createdAt: new Date(Date.now() - 25 * 60_000) },
    });
    const reminder = await ask(conv.id, 'alô?');
    expect(reminder?.outcome).toBe('HANDOFF');
    expect((await agentReplies(conv.id)).at(-1)).toMatch(/registrada/);
    expect(await ask(conv.id, 'alguém?')).toBeNull();
  });
});

describe('WhatsApp: proteções do número', () => {
  let ctx: Awaited<ReturnType<typeof buildOrchestrator>>;
  const TENANT = 'tnt_demo_beta';
  let channels: WhatsAppChannelService;

  beforeAll(async () => {
    ctx = await buildOrchestrator();
    channels = new WhatsAppChannelService(ctx.prisma, new EvolutionClient());
    await ctx.prisma.whatsAppConnection.deleteMany({ where: { tenantId: TENANT } });
    await ctx.prisma.whatsAppConnection.create({
      data: { tenantId: TENANT, provider: 'evolution', instanceName: `isp-teste-${randomUUID().slice(0, 6)}` },
    });
  });

  afterAll(async () => {
    await ctx.prisma.whatsAppConnection.deleteMany({ where: { tenantId: TENANT } });
    await ctx.prisma.$disconnect();
  });

  it('mesmo número com ou sem 55 e nono dígito', () => {
    expect(phoneKey('5511987654321')).toBe(phoneKey('11987654321'));
    expect(phoneKey('551187654321')).toBe(phoneKey('(11) 98765-4321'));
    expect(phoneKey('11987654321')).not.toBe(phoneKey('11987654320'));
  });

  it('mensagem acumulada (mais de 5 minutos) não é respondida', async () => {
    const now = Math.floor(Date.now() / 1000);
    expect(await channels.accepts(TENANT, '5511987654321', now - STALE_MESSAGE_SECONDS - 60)).toEqual({ ok: false, reason: 'stale' });
    expect(await channels.accepts(TENANT, '5511987654321', now - 10)).toEqual({ ok: true });
  });

  it('modo teste: só os números da lista; lista vazia com o modo ligado é recusada', async () => {
    await expect(channels.saveTestMode(TENANT, { enabled: true, numbers: [] })).rejects.toThrow(/ao menos um/);
    const view = await channels.saveTestMode(TENANT, { enabled: true, numbers: ['(11) 98765-4321', 'lixo'] });
    expect(view.allowedNumbers).toEqual(['11987654321']);
    expect(await channels.accepts(TENANT, '5511987654321')).toEqual({ ok: true });
    expect(await channels.accepts(TENANT, '551187654321')).toEqual({ ok: true });
    expect(await channels.accepts(TENANT, '5521999990000')).toEqual({ ok: false, reason: 'not_allowed' });
    await channels.saveTestMode(TENANT, { enabled: false, numbers: [] });
    expect(await channels.accepts(TENANT, '5521999990000')).toEqual({ ok: true });
  });
});
