import { randomUUID } from 'node:crypto';
import { runWithTenant } from '../src/common/tenant-context';
import { buildOrchestrator } from './helpers/build-orchestrator';
import { phoneVariants, normalizeDocument, documentVariants } from '../src/identity/identity-resolution.service';

/**
 * Regressão da falha crítica de identificação: o chat já identificou "quem digitou um nome" como o primeiro
 * cliente cujo nome contém o texto, e aceitou CPF/telefone/código como prova suficiente com confiança HIGH.
 * Agora só documento completo, exato e único identifica — e nunca por nome.
 */
describe('identificação pelo chat (P0.7 — nunca vincular a quem não é)', () => {
  let ctx: Awaited<ReturnType<typeof buildOrchestrator>>;
  const TENANT = 'tnt_demo_alpha';

  beforeAll(async () => {
    ctx = await buildOrchestrator();
  });

  afterAll(async () => {
    await ctx.prisma.$disconnect();
  });

  const freshPhone = () => `+55${randomUUID().replace(/\D/g, '').slice(0, 10)}`;

  async function newConversation(channelUserId = freshPhone()) {
    return runWithTenant(TENANT, () =>
      ctx.db.client.conversation.create({
        data: { tenantId: TENANT, channel: 'WEBCHAT', channelUserId, status: 'AI_ACTIVE' },
      }),
    );
  }

  const ask = (conversationId: string, message: string) =>
    runWithTenant(TENANT, () => ctx.orchestrator.handleMessage(conversationId, message));

  it.each(['Ana', 'Bruno', 'sou a Ana Ferreira Souza', 'meu nome é Carla', 'ana ferreira', 'Teixeira'])(
    'nome digitado ("%s") NUNCA identifica um cliente',
    async (typed) => {
      const conv = await newConversation();
      await ask(conv.id, 'quero ver minha fatura');
      const decision = await ask(conv.id, typed);

      expect(decision?.identity).toBeNull();
      expect(decision?.toolCalls).toHaveLength(0);
      const stored = await runWithTenant(TENANT, () =>
        ctx.db.client.conversation.findUniqueOrThrow({ where: { id: conv.id } }),
      );
      expect(stored.customerId).toBeNull();
    },
  );

  it('código de cliente e telefone digitados no texto NUNCA identificam', async () => {
    const conv = await newConversation();
    await ask(conv.id, 'quero ver minha fatura');
    for (const typed of ['contrato: 123456', '11999990001', 'meu telefone é (11) 99999-0002']) {
      const decision = await ask(conv.id, typed);
      expect(decision?.identity).toBeNull();
    }
  });

  it('CPF exato e único identifica, mas só com confiança MEDIUM (documento sozinho é prova fraca)', async () => {
    const conv = await newConversation();
    await ask(conv.id, 'quero ver minha fatura');
    const decision = await ask(conv.id, '111.111.111-02'); // cus_demo_b

    expect(decision?.identity?.customerId).toBe('cus_demo_b');
    expect(decision?.identity?.method).toBe('DOCUMENT');
    expect(decision?.identity?.confidence).toBe('MEDIUM');
  });

  it('CPF sem pontuação também identifica (a comparação normaliza o documento)', async () => {
    const conv = await newConversation();
    const decision = await ask(conv.id, 'meu cpf é 11111111103 e quero ver a fatura'); // cus_demo_c
    expect(decision?.identity?.customerId).toBe('cus_demo_c');
  });

  it('CPF inexistente não identifica e não vaza nada', async () => {
    const conv = await newConversation();
    const decision = await ask(conv.id, 'cpf 999.999.999-99');
    expect(decision?.identity).toBeNull();
    expect(decision?.toolCalls).toHaveLength(0);
  });

  it('cliente com mais de um contrato ativo não é vinculado a um deles "no chute": vai para um atendente', async () => {
    const customerId = `cus_test_multi_${randomUUID().slice(0, 8)}`;
    await runWithTenant(TENANT, async () => {
      await ctx.db.client.customer.create({
        data: { id: customerId, tenantId: TENANT, name: 'Cliente Dois Contratos', document: '222.333.444-55', phones: [] },
      });
      for (const suffix of ['1', '2']) {
        await ctx.db.client.contract.create({
          data: {
            id: `${customerId}_ctt${suffix}`, tenantId: TENANT, customerId, planId: 'plan_demo_100',
            status: 'ACTIVE', address: 'Rua de Teste, 1',
          },
        });
      }
    });

    try {
      const conv = await newConversation();
      await ask(conv.id, 'quero ver minha fatura');
      const decision = await ask(conv.id, '222.333.444-55');
      expect(decision?.identity).toBeNull();
      expect(decision?.toolCalls).toHaveLength(0);
    } finally {
      await runWithTenant(TENANT, async () => {
        await ctx.db.client.contract.deleteMany({ where: { customerId } });
        await ctx.db.client.customer.deleteMany({ where: { id: customerId } });
      });
    }
  });

  it('tentativas de CPF erradas esgotam o limite e bloqueiam a conversa (anti-adivinhação): handoff mesmo com CPF válido depois', async () => {
    const conv = await newConversation();
    await ask(conv.id, 'quero ver minha fatura');
    await ask(conv.id, '000.000.000-01');
    await ask(conv.id, '000.000.000-02');
    const locked = await ask(conv.id, '000.000.000-03');
    expect(locked?.outcome).toBe('HANDOFF');

    const afterLock = await ask(conv.id, '111.111.111-02'); // CPF válido de cus_demo_b, mas a conversa já está bloqueada
    expect(afterLock?.identity).toBeNull();
    expect(afterLock?.outcome).toBe('HANDOFF');
    expect(afterLock?.toolCalls).toHaveLength(0);
  });

  it('a tentativa falha é auditada SEM gravar o documento digitado', async () => {
    const conv = await newConversation();
    await ask(conv.id, '000.000.000-77');
    const logs = await runWithTenant(TENANT, () =>
      ctx.db.client.auditLog.findMany({ where: { action: 'identity.failed_attempt', entityId: conv.id } }),
    );
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs[0].metadata)).not.toContain('000');
  });

  describe('Web Chat fora do modo DEMO', () => {
    const original = process.env.ISPAGENT_ENV;
    afterEach(() => {
      process.env.ISPAGENT_ENV = original;
    });

    it('o telefone digitado no Web Chat NÃO identifica ninguém em produção (não prova nada)', async () => {
      process.env.ISPAGENT_ENV = 'production';
      const conv = await newConversation('+5511999990002'); // telefone de cus_demo_b
      const decision = await ask(conv.id, 'quero ver minha fatura');
      expect(decision?.identity).toBeNull();
      expect(decision?.toolCalls).toHaveLength(0);
    });

    it('no modo DEMO o telefone ainda identifica (comportamento de demonstração)', async () => {
      process.env.ISPAGENT_ENV = 'test';
      const conv = await newConversation('+5511999990002');
      const decision = await ask(conv.id, 'quero ver minha fatura');
      expect(decision?.identity?.customerId).toBe('cus_demo_b');
    });
  });
});

describe('normalização de telefone e documento', () => {
  it('telefone brasileiro casa com ou sem +55/DDI, e valores que não são telefone ficam intactos', () => {
    expect(phoneVariants('+5511999990001')).toEqual(expect.arrayContaining(['+5511999990001', '5511999990001', '11999990001']));
    expect(phoneVariants('(11) 99999-0001')).toEqual(expect.arrayContaining(['11999990001', '+5511999990001']));
    expect(phoneVariants('pulse:abc123')).toEqual(['pulse:abc123']);
    expect(phoneVariants('webchat_user')).toEqual(['webchat_user']);
  });

  it('documento aceita CPF/CNPJ formatado ou não e rejeita o que não tem 11/14 dígitos', () => {
    expect(normalizeDocument('111.111.111-02')).toBe('11111111102');
    expect(normalizeDocument('12.345.678/0001-95')).toBe('12345678000195');
    expect(normalizeDocument('123456')).toBeNull();
    expect(documentVariants('11111111102')).toEqual(['11111111102', '111.111.111-02']);
    expect(documentVariants('12345678000195')).toEqual(['12345678000195', '12.345.678/0001-95']);
  });
});
