import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { encryptSecret, tryDecryptSecret } from '../../common/secret-cipher';
import { UnsafeOutboundUrlError, assertSafeOutboundUrl } from '../../common/outbound-url';
import type { SgpConfig } from './sgp-client.service';

export type ErpProvider = 'demo' | 'sgp';
export const ERP_PROVIDERS: ErpProvider[] = ['demo', 'sgp'];

export interface ErpConnectionView {
  provider: ErpProvider;
  baseUrl: string | null;
  app: string | null;
  hasToken: boolean;
  updatedAt: string | null;
}

interface Resolved {
  provider: ErpProvider;
  sgp: SgpConfig | null;
  at: number;
}

const CACHE_MS = 30_000;

/**
 * ERP de CADA provedor (tela "ERP" do painel), com o token cifrado no banco. Antes era um só ERP para o
 * servidor inteiro, lido do `.env` — num SaaS, todos os provedores consultariam o SGP de um deles.
 *
 * O cache (30 s, e renovado na hora ao salvar) permite saber de forma síncrona se o provedor é real ou
 * demonstração (`mode` das ferramentas/auditoria) sem ir ao banco a cada leitura.
 */
@Injectable()
export class ErpConnectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ErpConnectionService.name);
  private readonly cache = new Map<string, Resolved>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.bootstrapFromEnv().catch((err) => this.logger.error(`Migração do ERP do .env falhou: ${err}`));
    await this.refreshAll().catch(() => undefined);
    this.timer = setInterval(() => void this.refreshAll().catch(() => undefined), CACHE_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Provedor do ERP, síncrono (cache); desconhecido = demonstração. */
  providerSync(tenantId: string | undefined | null): ErpProvider {
    return (tenantId && this.cache.get(tenantId)?.provider) || 'demo';
  }

  async resolve(tenantId: string): Promise<Resolved> {
    const hit = this.cache.get(tenantId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit;
    const row = await this.prisma.erpConnection.findUnique({ where: { tenantId } });
    const resolved = this.toResolved(row);
    this.cache.set(tenantId, resolved);
    return resolved;
  }

  async sgpConfig(tenantId: string): Promise<SgpConfig | null> {
    const r = await this.resolve(tenantId);
    return r.provider === 'sgp' ? r.sgp : null;
  }

  async view(tenantId: string): Promise<ErpConnectionView> {
    const row = await this.prisma.erpConnection.findUnique({ where: { tenantId } });
    return {
      provider: (row?.provider as ErpProvider) ?? 'demo',
      baseUrl: row?.baseUrl ?? null,
      app: row?.app ?? null,
      hasToken: Boolean(row?.token),
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  }

  /** Token em branco mantém o salvo (só se a URL não mudou: token de outro SGP não serve). */
  async save(tenantId: string, input: { provider: ErpProvider; baseUrl?: string; app?: string; token?: string }) {
    if (!ERP_PROVIDERS.includes(input.provider)) throw new BadRequestException('ERP não suportado.');
    if (input.provider === 'demo') {
      await this.prisma.erpConnection.upsert({
        where: { tenantId },
        create: { tenantId, provider: 'demo' },
        update: { provider: 'demo' },
      });
    } else {
      const baseUrl = (input.baseUrl ?? '').trim().replace(/\/+$/, '');
      if (!/^https:\/\/[^\s/]+/i.test(baseUrl)) throw new BadRequestException('Informe a URL do SGP com https:// (ex.: https://provedor.sgp.net.br).');
      try {
        await assertSafeOutboundUrl(baseUrl);
      } catch (err) {
        if (err instanceof UnsafeOutboundUrlError) throw new BadRequestException(`URL não permitida: ${err.message}`);
        throw err;
      }
      const app = (input.app ?? '').trim();
      if (!/^[\w.-]{1,80}$/.test(app)) throw new BadRequestException('Informe o nome do app cadastrado no SGP (letras, números, "-" e "_").');
      const existing = await this.prisma.erpConnection.findUnique({ where: { tenantId } });
      const typed = input.token?.trim();
      const keep = existing?.token && existing.baseUrl === baseUrl ? existing.token : null;
      const token = typed ? encryptSecret(typed) : keep;
      if (!token) throw new BadRequestException('Informe o token de API do SGP.');
      await this.prisma.erpConnection.upsert({
        where: { tenantId },
        create: { tenantId, provider: 'sgp', baseUrl, app, token },
        update: { provider: 'sgp', baseUrl, app, token },
      });
    }
    this.cache.delete(tenantId);
    await this.resolve(tenantId);
    return this.view(tenantId);
  }

  private toResolved(row: { provider: string; baseUrl: string | null; app: string | null; token: string | null } | null): Resolved {
    const provider: ErpProvider = row?.provider === 'sgp' ? 'sgp' : 'demo';
    if (provider !== 'sgp') return { provider, sgp: null, at: Date.now() };
    const token = tryDecryptSecret(row?.token);
    const sgp = row?.baseUrl && row.app && token ? { baseUrl: row.baseUrl, app: row.app, token, timeoutMs: 15_000 } : null;
    if (!sgp) this.logger.error('Conexão SGP incompleta ou token ilegível — regrave na tela ERP.');
    return { provider, sgp, at: Date.now() };
  }

  private async refreshAll() {
    const rows = await this.prisma.erpConnection.findMany();
    for (const row of rows) this.cache.set(row.tenantId, this.toResolved(row));
  }

  /**
   * Instalação antiga (um SGP no `.env`): na primeira subida, grava esse SGP no provedor indicado em
   * `ISPAGENT_ERP_BOOTSTRAP_TENANT_ID`, cifrado. Depois disso o `.env` não é mais lido para o ERP.
   */
  private async bootstrapFromEnv() {
    const tenantId = (process.env.ISPAGENT_ERP_BOOTSTRAP_TENANT_ID ?? '').trim();
    const baseUrl = (process.env.ISPAGENT_SGP_BASE_URL ?? '').trim().replace(/\/+$/, '');
    const app = (process.env.ISPAGENT_SGP_APP ?? '').trim();
    const token = (process.env.ISPAGENT_SGP_TOKEN ?? '').trim();
    if (!tenantId || !baseUrl || !app || !token || process.env.ISPAGENT_ERP_PROVIDER !== 'sgp') return;
    if (!(await this.prisma.tenant.findUnique({ where: { id: tenantId } }))) return;
    if (await this.prisma.erpConnection.findUnique({ where: { tenantId } })) return;
    await this.prisma.erpConnection.create({ data: { tenantId, provider: 'sgp', baseUrl, app, token: encryptSecret(token) } });
    this.logger.log(`SGP do .env gravado (cifrado) no provedor ${tenantId}.`);
  }
}
