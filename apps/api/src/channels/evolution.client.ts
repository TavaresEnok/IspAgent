import { Injectable } from '@nestjs/common';

const TIMEOUT_MS = 20_000;

export class EvolutionError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'EvolutionError';
  }
}

/** Estado da conexão de uma instância (`open` = WhatsApp conectado). */
export type EvolutionState = 'open' | 'connecting' | 'close';

export interface EvolutionInstanceInfo {
  state: EvolutionState | null;
  /** Número conectado (só dígitos) e nome do perfil, quando `open`. */
  phone: string | null;
  pushName: string | null;
}

/**
 * Evolution API (WhatsApp por QR Code). Um servidor para a plataforma inteira, UMA INSTÂNCIA POR PROVEDOR
 * (nome guardado em `whatsapp_connections`). A chave global fica só no servidor; a Evolution não tem
 * porta pública — o ISPAgent fala com ela pela rede interna do Docker.
 */
@Injectable()
export class EvolutionClient {
  /** Trocável nos testes (nenhum teste fala com uma Evolution de verdade). */
  fetchImpl: typeof fetch = (...args) => fetch(...args);

  private get config() {
    return {
      baseUrl: (process.env.ISPAGENT_EVOLUTION_URL ?? '').trim().replace(/\/+$/, ''),
      apiKey: (process.env.ISPAGENT_EVOLUTION_API_KEY ?? '').trim(),
    };
  }

  isConfigured(): boolean {
    const c = this.config;
    return Boolean(c.baseUrl && c.apiKey);
  }

  /** `null` = a instância não existe na Evolution. */
  async info(instance: string): Promise<EvolutionInstanceInfo | null> {
    const list = await this.request<Array<{ name?: string; connectionStatus?: string; ownerJid?: string | null; profileName?: string | null }>>(
      'GET',
      `/instance/fetchInstances?instanceName=${encodeURIComponent(instance)}`,
      { allow404: true },
    );
    const row = Array.isArray(list) ? list.find((i) => i.name === instance) : undefined;
    if (!row) return null;
    const state = (['open', 'connecting', 'close'] as const).find((s) => s === row.connectionStatus) ?? 'close';
    const phone = row.ownerJid ? row.ownerJid.split('@')[0].replace(/\D/g, '') || null : null;
    return { state, phone: state === 'open' ? phone : null, pushName: state === 'open' ? (row.profileName ?? null) : null };
  }

  private webhookBody(url: string) {
    // base64: a mídia (áudio, imagem) já vem no próprio evento — nada de baixar de URL externa.
    return { enabled: true, url, byEvents: false, base64: true, events: ['MESSAGES_UPSERT'] };
  }

  async create(instance: string, webhookUrl: string): Promise<void> {
    await this.request('POST', '/instance/create', {
      body: { instanceName: instance, integration: 'WHATSAPP-BAILEYS', qrcode: true, webhook: this.webhookBody(webhookUrl) },
    });
  }

  async setWebhook(instance: string, webhookUrl: string): Promise<void> {
    await this.request('POST', `/webhook/set/${encodeURIComponent(instance)}`, { body: { webhook: this.webhookBody(webhookUrl) } });
  }

  /** Inicia a conexão e devolve o QR Code (data URL PNG); `null` se já estiver conectada. */
  async connect(instance: string): Promise<string | null> {
    const res = await this.request<{ base64?: string }>('GET', `/instance/connect/${encodeURIComponent(instance)}`);
    return res?.base64 && res.base64.startsWith('data:image/') ? res.base64 : null;
  }

  async logout(instance: string): Promise<void> {
    await this.request('DELETE', `/instance/logout/${encodeURIComponent(instance)}`, { allow404: true, allowBadRequest: true });
  }

  async sendText(instance: string, to: string, text: string): Promise<{ delivered: true; messageId?: string } | { delivered: false; reason: string }> {
    try {
      const res = await this.request<{ key?: { id?: string } }>('POST', `/message/sendText/${encodeURIComponent(instance)}`, {
        body: { number: to, text: text.slice(0, 4096) },
      });
      return { delivered: true, messageId: res?.key?.id };
    } catch (err) {
      return { delivered: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    opts: { body?: unknown; allow404?: boolean; allowBadRequest?: boolean } = {},
  ): Promise<T | null> {
    const { baseUrl, apiKey } = this.config;
    if (!baseUrl || !apiKey) throw new EvolutionError('Evolution API não configurada no servidor (ISPAGENT_EVOLUTION_URL / ISPAGENT_EVOLUTION_API_KEY).');
    let res: Response;
    try {
      res = await this.fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: { apikey: apiKey, Accept: 'application/json', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      const e = err as { name?: string };
      throw new EvolutionError(e?.name === 'TimeoutError' ? `A Evolution não respondeu em ${TIMEOUT_MS / 1000}s.` : 'Não consegui falar com a Evolution.');
    }
    if (res.status === 404 && opts.allow404) return null;
    if (res.status === 400 && opts.allowBadRequest) return null;
    if (res.status === 401 || res.status === 403) throw new EvolutionError('A Evolution recusou a chave da API.', res.status);
    if (!res.ok) throw new EvolutionError(`A Evolution respondeu HTTP ${res.status}.`, res.status);
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T | null;
  }
}
