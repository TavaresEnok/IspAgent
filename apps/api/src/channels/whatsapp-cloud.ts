import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Integração mínima com a WhatsApp Cloud API (Meta): validação da assinatura do webhook, download de
 * mídia e envio de texto. Configuração só por variável de ambiente (ver .env.example).
 */
const GRAPH = 'https://graph.facebook.com/v21.0';
const TIMEOUT_MS = 15_000;
/** Mídia maior que isso não é baixada (custo/abuso); o cliente é orientado a escrever. */
const MAX_MEDIA_BYTES = 6 * 1024 * 1024;

export function whatsappEnabled(): boolean {
  return process.env.ISPAGENT_CHANNEL_WHATSAPP_ENABLED === 'true';
}

/**
 * `X-Hub-Signature-256: sha256=<hmac>` calculado pela Meta sobre o corpo BRUTO com o App Secret. Sem
 * isso qualquer um poderia postar "mensagens" com o número de um cliente e ser atendido como ele.
 */
export function isValidMetaSignature(rawBody: Buffer | undefined, header: string | undefined): boolean {
  const secret = process.env.ISPAGENT_WHATSAPP_APP_SECRET;
  if (!secret || !rawBody || !header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function accessToken(): string {
  const token = process.env.ISPAGENT_WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new Error('ISPAGENT_WHATSAPP_ACCESS_TOKEN não configurado.');
  return token;
}

/** Baixa uma mídia recebida (áudio/imagem) pelo id da Meta e devolve base64 + mime, ou `null`. */
export async function downloadWhatsAppMedia(mediaId: string): Promise<{ base64: string; mimeType: string } | null> {
  if (!/^\d{1,40}$/.test(mediaId)) return null;
  const headers = { Authorization: `Bearer ${accessToken()}` };
  const meta = await fetch(`${GRAPH}/${mediaId}`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!meta.ok) return null;
  const info = (await meta.json()) as { url?: string; mime_type?: string; file_size?: number };
  if (!info.url || (info.file_size ?? 0) > MAX_MEDIA_BYTES) return null;
  // A URL de mídia é sempre do CDN da Meta; não seguir para outro host (SSRF).
  if (!/^https:\/\/[a-z0-9.-]+\.(fbsbx|facebook|whatsapp)\.(com|net)\//i.test(info.url)) return null;

  const file = await fetch(info.url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!file.ok) return null;
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > MAX_MEDIA_BYTES) return null;
  return { base64: buffer.toString('base64'), mimeType: (info.mime_type ?? 'application/octet-stream').split(';')[0] };
}

/** Envia texto para o cliente. Devolve `false` (sem lançar) se o canal não estiver configurado ou falhar. */
export async function sendWhatsAppText(to: string, text: string): Promise<boolean> {
  const phoneNumberId = process.env.ISPAGENT_WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneNumberId || !process.env.ISPAGENT_WHATSAPP_ACCESS_TOKEN) return false;
  try {
    const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text.slice(0, 4096) } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}
