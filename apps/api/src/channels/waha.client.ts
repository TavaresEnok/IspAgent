import { Injectable } from '@nestjs/common';

const TIMEOUT_MS = 15_000;

/** Estados da sessão no WAHA (`SessionInfo.status`). */
export type WahaStatus =
  | 'STOPPED'
  | 'STARTING'
  | 'SCAN_QR_CODE'
  | 'PASSKEY_REQUIRED'
  | 'PASSKEY_CONFIRMATION_REQUIRED'
  | 'WORKING'
  | 'FAILED';

export interface WahaSession {
  /** `null` = a sessão ainda não existe no WAHA (nunca foi conectada). */
  status: WahaStatus | null;
  /** Número conectado (só dígitos) e nome do perfil, quando `WORKING`. */
  phone: string | null;
  pushName: string | null;
}

export class WahaError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'WahaError';
  }
}

/**
 * WAHA ("WhatsApp HTTP API", conexão por QR Code como o WhatsApp Web). O painel do ISPAgent conecta e
 * desconecta o número por aqui — o provedor não precisa abrir o WAHA. A chave da API fica só no servidor.
 *
 * O WAHA Core tem uma única sessão (`default`), então o número pertence a UM tenant, definido por
 * `ISPAGENT_WAHA_TENANT_ID` (mesmo modelo do WhatsApp Cloud).
 */
@Injectable()
export class WahaClient {
  /** Trocável nos testes (nenhum teste fala com um WAHA de verdade). */
  fetchImpl: typeof fetch = (...args) => fetch(...args);

  private get config() {
    return {
      baseUrl: (process.env.ISPAGENT_WAHA_URL ?? '').trim().replace(/\/+$/, ''),
      apiKey: (process.env.ISPAGENT_WAHA_API_KEY ?? '').trim(),
      session: (process.env.ISPAGENT_WAHA_SESSION ?? '').trim() || 'default',
      tenantId: (process.env.ISPAGENT_WAHA_TENANT_ID ?? '').trim(),
    };
  }

  /** Configurado E pertencente a este tenant: outro provedor nunca vê nem mexe neste número. */
  isAvailableFor(tenantId: string): boolean {
    const c = this.config;
    return Boolean(c.baseUrl && c.apiKey && c.tenantId && c.tenantId === tenantId);
  }

  async status(): Promise<WahaSession> {
    const { session } = this.config;
    const info = await this.request<{ status: WahaStatus; me?: { id?: string; pushName?: string } | null }>(
      'GET',
      `/api/sessions/${session}`,
      { allow404: true },
    );
    if (!info) return { status: null, phone: null, pushName: null };
    const phone = info.me?.id ? info.me.id.split('@')[0].replace(/\D/g, '') || null : null;
    return { status: info.status, phone, pushName: info.me?.pushName ?? null };
  }

  /** Cria a sessão na primeira vez; depois só inicia (idempotente se já estiver rodando). */
  async start(): Promise<void> {
    const { session } = this.config;
    const current = await this.status();
    if (current.status === null) {
      await this.request('POST', '/api/sessions', { body: { name: session, start: true } });
      return;
    }
    if (current.status === 'STOPPED' || current.status === 'FAILED') {
      await this.request('POST', `/api/sessions/${session}/start`);
    }
  }

  /** QR Code atual como imagem PNG em base64 (só existe enquanto o status é `SCAN_QR_CODE`). */
  async qr(): Promise<{ mimetype: string; data: string }> {
    const { session } = this.config;
    const res = await this.request<{ mimetype?: string; data?: string }>('GET', `/api/${session}/auth/qr?format=image`, {
      accept: 'application/json',
    });
    if (!res?.data) throw new WahaError('O WAHA não devolveu o QR Code.');
    return { mimetype: res.mimetype || 'image/png', data: res.data };
  }

  /** Desconecta o número (o celular sai de "aparelhos conectados") e para a sessão. */
  async logout(): Promise<void> {
    const { session } = this.config;
    await this.request('POST', `/api/sessions/${session}/logout`, { allow404: true });
    await this.request('POST', `/api/sessions/${session}/stop`, { allow404: true });
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    opts: { body?: unknown; allow404?: boolean; accept?: string } = {},
  ): Promise<T | null> {
    const { baseUrl, apiKey } = this.config;
    if (!baseUrl || !apiKey) throw new WahaError('WAHA não configurado (ISPAGENT_WAHA_URL / ISPAGENT_WAHA_API_KEY).');

    let res: Response;
    try {
      res = await this.fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: {
          'X-Api-Key': apiKey,
          Accept: opts.accept ?? 'application/json',
          ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      const e = err as { name?: string };
      throw new WahaError(
        e?.name === 'TimeoutError' ? `O WAHA não respondeu em ${TIMEOUT_MS / 1000}s.` : 'Não consegui falar com o WAHA.',
      );
    }

    if (res.status === 404 && opts.allow404) return null;
    if (res.status === 401 || res.status === 403) throw new WahaError('O WAHA recusou a chave da API.', res.status);
    if (!res.ok) throw new WahaError(`O WAHA respondeu HTTP ${res.status}.`, res.status);
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T | null;
  }
}
