import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { ConversationService } from '../src/conversation/conversation.service';
import { IdentityResolutionService } from '../src/identity/identity-resolution.service';
import { IncidentNotifierService, toWhatsAppNumber } from '../src/channels/incident-notifier.service';
import { PulseIspClient } from '../src/integrations/pulseisp/pulseisp-client.service';
import { WhatsAppCloudClient } from '../src/channels/whatsapp-cloud.client';
import { runWithTenant } from '../src/common/tenant-context';

const TENANT = 'tnt_demo_alpha';

describe('aviso automático de incidente (PulseISP → WhatsApp)', () => {
  let prisma: PrismaService;
  let db: TenantPrismaService;
  let sent: Array<{ to: string; text: string }>;
  let anomalyStatus: Record<string, string>;
  const savedFlag = process.env.ISPAGENT_INCIDENT_AUTO_NOTIFY;
  const phones = ['5581990000001', '5581990000002'];

  const pulse = {
    listActiveAnomalies: async () =>
      Object.entries(anomalyStatus)
        .filter(([, s]) => s === 'ACTIVE')
        .map(([id]) => ({
          id,
          type: id.startsWith('optical') ? 'SHARED_OPTICAL_DEGRADATION' : 'SHARED_OUTAGE',
          status: 'ACTIVE',
          scopeType: 'PON',
          scopeName: 'PON 1/1/3',
          firstDetectedAt: '2026-09-26T12:00:00.000Z',
          affectedCustomers: 2,
        })),
    anomalyCustomers: async (_t: string, id: string) => ({ status: anomalyStatus[id], customerIds: ['c1', 'c2', 'c3'], totalPages: 1 }),
    // c3 sem telefone válido: não recebe nada (nunca inventa destinatário).
    customer360: async (_t: string, id: string) => ({
      customer: { id, phone: { c1: '(81) 99000-0001', c2: '81990000002', c3: '123' }[id] },
    }),
  } as unknown as PulseIspClient;

  const whatsapp = {
    isConfigured: () => true,
    sendText: async (to: string, text: string) => {
      sent.push({ to, text });
      return { delivered: true as const };
    },
  } as unknown as WhatsAppCloudClient;

  let notifier: IncidentNotifierService;

  async function cleanup() {
    await prisma.incidentNotification.deleteMany({ where: { tenantId: TENANT } });
    const convs = await prisma.conversation.findMany({ where: { channelUserId: { in: phones } }, select: { id: true } });
    await prisma.message.deleteMany({ where: { conversationId: { in: convs.map((c) => c.id) } } });
    await prisma.conversation.deleteMany({ where: { id: { in: convs.map((c) => c.id) } } });
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    db = new TenantPrismaService(prisma);
    const conversation = new ConversationService(db, new IdentityResolutionService(db));
    notifier = new IncidentNotifierService(prisma, db, pulse, conversation, whatsapp);
    await cleanup();
  });

  beforeEach(() => {
    sent = [];
    process.env.ISPAGENT_INCIDENT_AUTO_NOTIFY = 'true';
  });

  afterAll(async () => {
    process.env.ISPAGENT_INCIDENT_AUTO_NOTIFY = savedFlag;
    await cleanup();
    await prisma.$disconnect();
  });

  it('normaliza telefone para o formato do WhatsApp', () => {
    expect(toWhatsAppNumber('(81) 99000-0001')).toBe('5581990000001');
    expect(toWhatsAppNumber('5581990000001')).toBe('5581990000001');
    expect(toWhatsAppNumber('123')).toBeNull();
  });

  it('avisa os afetados uma única vez por incidente; ignora degradação óptica', async () => {
    anomalyStatus = { 'outage-1': 'ACTIVE', 'optical-1': 'ACTIVE' };

    await runWithTenant(TENANT, () => notifier.sweepTenant(TENANT));
    expect(sent.map((s) => s.to).sort()).toEqual(phones);
    expect(sent[0].text).toMatch(/falha na rede da sua região desde as 09:00/);

    sent = [];
    await runWithTenant(TENANT, () => notifier.sweepTenant(TENANT));
    expect(sent).toHaveLength(0);
  });

  it('quando normaliza, avisa só quem recebeu o primeiro aviso, uma vez', async () => {
    anomalyStatus = { 'outage-1': 'RESOLVED', 'optical-1': 'ACTIVE' };

    await runWithTenant(TENANT, () => notifier.sweepTenant(TENANT));
    expect(sent.map((s) => s.to).sort()).toEqual(phones);
    expect(sent[0].text).toMatch(/foi resolvida/);

    sent = [];
    await runWithTenant(TENANT, () => notifier.sweepTenant(TENANT));
    expect(sent).toHaveLength(0);
  });

  it('desligado por padrão: sem ISPAGENT_INCIDENT_AUTO_NOTIFY=true não envia nada', async () => {
    delete process.env.ISPAGENT_INCIDENT_AUTO_NOTIFY;
    anomalyStatus = { 'outage-2': 'ACTIVE' };
    const r = await notifier.sweep();
    expect(r).toEqual({ notified: 0, resolved: 0 });
    expect(sent).toHaveLength(0);
  });
});
