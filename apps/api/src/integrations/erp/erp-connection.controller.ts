import { Body, Controller, Get, Post, Put, Req } from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator';
import { currentTenantId } from '../../common/tenant-context';
import { PrismaService } from '../../prisma/prisma.service';
import { ERP_PROVIDERS, ErpConnectionService, ErpProvider } from './erp-connection.service';
import { SgpClientService } from './sgp-client.service';

class SaveErpDto {
  @IsIn(ERP_PROVIDERS) provider!: ErpProvider;
  @IsOptional() @IsString() @MaxLength(300) baseUrl?: string;
  @IsOptional() @IsString() @MaxLength(80) app?: string;
  @IsOptional() @IsString() @MaxLength(200) token?: string;
}

/** Tela "ERP": qual sistema de gestão este provedor usa e com que credenciais (token nunca volta). */
@Controller('erp/connection')
export class ErpConnectionController {
  constructor(
    private readonly connections: ErpConnectionService,
    private readonly sgp: SgpClientService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @Roles('TENANT_ADMIN')
  view() {
    return this.connections.view(currentTenantId() as string);
  }

  @Put()
  @Roles('TENANT_ADMIN')
  async save(@Body() dto: SaveErpDto, @Req() req: Request) {
    const tenantId = currentTenantId() as string;
    const view = await this.connections.save(tenantId, dto);
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorType: 'USER',
        actorId: req.user!.userId,
        action: 'erp.connection_saved',
        entityType: 'Tenant',
        entityId: tenantId,
        metadata: { provider: view.provider, baseUrl: view.baseUrl },
      },
    });
    return view;
  }

  /** Prova login + leitura de verdade (catálogo de planos) com as credenciais salvas. */
  @Post('test')
  @Roles('TENANT_ADMIN')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async test() {
    const view = await this.connections.view(currentTenantId() as string);
    if (view.provider === 'demo') return { ok: true, message: 'Modo demonstração: usa a base de exemplo do ISPAgent.' };
    const started = Date.now();
    try {
      const res = (await this.sgp.consultarPlanos()) as { planos?: unknown[] } | unknown[];
      const count = Array.isArray(res) ? res.length : (res?.planos?.length ?? 0);
      return { ok: true, latencyMs: Date.now() - started, message: `Conectado ao SGP — ${count} planos no catálogo.` };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - started, message: err instanceof Error ? err.message : String(err) };
    }
  }
}
