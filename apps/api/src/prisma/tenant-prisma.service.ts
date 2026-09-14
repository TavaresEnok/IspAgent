import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { tenantScopedExtension } from './tenant-scoped.extension';

/**
 * Cliente Prisma com a extensão de isolamento de tenant aplicada (tenant-scoped.extension.ts).
 * Todo código de domínio (customers, contracts, conversations, tools, policy, handoff, audit, etc.)
 * deve usar `tenantDb.client` em vez de `PrismaService` diretamente. `PrismaService` cru só é aceitável
 * para: healthcheck, login (bootstrap sem tenant conhecido) e administração cross-tenant explícita.
 */
@Injectable()
export class TenantPrismaService {
  public readonly client: ReturnType<typeof tenantScopedExtension>;

  constructor(prisma: PrismaService) {
    this.client = tenantScopedExtension(prisma);
  }
}
