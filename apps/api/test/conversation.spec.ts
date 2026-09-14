import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { IdentityResolutionService } from '../src/identity/identity-resolution.service';
import { ConversationService } from '../src/conversation/conversation.service';
import { runWithTenant } from '../src/common/tenant-context';

/**
 * Conversation Engine (seção 5.2). Cobre: não duplicar conversa para o mesmo canal+usuário, não
 * reexecutar a resolução de identidade uma vez resolvida, e nunca vincular cliente ambíguo/ausente a
 * um contrato (P0.7 na camada de conversa, complementando test/identity.spec.ts).
 *
 * Cada teste limpa suas próprias conversas de teste antes de rodar, para ser repetível independente de
 * execuções anteriores (a idempotência real do sistema não depende de estado "limpo" entre rodadas do
 * `pnpm test`, mas a asserção de "resolveByPhone chamado exatamente 1 vez" precisa de um ponto de
 * partida conhecido).
 */
describe('conversation engine', () => {
  let prisma: PrismaService;
  let db: TenantPrismaService;
  let identity: IdentityResolutionService;
  let conversation: ConversationService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    db = new TenantPrismaService(prisma);
    identity = new IdentityResolutionService(db);
    conversation = new ConversationService(db, identity);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Outros arquivos de teste (agent.spec.ts, billing.spec.ts) também criam conversas ad-hoc usando
  // telefones reais do seed (ex.: +5511999990001), então esta limpeza precisa remover a árvore inteira
  // (ToolCall → AgentRun → Message → Conversation), não só mensagens, para não esbarrar em FK.
  async function resetConversationsFor(phone: string) {
    await runWithTenant('tnt_demo_alpha', async () => {
      const existing = await db.client.conversation.findMany({
        where: { channel: 'WEBCHAT', channelUserId: phone },
      });
      for (const c of existing) {
        const runs = await db.client.agentRun.findMany({ where: { conversationId: c.id } });
        for (const run of runs) {
          await db.client.toolCall.deleteMany({ where: { agentRunId: run.id } });
        }
        await db.client.agentRun.deleteMany({ where: { conversationId: c.id } });
        await db.client.message.deleteMany({ where: { conversationId: c.id } });
        await db.client.conversation.delete({ where: { id: c.id } });
      }
    });
  }

  it('não duplica conversa para o mesmo canal + usuário', async () => {
    const phone = '+5511999990001';
    await resetConversationsFor(phone);

    const first = await runWithTenant('tnt_demo_alpha', () =>
      conversation.findOrCreateConversation('WEBCHAT', phone),
    );
    const second = await runWithTenant('tnt_demo_alpha', () =>
      conversation.findOrCreateConversation('WEBCHAT', phone),
    );

    expect(second.id).toBe(first.id);

    const count = await runWithTenant('tnt_demo_alpha', () =>
      db.client.conversation.count({ where: { channel: 'WEBCHAT', channelUserId: phone } }),
    );
    expect(count).toBe(1);
  });

  it('resolve identidade uma vez e nunca reexecuta a resolução (idempotência)', async () => {
    const phone = '+5511999990001';
    await resetConversationsFor(phone);

    const spy = jest.spyOn(identity, 'resolveByPhone');

    const conv = await runWithTenant('tnt_demo_alpha', () =>
      conversation.findOrCreateConversation('WEBCHAT', phone),
    );

    const first = await runWithTenant('tnt_demo_alpha', () => conversation.resolveIdentity(conv.id));
    const second = await runWithTenant('tnt_demo_alpha', () => conversation.resolveIdentity(conv.id));

    expect(spy).toHaveBeenCalledTimes(1);
    expect(first.method).toBe('PHONE_EXACT');
    expect(second.method).toBe('PHONE_EXACT');
    if (first.method === 'PHONE_EXACT' && second.method === 'PHONE_EXACT') {
      expect(second.customerId).toBe(first.customerId);
      expect(first.customerId).toBe('cus_demo_a');
    }

    const persisted = await runWithTenant('tnt_demo_alpha', () =>
      db.client.conversation.findUniqueOrThrow({ where: { id: conv.id } }),
    );
    expect(persisted.customerId).toBe('cus_demo_a');
    expect(persisted.contractId).toBe('ctt_demo_a');

    spy.mockRestore();
  });

  it('conversa com telefone ambíguo (cus_demo_g/g2) nunca fica vinculada a um cliente', async () => {
    const phone = '+5511999990007';
    await resetConversationsFor(phone);

    const conv = await runWithTenant('tnt_demo_alpha', () =>
      conversation.findOrCreateConversation('WEBCHAT', phone),
    );
    const result = await runWithTenant('tnt_demo_alpha', () => conversation.resolveIdentity(conv.id));

    expect(result.method).toBe('AMBIGUOUS');

    const persisted = await runWithTenant('tnt_demo_alpha', () =>
      db.client.conversation.findUniqueOrThrow({ where: { id: conv.id } }),
    );
    expect(persisted.identityMethod).toBe('AMBIGUOUS');
    expect(persisted.customerId).toBeNull();
    expect(persisted.contractId).toBeNull();
  });

  it('conversa com telefone não cadastrado nunca fica vinculada a um cliente', async () => {
    const phone = '+5511900000001';
    await resetConversationsFor(phone);

    const conv = await runWithTenant('tnt_demo_alpha', () =>
      conversation.findOrCreateConversation('WEBCHAT', phone),
    );
    const result = await runWithTenant('tnt_demo_alpha', () => conversation.resolveIdentity(conv.id));

    expect(result.method).toBe('NOT_FOUND');

    const persisted = await runWithTenant('tnt_demo_alpha', () =>
      db.client.conversation.findUniqueOrThrow({ where: { id: conv.id } }),
    );
    expect(persisted.customerId).toBeNull();
  });

  it('appendMessage registra mensagens na conversa', async () => {
    const phone = '+5511999990001';
    await resetConversationsFor(phone);

    const conv = await runWithTenant('tnt_demo_alpha', () =>
      conversation.findOrCreateConversation('WEBCHAT', phone),
    );
    await runWithTenant('tnt_demo_alpha', () =>
      conversation.appendMessage(conv.id, 'CUSTOMER', 'minha internet caiu'),
    );
    await runWithTenant('tnt_demo_alpha', () =>
      conversation.appendMessage(conv.id, 'AGENT', 'vou verificar seu contrato'),
    );

    const messages = await runWithTenant('tnt_demo_alpha', () =>
      db.client.message.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: 'asc' } }),
    );
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('CUSTOMER');
    expect(messages[1].role).toBe('AGENT');
  });
});
