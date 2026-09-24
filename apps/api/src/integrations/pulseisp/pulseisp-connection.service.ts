import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { encryptSecret, isEncrypted, tryDecryptSecret } from '../../common/secret-cipher';
import { UnsafeOutboundUrlError, assertSafeOutboundUrl } from '../../common/outbound-url';

/** De dentro do container o PulseISP roda no host (porta 4000) — `host.docker.internal` é o caminho no Docker Desktop. */
export const DEFAULT_PULSEISP_BASE_URL = 'http://host.docker.internal:4000/api';

export interface PulseIspConnectionView {
  configured: boolean;
  baseUrl: string;
  email: string | null;
  hasPassword: boolean;
  updatedAt: string | null;
}

/** Config de como este tenant conversa com o PulseISP (tela "PulseISP" do painel). */
@Injectable()
export class PulseIspConnectionService {
  private readonly logger = new Logger(PulseIspConnectionService.name);

  constructor(private readonly db: TenantPrismaService) {}

  async getView(tenantId: string): Promise<PulseIspConnectionView> {
    const row = await this.getRaw(tenantId);
    return {
      configured: Boolean(row),
      baseUrl: row?.baseUrl ?? DEFAULT_PULSEISP_BASE_URL,
      email: row?.email ?? null,
      hasPassword: Boolean(row?.password),
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  }

  /** Conexão com a senha já decifrada (só em memória). Senha legada em texto puro é regravada cifrada. */
  async getRaw(tenantId: string) {
    const row = await this.db.client.pulseIspConnection.findUnique({ where: { tenantId } });
    if (!row) return row;

    if (!isEncrypted(row.password)) {
      await this.db.client.pulseIspConnection
        .update({ where: { tenantId }, data: { password: encryptSecret(row.password) } })
        .catch((err) => this.logger.warn(`Não consegui cifrar a senha legada do PulseISP: ${err}`));
      return row;
    }

    const password = tryDecryptSecret(row.password);
    if (!password) this.logger.error(`Senha do PulseISP (tenant ${tenantId}) não pôde ser decifrada — regrave a senha.`);
    return { ...row, password: password ?? '' };
  }

  async isConfigured(tenantId: string): Promise<boolean> {
    return Boolean(await this.getRaw(tenantId));
  }

  /** Senha em branco mantém a salva, mas só se o e-mail não mudou (senha de outro login não serve). */
  async save(
    tenantId: string,
    input: { baseUrl: string; email: string; password?: string },
  ): Promise<PulseIspConnectionView> {
    const baseUrl = input.baseUrl.trim().replace(/\/+$/, '');
    if (!/^https?:\/\/[^\s]+$/i.test(baseUrl)) {
      throw new BadRequestException('URL inválida — use algo como http://host.docker.internal:4000/api');
    }
    try {
      await assertSafeOutboundUrl(baseUrl);
    } catch (err) {
      if (err instanceof UnsafeOutboundUrlError) throw new BadRequestException(`URL não permitida: ${err.message}`);
      throw err;
    }
    const email = input.email.trim().toLowerCase();
    const existing = await this.getRaw(tenantId);
    const typed = input.password?.trim();
    const password = typed ? typed : existing && existing.email === email && existing.password ? existing.password : null;
    if (!password) throw new BadRequestException('Informe a senha do login do PulseISP.');

    const storedPassword = encryptSecret(password);
    await this.db.client.pulseIspConnection.upsert({
      where: { tenantId },
      create: { tenantId, baseUrl, email, password: storedPassword },
      update: { baseUrl, email, password: storedPassword },
    });
    return this.getView(tenantId);
  }
}
