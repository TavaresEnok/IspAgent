import { createHmac } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { ConversationService } from '../src/conversation/conversation.service';
import { ConversationLifecycleService } from '../src/conversation/conversation-lifecycle.service';
import { IdentityResolutionService } from '../src/identity/identity-resolution.service';
import { RealtimeEventsService } from '../src/events/events.service';
import { WhatsAppCloudClient } from '../src/channels/whatsapp-cloud.client';
import { WhatsAppController } from '../src/channels/whatsapp.controller';
import { WhatsAppInboundService } from '../src/channels/whatsapp-inbound.service';
import { AgentOrchestratorService } from '../src/agent/agent-orchestrator.service';
import { AiProviderResolverService } from '../src/integrations/ai/ai-provider-resolver.service';
import { runWithTenant } from '../src/common/tenant-context';

const TENANT = 'tnt_demo_alpha';
const HOUR = 3600_000;

describe('encerramento automático de conversa', () => {
  let prisma: PrismaService;
  let db: TenantPrismaService;
  let conversation: ConversationService;
  let events: RealtimeEventsService;
  let lifecycle: ConversationLifecycleService;
  const created: string[] = [];

  function freshUser() {
    return `lifecycle_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  }

  // Conversa cuja última mensagem tem a idade pedida.
  async function conversationAged(status: 'AI_ACTIVE' | 'HUMAN_ACTIVE', ageMs: number, channel: 'WEBCHAT' | 'WHATSAPP' = 'WEBCHAT') {
    const at = new Date(Date.now() - ageMs);
    return runWithTenant(TENANT, async () => {
      const conv = await db.client.conversation.create({
        data: {
          tenantId: TENANT,
          channel,
          // No WhatsApp o id do canal é o telefone (o webhook só aceita número válido).
          channelUserId: channel === 'WHATSAPP' ? `5511${String(Math.floor(1e8 + Math.random() * 9e8))}` : freshUser(),
          status,
          createdAt: at,
        },
      });
      await db.client.message.create({ data: { tenantId: TENANT, conversationId: conv.id, role: 'CUSTOMER', content: 'oi', createdAt: at } });
      created.push(conv.id);
      return conv;
    });
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    db = new TenantPrismaService(prisma);
    events = new RealtimeEventsService();
    conversation = new ConversationService(db, new IdentityResolutionService(db), events);
    lifecycle = new ConversationLifecycleService(prisma, conversation, events, new WhatsAppCloudClient());
  });

  afterAll(async () => {
    await prisma.satisfactionSurvey.deleteMany({ where: { conversationId: { in: created } } });
    await prisma.message.deleteMany({ where: { conversationId: { in: created } } });
    await prisma.conversation.deleteMany({ where: { id: { in: created } } });
    await prisma.$disconnect();
  });

  it('fecha conversa parada com a IA, avisa o cliente e emite o fechamento em tempo real', async () => {
    const conv = await conversationAged('AI_ACTIVE', 2 * HOUR);
    const seen: string[] = [];
    const sub = events.streamForConversation(TENANT, conv.id).subscribe((e) => seen.push(JSON.stringify(e.data)));

    await lifecycle.closeIdle();
    sub.unsubscribe();

    const after = await runWithTenant(TENANT, () =>
      db.client.conversation.findUniqueOrThrow({ where: { id: conv.id }, include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } } }),
    );
    expect(after.status).toBe('CLOSED');
    expect(after.messages[0]).toMatchObject({ role: 'AGENT' });
    expect(after.messages[0].content).toMatch(/Encerrei este atendimento/);
    expect(seen.some((e) => e.includes('"STATUS_CHANGED"') && e.includes('"CLOSED"'))).toBe(true);
  });

  it('conversa parada há dias fecha em silêncio (sem mensagem nem pedido de nota fora de hora)', async () => {
    const old = await conversationAged('AI_ACTIVE', 3 * 24 * HOUR, 'WHATSAPP');

    await lifecycle.closeIdle();

    const after = await runWithTenant(TENANT, () =>
      db.client.conversation.findUniqueOrThrow({ where: { id: old.id }, include: { messages: true } }),
    );
    expect(after.status).toBe('CLOSED');
    expect(after.messages.map((m) => m.role)).toEqual(['CUSTOMER']);
  });

  it('não fecha conversa recente nem conversa com atendente humano', async () => {
    const recent = await conversationAged('AI_ACTIVE', 60_000);
    const human = await conversationAged('HUMAN_ACTIVE', 5 * HOUR);

    await lifecycle.closeIdle();

    const [r, h] = await runWithTenant(TENANT, () =>
      Promise.all([
        db.client.conversation.findUniqueOrThrow({ where: { id: recent.id } }),
        db.client.conversation.findUniqueOrThrow({ where: { id: human.id } }),
      ]),
    );
    expect(r.status).toBe('AI_ACTIVE');
    expect(h.status).toBe('HUMAN_ACTIVE');
  });

  it('WhatsApp: nota "5" logo após o encerramento vira avaliação daquele atendimento, sem abrir conversa nova', async () => {
    const conv = await conversationAged('AI_ACTIVE', 2 * HOUR, 'WHATSAPP');
    await lifecycle.closeIdle();

    // O webhook só aceita requisição assinada pela Meta; a resposta vai pela API da Meta, não pelo HTTP.
    const secret = 'segredo-de-teste-whatsapp';
    const saved = { ...process.env };
    Object.assign(process.env, {
      ISPAGENT_CHANNEL_WHATSAPP_ENABLED: 'true',
      ISPAGENT_WHATSAPP_APP_SECRET: secret,
      ISPAGENT_WHATSAPP_TENANT_ID: TENANT,
    });
    try {
      const cloud = new WhatsAppCloudClient();
      const inbound = new WhatsAppInboundService(
        {} as AgentOrchestratorService,
        conversation,
        db,
        { resolve: async () => ({}) } as unknown as AiProviderResolverService,
        cloud,
      );
      const controller = new WhatsAppController(prisma, inbound, cloud);
      const body = { entry: [{ changes: [{ value: { messages: [{ from: conv.channelUserId, type: 'text', text: { body: '5' } }] } }] }] };
      const rawBody = Buffer.from(JSON.stringify(body));
      const signature = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
      const res = await controller.handleIncoming({ rawBody } as never, body, signature);
      expect(res).toEqual({ status: 'received' });
    } finally {
      for (const k of ['ISPAGENT_CHANNEL_WHATSAPP_ENABLED', 'ISPAGENT_WHATSAPP_APP_SECRET', 'ISPAGENT_WHATSAPP_TENANT_ID']) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }

    const [surveys, open] = await runWithTenant(TENANT, () =>
      Promise.all([
        db.client.satisfactionSurvey.findMany({ where: { conversationId: conv.id } }),
        db.client.conversation.count({ where: { channelUserId: conv.channelUserId, status: { not: 'CLOSED' } } }),
      ]),
    );
    expect(surveys).toHaveLength(1);
    expect(open).toBe(0);
  });
});
