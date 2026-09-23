import { Injectable, Logger } from '@nestjs/common';
import { PulseAnomalyDetail, PulseCustomer360 } from './pulseisp-mapper';
import { PulseIspConnectionService } from './pulseisp-connection.service';

const REQUEST_TIMEOUT_MS = 15_000;
// O JWT de acesso do PulseISP dura 15 min por padrão (PULSEISP_JWT_ACCESS_TTL_SECONDS=900) — renova antes.
const TOKEN_REUSE_MS = 10 * 60_000;

export interface PulseCustomerSummary {
  id: string;
  externalId: string;
  name: string;
  city: string | null;
  neighborhood: string | null;
  status: string;
  healthScore: number | null;
  healthBand: string | null;
  contract: { plan: { name: string; downloadMbps: number } | null } | null;
}

export class PulseIspError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'PulseIspError';
  }
}

/**
 * Cliente HTTP do PulseISP — SOMENTE leitura (só chama GETs de consulta + o login). Endpoints e formatos
 * lidos do OpenAPI/código do próprio PulseISP (`/api/docs-json`), não inventados. Login com e-mail/senha
 * do tenant (JWT); o token é reaproveitado por alguns minutos e renovado sozinho em caso de 401.
 */
@Injectable()
export class PulseIspClient {
  private readonly logger = new Logger(PulseIspClient.name);
  private readonly tokens = new Map<string, { token: string; expiresAt: number }>();

  constructor(private readonly connections: PulseIspConnectionService) {}

  /** Chamado ao salvar credenciais novas — descarta tokens do login antigo. */
  forget(tenantId: string) {
    for (const key of this.tokens.keys()) if (key.startsWith(`${tenantId}|`)) this.tokens.delete(key);
  }

  private async conn(tenantId: string) {
    const c = await this.connections.getRaw(tenantId);
    if (!c) throw new PulseIspError('PulseISP não configurado para este tenant (tela "PulseISP").');
    return c;
  }

  private async login(c: { baseUrl: string; email: string; password: string }, key: string): Promise<string> {
    let res: Response;
    try {
      res = await fetch(`${c.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: c.email, password: c.password }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new PulseIspError(`Não consegui falar com o PulseISP em ${c.baseUrl}: ${networkReason(err)}`);
    }
    if (res.status === 401 || res.status === 400) {
      throw new PulseIspError('Login recusado pelo PulseISP — confira e-mail e senha.', res.status);
    }
    if (res.status === 429) {
      throw new PulseIspError('PulseISP limitou as tentativas de login (429) — aguarde um minuto.', 429);
    }
    if (!res.ok) throw new PulseIspError(`PulseISP respondeu HTTP ${res.status} no login.`, res.status);

    const body = (await res.json()) as { accessToken?: string };
    if (!body.accessToken) throw new PulseIspError('Resposta de login do PulseISP sem accessToken.');
    this.tokens.set(key, { token: body.accessToken, expiresAt: Date.now() + TOKEN_REUSE_MS });
    return body.accessToken;
  }

  private async get<T>(tenantId: string, path: string, allowRetry = true): Promise<T> {
    const c = await this.conn(tenantId);
    const key = `${tenantId}|${c.baseUrl}|${c.email}`;
    const cached = this.tokens.get(key);
    const token = cached && cached.expiresAt > Date.now() ? cached.token : await this.login(c, key);

    let res: Response;
    try {
      res = await fetch(`${c.baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new PulseIspError(`Não consegui falar com o PulseISP: ${networkReason(err)}`);
    }

    if (res.status === 401 && allowRetry) {
      this.tokens.delete(key);
      return this.get<T>(tenantId, path, false);
    }
    if (res.status === 404) throw new PulseIspError('Não encontrado no PulseISP.', 404);
    if (!res.ok) throw new PulseIspError(`PulseISP respondeu HTTP ${res.status}.`, res.status);
    return (await res.json()) as T;
  }

  async searchCustomers(tenantId: string, search: string) {
    const q = encodeURIComponent(search.trim().slice(0, 80));
    return this.get<{ items: PulseCustomerSummary[]; total: number }>(tenantId, `/customers?search=${q}&pageSize=15`);
  }

  async customer360(tenantId: string, customerId: string) {
    return this.get<PulseCustomer360>(tenantId, `/customers/${encodeURIComponent(customerId)}`);
  }

  /** `null` se falhar — o mapeador cai num escopo genérico em vez de derrubar o diagnóstico inteiro. */
  async anomalyDetail(tenantId: string, anomalyId: string): Promise<PulseAnomalyDetail | null> {
    try {
      return await this.get<PulseAnomalyDetail>(tenantId, `/anomalies/${encodeURIComponent(anomalyId)}?pageSize=1`);
    } catch (err) {
      this.logger.warn(`Detalhe da anomalia ${anomalyId} indisponível: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }

  /** Botão "Testar": prova login + leitura de verdade (total de clientes monitorados). */
  async ping(tenantId: string): Promise<{ totalCustomers: number }> {
    const r = await this.get<{ total: number }>(tenantId, '/customers?pageSize=1');
    return { totalCustomers: r.total };
  }
}

function networkReason(err: unknown): string {
  const e = err as { name?: string; cause?: { code?: string } };
  if (e?.name === 'TimeoutError') return `sem resposta em ${REQUEST_TIMEOUT_MS / 1000}s`;
  return e?.cause?.code ?? (err instanceof Error ? err.message : String(err));
}
