import { BadGatewayException, Controller, Get, NotFoundException, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../common/decorators/roles.decorator';
import { currentTenantId } from '../common/tenant-context';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { WahaClient, WahaError } from './waha.client';

/**
 * Tela "WhatsApp" do painel: o provedor conecta o número lendo o QR Code AQUI, sem abrir o WAHA. Só admin
 * do tenant — conectar/desconectar muda o canal de atendimento de todos os clientes.
 */
@Controller('whatsapp-web')
export class WahaController {
  constructor(
    private readonly waha: WahaClient,
    private readonly db: TenantPrismaService,
  ) {}

  @Get('status')
  @Roles('TENANT_ADMIN', 'SUPER_ADMIN')
  async status() {
    if (!this.waha.isAvailableFor(currentTenantId() as string)) return { configured: false };
    return { configured: true, ...(await this.call(() => this.waha.status())) };
  }

  @Post('connect')
  @Roles('TENANT_ADMIN', 'SUPER_ADMIN')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async connect(@Req() req: Request) {
    this.assertAvailable();
    await this.call(() => this.waha.start());
    await this.audit(req, 'whatsapp_web.connect_started');
    return this.call(() => this.waha.status());
  }

  // O QR muda a cada ~20 s; a tela consulta a cada poucos segundos enquanto espera a leitura.
  @Get('qr')
  @Roles('TENANT_ADMIN', 'SUPER_ADMIN')
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  async qr() {
    this.assertAvailable();
    return this.call(() => this.waha.qr());
  }

  @Post('disconnect')
  @Roles('TENANT_ADMIN', 'SUPER_ADMIN')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async disconnect(@Req() req: Request) {
    this.assertAvailable();
    await this.call(() => this.waha.logout());
    await this.audit(req, 'whatsapp_web.disconnected');
    return this.call(() => this.waha.status());
  }

  private assertAvailable() {
    if (!this.waha.isAvailableFor(currentTenantId() as string)) {
      throw new NotFoundException('WhatsApp por QR Code não está habilitado para este provedor.');
    }
  }

  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof WahaError) throw new BadGatewayException(err.message);
      throw err;
    }
  }

  private audit(req: Request, action: string) {
    const tenantId = currentTenantId() as string;
    return this.db.client.auditLog.create({
      data: {
        tenantId,
        actorType: 'USER',
        actorId: req.user!.userId,
        action,
        entityType: 'Tenant',
        entityId: tenantId,
        metadata: {},
      },
    });
  }
}
