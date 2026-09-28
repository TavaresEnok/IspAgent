import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

export const PLATFORM_TENANT_ID = 'tnt_platform';

/**
 * Dono da plataforma: na subida, se `ISPAGENT_PLATFORM_ADMIN_EMAIL`/`_PASSWORD` estiverem definidos e o
 * usuário ainda não existir, cria o provedor "Plataforma" e o SUPER_ADMIN. Nunca troca a senha de um
 * usuário existente (tirar a senha do .env depois da primeira subida é o recomendado).
 */
@Injectable()
export class PlatformBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(PlatformBootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const email = (process.env.ISPAGENT_PLATFORM_ADMIN_EMAIL ?? '').trim().toLowerCase();
    const password = process.env.ISPAGENT_PLATFORM_ADMIN_PASSWORD ?? '';
    if (!email || !password) return;
    try {
      await this.prisma.tenant.upsert({
        where: { id: PLATFORM_TENANT_ID },
        create: { id: PLATFORM_TENANT_ID, name: 'Plataforma ISPAgent', brandName: 'ISPAgent', slug: 'plataforma' },
        update: {},
      });
      const existing = await this.prisma.user.findFirst({ where: { tenantId: PLATFORM_TENANT_ID, email } });
      if (existing) return;
      if (password.length < 12) {
        this.logger.error('ISPAGENT_PLATFORM_ADMIN_PASSWORD precisa de pelo menos 12 caracteres — SUPER_ADMIN não criado.');
        return;
      }
      await this.prisma.user.create({
        data: { tenantId: PLATFORM_TENANT_ID, email, name: 'Dono da plataforma', role: 'SUPER_ADMIN', passwordHash: await bcrypt.hash(password, 10) },
      });
      this.logger.log(`SUPER_ADMIN da plataforma criado (${email}).`);
    } catch (err) {
      this.logger.error(`Não consegui criar o SUPER_ADMIN da plataforma: ${err instanceof Error ? err.message : err}`);
    }
  }
}
