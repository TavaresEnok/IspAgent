import { BadRequestException, Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { currentTenantId } from '../../common/tenant-context';
import { Roles } from '../../common/decorators/roles.decorator';
import { PulseIspConnectionService } from './pulseisp-connection.service';
import { PulseIspClient, PulseIspError } from './pulseisp-client.service';
import { PulseIspMirrorService } from './pulseisp-mirror.service';

class SaveConnectionDto {
  @IsString() @MaxLength(300) baseUrl!: string;
  @IsString() @MaxLength(200) email!: string;
  @IsOptional() @IsString() @MaxLength(200) password?: string;
}

class SimulateDto {
  @IsString() @MinLength(1) @MaxLength(120) customerId!: string;
}

/**
 * Tela "PulseISP" do painel: conexão do ISPAgent com o PulseISP do tenant + simulador ("fingir ser um
 * cliente real"). Tudo que expõe dado de cliente real (busca, simulação) exige ADMIN — o Web Chat é
 * público e NUNCA oferece busca de clientes.
 */
@Controller('pulseisp')
export class PulseIspController {
  constructor(
    private readonly connections: PulseIspConnectionService,
    private readonly client: PulseIspClient,
    private readonly mirror: PulseIspMirrorService,
  ) {}

  @Get('connection')
  connection() {
    return this.connections.getView(currentTenantId() as string);
  }

  @Patch('connection')
  @Roles('TENANT_ADMIN', 'SUPER_ADMIN')
  async saveConnection(@Body() dto: SaveConnectionDto) {
    const tenantId = currentTenantId() as string;
    const view = await this.connections.save(tenantId, dto);
    this.client.forget(tenantId);
    return view;
  }

  @Post('connection/test')
  @Roles('TENANT_ADMIN', 'SUPER_ADMIN')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async test() {
    const tenantId = currentTenantId() as string;
    const startedAt = Date.now();
    try {
      const { totalCustomers } = await this.client.ping(tenantId);
      return { ok: true, latencyMs: Date.now() - startedAt, totalCustomers };
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - startedAt, error: err instanceof Error ? err.message : String(err) };
    }
  }

  @Get('customers')
  @Roles('TENANT_ADMIN', 'SUPER_ADMIN')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async customers(@Query('search') search = '') {
    const term = search.trim();
    if (term.length < 2) throw new BadRequestException('Digite pelo menos 2 caracteres (nome, código ou login PPPoE).');
    try {
      return await this.client.searchCustomers(currentTenantId() as string, term);
    } catch (err) {
      throw asBadGateway(err);
    }
  }

  @Post('simulate')
  @Roles('TENANT_ADMIN', 'SUPER_ADMIN')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async simulate(@Body() dto: SimulateDto) {
    const tenantId = currentTenantId() as string;
    try {
      const c360 = await this.client.customer360(tenantId, dto.customerId);
      return await this.mirror.upsertFromCustomer360(tenantId, c360);
    } catch (err) {
      throw asBadGateway(err);
    }
  }
}

function asBadGateway(err: unknown): Error {
  if (err instanceof PulseIspError) return new BadRequestException(err.message);
  return err instanceof Error ? err : new Error(String(err));
}
