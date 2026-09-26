import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { runWithTenant } from '../common/tenant-context';
import { ConversationService } from '../conversation/conversation.service';
import { PulseAnomaly, PulseIspClient } from '../integrations/pulseisp/pulseisp-client.service';
import { WhatsAppCloudClient } from './whatsapp-cloud.client';

// Queda coletiva que o cliente sente. Degradação óptica compartilhada fica de fora: nem sempre é
// perceptível e o aviso assustaria mais do que ajudaria.
const NOTIFY_TYPES = new Set(['SHARED_OUTAGE', 'ACCESS_SESSION_DROP']);
const MAX_RECIPIENTS = 500;
const SWEEP_MS = 5 * 60_000;

export function toWhatsAppNumber(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return digits;
  return null;
}

function hhmm(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function incidentStartMessage(company: string, anomaly: PulseAnomaly): string {
  return (
    `⚠️ Aviso da ${company}: identificamos uma falha na rede da sua região desde as ${hhmm(anomaly.firstDetectedAt)}. ` +
    'Nossa equipe já está trabalhando para normalizar. Não é preciso reiniciar seus equipamentos — avisamos por aqui quando a conexão voltar.'
  );
}

export function incidentResolvedMessage(company: string): string {
  return `✅ ${company}: a falha na rede da sua região foi resolvida e a sua conexão já deve estar normal. Se ainda tiver algum problema, é só responder esta mensagem.`;
}

/**
 * Aviso proativo de incidente coletivo detectado pelo PulseISP: uma mensagem por incidente para os
 * clientes afetados e outra quando normaliza. Desligado por padrão (ISPAGENT_INCIDENT_AUTO_NOTIFY=true
 * liga) porque dispara mensagens em massa sem ninguém clicar em nada.
 */
@Injectable()
export class IncidentNotifierService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IncidentNotifierService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly db: TenantPrismaService,
    private readonly pulse: PulseIspClient,
    private readonly conversation: ConversationService,
    private readonly whatsapp: WhatsAppCloudClient,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      this.sweep().catch((err) => this.logger.warn(`Aviso de incidentes falhou: ${err}`));
    }, SWEEP_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async sweep(): Promise<{ notified: number; resolved: number }> {
    const total = { notified: 0, resolved: 0 };
    if (process.env.ISPAGENT_INCIDENT_AUTO_NOTIFY !== 'true' || !this.whatsapp.isConfigured()) return total;

    const tenants = await this.prisma.pulseIspConnection.findMany({ select: { tenantId: true } });
    for (const { tenantId } of tenants) {
      try {
        const r = await runWithTenant(tenantId, () => this.sweepTenant(tenantId));
        total.notified += r.notified;
        total.resolved += r.resolved;
      } catch (err) {
        this.logger.warn(`Aviso de incidentes do tenant ${tenantId} falhou: ${err}`);
      }
    }
    return total;
  }

  async sweepTenant(tenantId: string): Promise<{ notified: number; resolved: number }> {
    const policy = await this.db.client.tenantPolicyConfig.findUnique({ where: { tenantId } });
    const company = policy?.companyName || 'seu provedor';
    const active = (await this.pulse.listActiveAnomalies(tenantId)).filter((a) => NOTIFY_TYPES.has(a.type));
    const activeIds = new Set(active.map((a) => a.id));
    let notified = 0;
    let resolved = 0;

    for (const anomaly of active) {
      const already = await this.db.client.incidentNotification.findUnique({
        where: { tenantId_anomalyId: { tenantId, anomalyId: anomaly.id } },
      });
      if (already) continue;
      // Registra antes de enviar: se outra varredura rodar junto, a chave única impede o aviso duplicado.
      const record = await this.db.client.incidentNotification.create({
        data: { tenantId, anomalyId: anomaly.id, scopeName: anomaly.scopeName, notifiedPhones: [] },
      });
      const phones = await this.affectedPhones(tenantId, anomaly.id);
      const text = incidentStartMessage(company, anomaly);
      const sent: string[] = [];
      for (const phone of phones) {
        if (await this.deliver(phone, text)) sent.push(phone);
      }
      await this.db.client.incidentNotification.update({ where: { id: record.id }, data: { notifiedPhones: sent } });
      notified += sent.length;
    }

    const pending = await this.db.client.incidentNotification.findMany({ where: { resolvedNotifiedAt: null } });
    for (const rec of pending) {
      if (activeIds.has(rec.anomalyId)) continue;
      const { status } = await this.pulse.anomalyCustomers(tenantId, rec.anomalyId, 1);
      if (status !== 'RESOLVED') continue;
      const text = incidentResolvedMessage(company);
      for (const phone of rec.notifiedPhones) {
        if (await this.deliver(phone, text)) resolved++;
      }
      await this.db.client.incidentNotification.update({ where: { id: rec.id }, data: { resolvedNotifiedAt: new Date() } });
    }
    return { notified, resolved };
  }

  private async affectedPhones(tenantId: string, anomalyId: string): Promise<string[]> {
    const phones = new Set<string>();
    for (let page = 1; phones.size < MAX_RECIPIENTS; page++) {
      const { customerIds, totalPages } = await this.pulse.anomalyCustomers(tenantId, anomalyId, page);
      for (const id of customerIds) {
        if (phones.size >= MAX_RECIPIENTS) break;
        const c360 = await this.pulse.customer360(tenantId, id).catch(() => null);
        const phone = toWhatsAppNumber(c360?.customer?.phone);
        if (phone) phones.add(phone);
      }
      if (page >= totalPages) break;
    }
    return [...phones];
  }

  /** Envia e registra na conversa do cliente, para o atendente ver o que foi avisado. */
  private async deliver(phone: string, text: string): Promise<boolean> {
    const delivery = await this.whatsapp.sendText(phone, text);
    const conv = await this.conversation.findOrCreateConversation('WHATSAPP', phone);
    await this.conversation.appendMessage(conv.id, 'AGENT', text);
    return delivery.delivered;
  }
}
