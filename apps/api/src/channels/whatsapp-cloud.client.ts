import { Injectable, Logger, Module } from '@nestjs/common';
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

/**
 * WhatsApp Cloud API (Meta). A resposta do webhook não chega ao cliente: toda mensagem de saída precisa
 * de POST /{phone-number-id}/messages. Mídia recebida vem só como id — o conteúdo é baixado aqui.
 */
@Injectable()
export class WhatsAppCloudClient {
  private readonly logger = new Logger(WhatsAppCloudClient.name);

  private get config() {
    return {
      token: process.env.ISPAGENT_WHATSAPP_ACCESS_TOKEN ?? '',
      phoneNumberId: process.env.ISPAGENT_WHATSAPP_PHONE_NUMBER_ID ?? '',
      apiVersion: process.env.ISPAGENT_WHATSAPP_API_VERSION || 'v21.0',
    };
  }

  isConfigured(): boolean {
    const { token, phoneNumberId } = this.config;
    return Boolean(token && phoneNumberId);
  }

  async sendText(to: string, body: string): Promise<WhatsAppDelivery> {
    const { token, phoneNumberId, apiVersion } = this.config;
    if (!this.isConfigured()) {
      return { delivered: false, reason: 'WhatsApp não configurado (ISPAGENT_WHATSAPP_ACCESS_TOKEN / ISPAGENT_WHATSAPP_PHONE_NUMBER_ID).' };
    }
    try {
      const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
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

  async downloadMedia(mediaId: string | undefined): Promise<{ base64: string; mimeType: string } | null> {
    const { token, apiVersion } = this.config;
    if (!this.isConfigured() || !mediaId || !/^\d{1,40}$/.test(mediaId)) return null;
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const metaRes = await fetch(`https://graph.facebook.com/${apiVersion}/${mediaId}`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
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
  providers: [WhatsAppCloudClient],
  exports: [WhatsAppCloudClient],
})
export class WhatsAppCloudModule {}
