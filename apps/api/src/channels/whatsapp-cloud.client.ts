import { Injectable, Logger, Module } from '@nestjs/common';

export type WhatsAppDelivery = { delivered: true; messageId?: string } | { delivered: false; reason: string };

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
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
      });
      const json = (await res.json().catch(() => null)) as { messages?: Array<{ id: string }>; error?: { message?: string } } | null;
      if (!res.ok) {
        return { delivered: false, reason: `Meta HTTP ${res.status}: ${json?.error?.message ?? 'erro desconhecido'}` };
      }
      return { delivered: true, messageId: json?.messages?.[0]?.id };
    } catch (err) {
      this.logger.warn(`Falha ao enviar mensagem WhatsApp para ${to}: ${err}`);
      return { delivered: false, reason: `Erro de rede: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  async downloadMedia(mediaId: string): Promise<{ base64: string; mimeType: string } | null> {
    const { token, apiVersion } = this.config;
    if (!this.isConfigured() || !mediaId) return null;
    try {
      const metaRes = await fetch(`https://graph.facebook.com/${apiVersion}/${mediaId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!metaRes.ok) return null;
      const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
      if (!meta.url) return null;
      const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
      if (!fileRes.ok) return null;
      const buf = Buffer.from(await fileRes.arrayBuffer());
      return { base64: buf.toString('base64'), mimeType: meta.mime_type ?? 'application/octet-stream' };
    } catch (err) {
      this.logger.warn(`Falha ao baixar mídia ${mediaId} do WhatsApp: ${err}`);
      return null;
    }
  }
}

@Module({
  providers: [WhatsAppCloudClient],
  exports: [WhatsAppCloudClient],
})
export class WhatsAppCloudModule {}
