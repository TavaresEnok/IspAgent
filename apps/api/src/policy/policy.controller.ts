import { Body, Controller, Get, Patch } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { currentTenantId } from '../common/tenant-context';
import { Roles } from '../common/decorators/roles.decorator';
import { POLICY_ACTIONS } from './policy-actions';

class UpdatePolicyConfigDto {
  @IsOptional() @IsBoolean() canCreateTicket?: boolean;
  @IsOptional() @IsBoolean() canAccessBilling?: boolean;
  @IsOptional() @IsBoolean() canSendInvoice?: boolean;
  @IsOptional() @IsBoolean() canPerformUnlock?: boolean;
  @IsOptional() @IsBoolean() requiresConfirmationForUnlock?: boolean;
  @IsOptional() @IsBoolean() canQueryPulseISP?: boolean;
  @IsOptional() @IsBoolean() canChangePlan?: boolean;
  @IsOptional() @IsInt() @Min(1) maxToolCallsPerTurn?: number;
  @IsOptional() @IsInt() @Min(1) maxTokensPerTurn?: number;
  @IsOptional() @IsInt() @Min(1) handoffAfterFailures?: number;
}

/** Tela "Políticas" (seção 10.1) — policies configuráveis pela UI (P1). */
@Controller('policy')
export class PolicyController {
  constructor(private readonly db: TenantPrismaService) {}

  /** Tela "Ferramentas" (seção 10.1): catálogo estático de ações conhecidas pela Policy Engine. */
  @Get('actions')
  actions() {
    return Object.entries(POLICY_ACTIONS).map(([action, spec]) => ({ action, ...spec }));
  }

  @Get()
  async get() {
    const tenantId = currentTenantId() as string;
    return this.db.client.tenantPolicyConfig.findUnique({ where: { tenantId } });
  }

  @Patch()
  @Roles('TENANT_ADMIN', 'SUPER_ADMIN')
  async update(@Body() dto: UpdatePolicyConfigDto) {
    const tenantId = currentTenantId() as string;
    return this.db.client.tenantPolicyConfig.update({ where: { tenantId }, data: dto });
  }
}
