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
  /** Modo teste: a IA só responde a estes números. */
  testMode: boolean;
  allowedNumbers: string[];
}

/** Mensagem mais velha que isto quando chega (fila acumulada ao reconectar o número) não é respondida. */
export const STALE_MESSAGE_SECONDS = 5 * 60;

/**
 * Chave de comparação de telefone brasileiro: sem o 55 e sem o nono dígito — "5511987654321",
 * "11987654321" e "1187654321" são o mesmo número (o WhatsApp às vezes entrega sem o 9).
 */
export function phoneKey(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length === 11 && d[2] === '9') d = d.slice(0, 2) + d.slice(3);
  return d;
}

export function parseNumberList(numbers: string[] | string): string[] {
  const list = Array.isArray(numbers) ? numbers : numbers.split(',');
  return [...new Set(list.map((n) => n.replace(/\D/g, '')).filter((n) => n.length >= 10 && n.length <= 15))];
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
      testMode: Boolean(row?.testMode),
      allowedNumbers: row ? parseNumberList(row.allowedNumbers) : [],
    };
  }

  /**
   * A IA pode responder esta mensagem? Não, se ela chegou atrasada (fila acumulada ao reconectar o número
   * — responder conversa antiga assusta o cliente) ou se o modo teste está ligado e o número não está na
   * lista. Mensagem recusada aqui não entra na fila nem vira conversa: o WhatsApp do provedor segue normal.
   */
  async accepts(tenantId: string, phone: string, sentAtSeconds?: number | null): Promise<{ ok: true } | { ok: false; reason: 'stale' | 'not_allowed' }> {
    if (sentAtSeconds && Date.now() / 1000 - sentAtSeconds > STALE_MESSAGE_SECONDS) return { ok: false, reason: 'stale' };
    const row = await this.get(tenantId);
    if (!row?.testMode) return { ok: true };
    const key = phoneKey(phone);
    return parseNumberList(row.allowedNumbers).some((n) => phoneKey(n) === key) ? { ok: true } : { ok: false, reason: 'not_allowed' };
  }

  async saveTestMode(tenantId: string, input: { enabled: boolean; numbers: string[] }): Promise<WhatsAppConnectionView> {
    const row = await this.get(tenantId);
    if (!row) throw new BadRequestException('Conecte o WhatsApp antes de configurar o modo teste.');
    const numbers = parseNumberList(input.numbers);
    if (input.enabled && numbers.length === 0) {
      throw new BadRequestException('Com o modo teste ligado, informe ao menos um número que a IA pode atender.');
    }
    await this.prisma.whatsAppConnection.update({
      where: { tenantId },
      data: { testMode: input.enabled, allowedNumbers: numbers.join(',') },
    });
    return this.view(tenantId);
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
