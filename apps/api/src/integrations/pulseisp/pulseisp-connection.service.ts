import { BadRequestException, Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

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
  constructor(private readonly db: TenantPrismaService) {}

  async getView(tenantId: string): Promise<PulseIspConnectionView> {
    const row = await this.db.client.pulseIspConnection.findUnique({ where: { tenantId } });
    return {
      configured: Boolean(row),
      baseUrl: row?.baseUrl ?? DEFAULT_PULSEISP_BASE_URL,
      email: row?.email ?? null,
      hasPassword: Boolean(row?.password),
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  }

  async getRaw(tenantId: string) {
    return this.db.client.pulseIspConnection.findUnique({ where: { tenantId } });
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
    const email = input.email.trim().toLowerCase();
    const existing = await this.getRaw(tenantId);
    const typed = input.password?.trim();
    const password = typed ? typed : existing && existing.email === email ? existing.password : null;
    if (!password) throw new BadRequestException('Informe a senha do login do PulseISP.');

    await this.db.client.pulseIspConnection.upsert({
      where: { tenantId },
      create: { tenantId, baseUrl, email, password },
      update: { baseUrl, email, password },
    });
    return this.getView(tenantId);
  }
}
