import { randomUUID } from 'node:crypto';
import { runWithTenant } from '../src/common/tenant-context';
import { buildOrchestrator } from './helpers/build-orchestrator';
import {
  deniesIdentity,
  isComplaintAboutReply,
  isDocumentPurposeQuestion,
  isDocumentRefusal,
  isHumanRefusal,
  isHumanRequest,
} from '../src/agent/quick-flows';
import { checkReplyAgainstFacts } from '../src/agent/reply-guard';

/**
 * Regressões de uma conversa real de teste (Web Chat, 26/09/2026): o agente transferiu para atendente
 * quem disse "não quero falar com atendente", tratou "e se eu não quiser dar [o CPF]?" como falha de
 * identificação, disse "não encontrei o seu cadastro" logo depois de identificar, mandou boleto para
 * "eu nem pedi boleto" e ignorou o CPF corrigido ("mandei errado, o certo é...").
 */
describe('regressões de conversa', () => {
  describe('regras de texto', () => {
    it.each(['não quero falar com atendente!', 'nao quero atendente', 'sem atendente por favor', 'não preciso de humano'])(
      'recusa de atendente não é pedido de transferência: "%s"',
      (msg) => {
        expect(isHumanRefusal(msg)).toBe(true);
        expect(isHumanRequest(msg)).toBe(false);
      },
    );

    it('pedido de atendente continua valendo', () => {
      expect(isHumanRequest('quero falar com um atendente')).toBe(true);
      expect(isHumanRefusal('quero falar com um atendente')).toBe(false);
    });

    it.each(['para que quer meu cpf?', 'pra que o cpf?', 'por que você precisa do meu documento?', 'cpf pra quê?'])(
      'pergunta sobre o motivo do CPF: "%s"',
      (msg) => expect(isDocumentPurposeQuestion(msg)).toBe(true),
    );

    it.each(['e se eu não quiser da?', 'e se eu não quiser dar?', 'não vou passar meu cpf', 'prefiro não informar'])(
      'recusa de informar o documento: "%s"',
      (msg) => expect(isDocumentRefusal(msg)).toBe(true),
    );

    it.each(['não quero dados móveis', 'minha internet caiu', '041.039.184-03'])('não é recusa: "%s"', (msg) => {
      expect(isDocumentRefusal(msg)).toBe(false);
    });

    it.each(['oxe eu nem pedi boleto de pagamento!', 'eu nao mencionei pagamento em nenhuma mensagem!', 'porque? não foi isso que pedi!'])(
      'reclamação da resposta anterior: "%s"',
      (msg) => expect(isComplaintAboutReply(msg)).toBe(true),
    );

    it.each(['quero o boleto', 'pedi o pix e não chegou', 'não recebi o boleto'])('pedido legítimo: "%s"', (msg) => {
      expect(isComplaintAboutReply(msg)).toBe(false);
    });

    it('"não sou o Alberto" só nega o nome do cadastro vinculado', () => {
      expect(deniesIdentity('não sou alberto sou 041.039.184-03', 'ALBERTO DA SILVA')).toBe(true);
      expect(deniesIdentity('não sou o Álberto', 'Alberto Souza')).toBe(true);
      expect(deniesIdentity('não sou eu que pago', 'Alberto Souza')).toBe(false);
      expect(deniesIdentity('não sou alberto', null)).toBe(false);
    });

    it('reply-guard: com cliente identificado, "não encontrei o seu cadastro" é descartado', () => {
      const reply = 'Como o nosso sistema não encontrou informações para esse documento, posso te encaminhar?';
      expect(checkReplyAgainstFacts(reply, [], { customerIdentified: true }).ok).toBe(false);
      expect(checkReplyAgainstFacts(reply, [], { customerIdentified: false }).ok).toBe(true);
    });

    it('reply-guard: o horário de atendimento configurado pode ser citado', () => {
      const reply = 'Nossa equipe atende de segunda a sexta, das 08h às 18h.';
      expect(checkReplyAgainstFacts(reply, []).ok).toBe(false);
      expect(checkReplyAgainstFacts(reply, [], { trustedTexts: ['Segunda a Sexta, 08h às 18h'] }).ok).toBe(true);
    });
  });

  describe('conversa completa', () => {
    let ctx: Awaited<ReturnType<typeof buildOrchestrator>>;
    const TENANT = 'tnt_demo_alpha';

    beforeAll(async () => {
      ctx = await buildOrchestrator();
    });

    afterAll(async () => {
      await ctx.prisma.$disconnect();
    });

    async function newConversation() {
      return runWithTenant(TENANT, () =>
        ctx.db.client.conversation.create({
          data: { tenantId: TENANT, channel: 'WEBCHAT', channelUserId: `wc_${randomUUID()}`, status: 'AI_ACTIVE' },
        }),
      );
    }

    const ask = (conversationId: string, message: string) =>
      runWithTenant(TENANT, () => ctx.orchestrator.handleMessage(conversationId, message));

    const lastReply = async (conversationId: string) =>
      runWithTenant(TENANT, async () => {
        const m = await ctx.db.client.message.findFirstOrThrow({
          where: { conversationId, role: { in: ['AGENT', 'SYSTEM'] } },
          orderBy: { createdAt: 'desc' },
        });
        return m.content;
      });

    const handoffs = (conversationId: string) =>
      runWithTenant(TENANT, () => ctx.db.client.handoff.count({ where: { conversationId } }));

    it('perguntar o motivo do CPF, recusar informar e recusar atendente não transferem ninguém', async () => {
      const conv = await newConversation();
      await ask(conv.id, 'quero ver minha fatura');
      expect(await lastReply(conv.id)).toMatch(/CPF/);

      await ask(conv.id, 'para que quer meu cpf?');
      expect(await lastReply(conv.id)).toMatch(/localizar o seu cadastro/);

      const refusal = await ask(conv.id, 'e se eu não quiser da?');
      expect(refusal?.outcome).toBe('ANSWERED');
      expect(await lastReply(conv.id)).toMatch(/não é obrigado/);

      const noHuman = await ask(conv.id, 'não quero falar com atendente!');
      expect(noHuman?.outcome).toBe('ANSWERED');
      expect(await lastReply(conv.id)).not.toMatch(/transferindo/i);

      expect(await handoffs(conv.id)).toBe(0);
    });

    it('logo depois de identificar, confirma o cadastro em vez de dizer que não encontrou', async () => {
      const conv = await newConversation();
      await ask(conv.id, 'bom dia');
      const decision = await ask(conv.id, '111.111.111-02');
      expect(decision?.identity?.customerId).toBe('cus_demo_b');
      const reply = await lastReply(conv.id);
      expect(reply).toMatch(/Bruno.*Localizei o seu cadastro/);
      expect(reply).not.toMatch(/não encontr/i);
    });

    it('"eu nem pedi boleto" não consulta a fatura de novo', async () => {
      const conv = await newConversation();
      await ask(conv.id, '111.111.111-02');
      const decision = await ask(conv.id, 'oxe eu nem pedi boleto de pagamento!');
      expect(decision?.intent).toBe('OUTRO');
      expect(decision?.policyDecisions.some((d) => d.action === 'billing.view')).toBe(false);
    });

    it('CPF corrigido no meio da conversa troca o cadastro vinculado', async () => {
      const conv = await newConversation();
      await ask(conv.id, '111.111.111-02');
      const decision = await ask(conv.id, 'na verdade eu mandei meu cpf errado, o certo é 111.111.111-03');
      expect(decision?.identity?.customerId).toBe('cus_demo_c');
      expect(await lastReply(conv.id)).toMatch(/Carla.*Troquei para o cadastro/);
    });

    it('CPF corrigido que não existe desvincula o cadastro anterior', async () => {
      const conv = await newConversation();
      await ask(conv.id, '111.111.111-02');
      const decision = await ask(conv.id, 'o certo é 999.999.999-99');
      expect(decision?.identity).toBeNull();
      const stored = await runWithTenant(TENANT, () =>
        ctx.db.client.conversation.findUniqueOrThrow({ where: { id: conv.id } }),
      );
      expect(stored.customerId).toBeNull();
    });

    it('"não sou o Bruno" desvincula e pede o documento certo', async () => {
      const conv = await newConversation();
      await ask(conv.id, '111.111.111-02');
      const decision = await ask(conv.id, 'não sou o Bruno');
      expect(decision?.identity).toBeNull();
      expect(await lastReply(conv.id)).toMatch(/Desvinculei/);
      const next = await ask(conv.id, '111.111.111-03');
      expect(next?.identity?.customerId).toBe('cus_demo_c');
    });
  });
});
