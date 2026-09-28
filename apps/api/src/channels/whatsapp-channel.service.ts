import { BadRequestException, Injectable } from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { encryptSecret, tryDecryptSecret } from '../common/secret-cipher';
import { EvolutionClient } from './evolution.client';

export type WhatsAppProvider = 'evolution' | 'cloud';

/** Formato que a tela "WhatsApp" já usa (antes vinha do WAHA). */
export type WhatsAppWebStatus = 'STOPPED' | 'SCAN_QR_CODE' | 'WORKING';

export interface WhatsAppConnectionView {
  provider: WhatsAppProvider | null;
  /** QR Code (Evolution) */
  evolutionAvailable: boolean;
  status: WhatsAppWebStatus | null;
  phone: string | null;
  pushName: string | null;
  /** API oficial */
  phoneNumberId: string | null;
  hasAccessToken: boolean;
}

/** Nome de instância na Evolution: único por provedor e sem caracteres estranhos. */
export function instanceNameFor(tenantId: string): string {
  return `isp-${tenantId.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 50)}`;
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * WhatsApp de CADA provedor: número por QR Code (uma instância da Evolution) ou API oficial da Meta
 * (phone_number_id + token cifrado). Substitui a configuração única do `.env` (um número por servidor).
 */
@Injectable()
export class WhatsAppChannelService {
  constructor(
    private readonly prisma: PrismaService,
    readonly evolution: EvolutionClient,
  ) {}

  get(tenantId: string) {
    return this.prisma.whatsAppConnection.findUnique({ where: { tenantId } });
  }

  private webhookUrl(instance: string, secret: string): string {
    const base = (process.env.ISPAGENT_EVOLUTION_WEBHOOK_BASE ?? 'http://ispagent-api:3001').trim().replace(/\/+$/, '');
    return `${base}/public/evolution/webhook/${encodeURIComponent(instance)}/${secret}`;
  }

  async view(tenantId: string): Promise<WhatsAppConnectionView> {
    const row = await this.get(tenantId);
    let status: WhatsAppWebStatus | null = null;
    let phone: string | null = null;
    let pushName: string | null = null;
    if (row?.provider === 'evolution' && row.instanceName && this.evolution.isConfigured()) {
      const info = await this.evolution.info(row.instanceName);
      if (info) {
        status = info.state === 'open' ? 'WORKING' : info.state === 'connecting' ? 'SCAN_QR_CODE' : 'STOPPED';
        phone = info.phone;
        pushName = info.pushName;
      }
    }
    return {
      provider: (row?.provider as WhatsAppProvider) ?? null,
      evolutionAvailable: this.evolution.isConfigured(),
      status,
      phone,
      pushName,
      phoneNumberId: row?.provider === 'cloud' ? row.phoneNumberId : null,
      hasAccessToken: Boolean(row?.provider === 'cloud' && row.accessToken),
    };
  }

  /**
   * Conectar por QR Code: cria (ou reaproveita) a instância do provedor com o webhook assinado por um
   * segredo próprio e devolve o QR. Trocar da API oficial para QR Code apaga as credenciais da oficial.
   */
  async connectEvolution(tenantId: string): Promise<{ qr: string | null }> {
    if (!this.evolution.isConfigured()) throw new BadRequestException('WhatsApp por QR Code não está disponível neste servidor.');
    const instance = instanceNameFor(tenantId);
    const row = await this.get(tenantId);
    const secret = (row?.provider === 'evolution' && tryDecryptSecret(row.webhookSecret)) || randomBytes(24).toString('hex');
    await this.prisma.whatsAppConnection.upsert({
      where: { tenantId },
      create: { tenantId, provider: 'evolution', instanceName: instance, webhookSecret: encryptSecret(secret) },
      update: { provider: 'evolution', instanceName: instance, webhookSecret: encryptSecret(secret), phoneNumberId: null, accessToken: null },
    });
    const url = this.webhookUrl(instance, secret);
    if (await this.evolution.info(instance)) await this.evolution.setWebhook(instance, url);
    else await this.evolution.create(instance, url);
    return { qr: await this.evolution.connect(instance) };
  }

  async qr(tenantId: string): Promise<string | null> {
    const row = await this.get(tenantId);
    if (row?.provider !== 'evolution' || !row.instanceName) return null;
    return this.evolution.connect(row.instanceName);
  }

  async disconnect(tenantId: string): Promise<void> {
    const row = await this.get(tenantId);
    if (row?.provider === 'evolution' && row.instanceName) await this.evolution.logout(row.instanceName);
  }

  /** API oficial: token em branco mantém o salvo (se o número não mudou). */
  async saveCloud(tenantId: string, input: { phoneNumberId: string; accessToken?: string }) {
    const phoneNumberId = input.phoneNumberId.trim();
    if (!/^\d{5,30}$/.test(phoneNumberId)) throw new BadRequestException('Informe o Phone Number ID da Meta (só números).');
    const other = await this.prisma.whatsAppConnection.findUnique({ where: { phoneNumberId } });
    if (other && other.tenantId !== tenantId) throw new BadRequestException('Este número já está ligado a outro provedor.');
    const row = await this.get(tenantId);
    const typed = input.accessToken?.trim();
    const keep = row?.provider === 'cloud' && row.phoneNumberId === phoneNumberId ? row.accessToken : null;
    const accessToken = typed ? encryptSecret(typed) : keep;
    if (!accessToken) throw new BadRequestException('Informe o token de acesso da API oficial.');
    if (row?.provider === 'evolution' && row.instanceName) await this.evolution.logout(row.instanceName).catch(() => undefined);
    await this.prisma.whatsAppConnection.upsert({
      where: { tenantId },
      create: { tenantId, provider: 'cloud', phoneNumberId, accessToken },
      update: { provider: 'cloud', phoneNumberId, accessToken, instanceName: null, webhookSecret: null },
    });
    return this.view(tenantId);
  }

  /** Webhook da Evolution: instância + segredo do caminho → provedor (o corpo nunca decide o tenant). */
  async tenantForEvolution(instance: string, secret: string): Promise<string | null> {
    const row = await this.prisma.whatsAppConnection.findUnique({ where: { instanceName: instance } });
    const stored = row?.provider === 'evolution' ? tryDecryptSecret(row.webhookSecret) : null;
    return stored && same(stored, secret) ? row!.tenantId : null;
  }

  /** Webhook da Meta: o número de destino (phone_number_id) diz de qual provedor é a mensagem. */
  async cloudByPhoneNumberId(phoneNumberId: string): Promise<{ tenantId: string; token: string } | null> {
    const row = await this.prisma.whatsAppConnection.findUnique({ where: { phoneNumberId } });
    const token = row?.provider === 'cloud' ? tryDecryptSecret(row.accessToken) : null;
    return token ? { tenantId: row!.tenantId, token } : null;
  }
}
