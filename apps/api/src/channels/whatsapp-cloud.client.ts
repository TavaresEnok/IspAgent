import { Injectable, Logger, Module, Optional } from '@nestjs/common';
import { currentTenantId } from '../common/tenant-context';
import { tryDecryptSecret } from '../common/secret-cipher';
import { EvolutionClient } from './evolution.client';
import { WhatsAppChannelService } from './whatsapp-channel.service';
import { createHmac, timingSafeEqual } from 'node:crypto';

export type WhatsAppDelivery = { delivered: true; messageId?: string } | { delivered: false; reason: string };

const TIMEOUT_MS = 15_000;
/** Mídia maior que isso não é baixada (custo/abuso); o cliente é orientado a escrever. */
const MAX_MEDIA_BYTES = 6 * 1024 * 1024;

export function whatsappEnabled(): boolean {
  return process.env.ISPAGENT_CHANNEL_WHATSAPP_ENABLED === 'true';
}

/**
 * `X-Hub-Signature-256: sha256=<hmac>` calculado pela Meta sobre o corpo BRUTO com o App Secret. É o único
 * canal em que o número prova a identidade — sem esta checagem qualquer um postaria "mensagens" com o
 * número de um cliente e seria atendido como ele (fatura, PIX, desbloqueio).
 */
export function isValidMetaSignature(rawBody: Buffer | undefined, header: string | undefined): boolean {
  const secret = process.env.ISPAGENT_WHATSAPP_APP_SECRET;
  if (!secret || !rawBody || !header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

type Cloud = { token: string; phoneNumberId: string };

/**
 * Envio de WhatsApp do PROVEDOR ATUAL. Cada provedor tem o seu canal (tela "WhatsApp"): número por QR Code
 * (instância da Evolution) ou API oficial da Meta (número + token dele). O `.env` (um número só) vale
 * apenas para o provedor de `ISPAGENT_WHATSAPP_TENANT_ID` — instalações antigas — ou fora de um provedor
 * (uso isolado nos testes). Nunca manda mensagem de um provedor pelo número de outro.
 *
 * Na API oficial a resposta do webhook não chega ao cliente: toda mensagem de saída é POST
 * /{phone-number-id}/messages. Mídia recebida vem só como id — o conteúdo é baixado aqui.
 */
@Injectable()
export class WhatsAppCloudClient {
  private readonly logger = new Logger(WhatsAppCloudClient.name);

  constructor(@Optional() private readonly channels?: WhatsAppChannelService) {}

  private get env() {
    return {
      token: process.env.ISPAGENT_WHATSAPP_ACCESS_TOKEN ?? '',
      phoneNumberId: process.env.ISPAGENT_WHATSAPP_PHONE_NUMBER_ID ?? '',
      tenantId: process.env.ISPAGENT_WHATSAPP_TENANT_ID ?? '',
      apiVersion: process.env.ISPAGENT_WHATSAPP_API_VERSION || 'v21.0',
    };
  }

  /** API oficial configurada no `.env` (instalação antiga, um número). */
  isConfigured(): boolean {
    const { token, phoneNumberId } = this.env;
    return Boolean(token && phoneNumberId);
  }

  /** Canal do provedor atual: `cloud` (credenciais), `evolution` (instância) ou nenhum. */
  private async route(): Promise<{ kind: 'cloud'; cloud: Cloud } | { kind: 'evolution'; instance: string } | null> {
    const tenantId = currentTenantId();
    if (this.channels && tenantId) {
      const row = await this.channels.get(tenantId);
      if (row?.provider === 'evolution' && row.instanceName) return { kind: 'evolution', instance: row.instanceName };
      if (row?.provider === 'cloud' && row.phoneNumberId) {
        const token = tryDecryptSecret(row.accessToken);
        if (token) return { kind: 'cloud', cloud: { token, phoneNumberId: row.phoneNumberId } };
      }
    }
    const env = this.env;
    const envAllowed = !this.channels || !tenantId || tenantId === env.tenantId;
    return this.isConfigured() && envAllowed ? { kind: 'cloud', cloud: { token: env.token, phoneNumberId: env.phoneNumberId } } : null;
  }

  /** Há um canal de WhatsApp para o provedor atual. */
  async canSend(): Promise<boolean> {
    return (await this.route()) !== null;
  }

  async sendText(to: string, body: string): Promise<WhatsAppDelivery> {
    const route = await this.route();
    if (!route) return { delivered: false, reason: 'WhatsApp não configurado para este provedor (tela "WhatsApp").' };
    if (route.kind === 'evolution') return this.channels!.evolution.sendText(route.instance, to, body);
    const { token, phoneNumberId } = route.cloud;
    try {
      const res = await fetch(`https://graph.facebook.com/${this.env.apiVersion}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: body.slice(0, 4096) } }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const json = (await res.json().catch(() => null)) as { messages?: Array<{ id: string }>; error?: { message?: string } } | null;
      if (!res.ok) {
        return { delivered: false, reason: `Meta HTTP ${res.status}: ${json?.error?.message ?? 'erro desconhecido'}` };
      }
      return { delivered: true, messageId: json?.messages?.[0]?.id };
    } catch (err) {
      this.logger.warn(`Falha ao enviar mensagem WhatsApp: ${err instanceof Error ? err.message : err}`);
      return { delivered: false, reason: `Erro de rede: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  /** Mídia da API oficial, baixada com o token do provedor atual. */
  async downloadMedia(mediaId: string | undefined): Promise<{ base64: string; mimeType: string } | null> {
    const route = await this.route();
    if (route?.kind !== 'cloud' || !mediaId || !/^\d{1,40}$/.test(mediaId)) return null;
    const { token } = route.cloud;
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const metaRes = await fetch(`https://graph.facebook.com/${this.env.apiVersion}/${mediaId}`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!metaRes.ok) return null;
      const meta = (await metaRes.json()) as { url?: string; mime_type?: string; file_size?: number };
      if (!meta.url || (meta.file_size ?? 0) > MAX_MEDIA_BYTES) return null;
      // A URL de mídia é sempre do CDN da Meta; nunca seguir para outro host com o token (SSRF/vazamento).
      if (!/^https:\/\/[a-z0-9.-]+\.(fbsbx|facebook|whatsapp)\.(com|net)\//i.test(meta.url)) return null;

      const fileRes = await fetch(meta.url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!fileRes.ok) return null;
      const buf = Buffer.from(await fileRes.arrayBuffer());
      if (buf.length > MAX_MEDIA_BYTES) return null;
      return { base64: buf.toString('base64'), mimeType: (meta.mime_type ?? 'application/octet-stream').split(';')[0] };
    } catch (err) {
      this.logger.warn(`Falha ao baixar mídia do WhatsApp: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }
}

@Module({
  providers: [WhatsAppCloudClient, WhatsAppChannelService, EvolutionClient],
  exports: [WhatsAppCloudClient, WhatsAppChannelService, EvolutionClient],
})
export class WhatsAppCloudModule {}
