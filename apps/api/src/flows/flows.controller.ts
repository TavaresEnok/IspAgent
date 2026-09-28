import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Req } from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsObject, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { FLOW_DEPARTMENT_LABEL, FlowRunState, flowHasErrors, validateFlow } from '@ispagent/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { currentTenantId } from '../common/tenant-context';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { isHumanRequest } from '../agent/quick-flows';
import { isWithinSupportHours } from '../agent/support-hours';
import { normalizeDocument } from '../identity/identity-resolution.service';
import { FlowEngine, FlowRuntime } from './flow-engine';
import { interpretMenuChoice } from './menu-interpreter';
import { MockAIProvider } from '../integrations/ai/mock-ai.provider';

/** O simulador entende texto livre com as regras (sem gastar IA nem depender dela). */
const rules = new MockAIProvider();
import { FlowsService, sanitizeDefinition } from './flows.service';

class CreateFlowDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsOptional() @IsUUID() copyFromId?: string;
}

class SaveFlowDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsObject() definition?: Record<string, unknown>;
}

class ActiveDto {
  @IsBoolean() active!: boolean;
}

class SimulateDto {
  @IsObject() definition!: Record<string, unknown>;
  @IsOptional() @IsObject() state?: Record<string, unknown>;
  @IsString() @MinLength(1) @MaxLength(2000) message!: string;
}

/**
 * Construtor de fluxo do painel. Ler e simular: SUPERVISOR. Mudar o que o cliente recebe (salvar, publicar,
 * ativar, excluir): TENANT_ADMIN. Toda mudança que afeta o atendimento vai para a auditoria.
 */
@Controller('flows')
export class FlowsController {
  constructor(
    private readonly flows: FlowsService,
    private readonly db: TenantPrismaService,
  ) {}

  @Get()
  @Roles('SUPERVISOR')
  list() {
    return this.flows.list();
  }

  @Get(':id')
  @Roles('SUPERVISOR')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.flows.get(id);
  }

  @Post()
  @Roles('TENANT_ADMIN')
  create(@Body() dto: CreateFlowDto, @Req() req: Request) {
    return this.flows.create(dto.name.trim(), req.user!.userId, dto.copyFromId);
  }

  @Put(':id')
  @Roles('TENANT_ADMIN')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  save(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveFlowDto, @Req() req: Request) {
    return this.flows.saveDraft(
      id,
      { name: dto.name?.trim(), description: dto.description?.trim(), definition: dto.definition },
      req.user!.userId,
    );
  }

  @Post(':id/publish')
  @Roles('TENANT_ADMIN')
  publish(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.flows.publish(id, req.user!.userId);
  }

  @Post(':id/active')
  @Roles('TENANT_ADMIN')
  setActive(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActiveDto, @Req() req: Request) {
    return this.flows.setActive(id, dto.active, req.user!.userId);
  }

  @Delete(':id')
  @Roles('TENANT_ADMIN')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.flows.remove(id, req.user!.userId);
  }

  /**
   * Simulador do editor: roda o rascunho (mesmo sem salvar) com DADOS FICTÍCIOS. Nada é gravado, nenhum
   * cliente real é consultado e nenhum chamado/transferência acontece de verdade.
   */
  @Post('simulate')
  @Roles('SUPERVISOR')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async simulate(@Body() dto: SimulateDto) {
    const definition = sanitizeDefinition(dto.definition);
    const issues = validateFlow(definition);
    if (flowHasErrors(issues)) return { issues, replies: [], outcome: 'invalid', state: null, trace: [] };

    const policy = await this.db.client.tenantPolicyConfig.findUnique({ where: { tenantId: currentTenantId() as string } });
    const tenant = await this.db.client.tenant.findUnique({ where: { id: currentTenantId() as string }, select: { name: true } });
    const state = (dto.state as unknown as FlowRunState | undefined) ?? null;
    const identified = { name: state?.vars?.nome || null };
    const rt: FlowRuntime = {
      companyName: policy?.companyName?.trim() || tenant?.name.replace(/\s*\(.*\)\s*$/, '').trim() || 'seu provedor',
      customerName: () => identified.name,
      isIdentified: () => Boolean(identified.name),
      identify: async (document) => {
        const digits = normalizeDocument(document);
        if (!digits || /^(\d)\1+$/.test(digits)) return 'not_found';
        identified.name = 'Cliente de Teste';
        return 'identified';
      },
      lookup: async (query) => ({
        status: 'ok',
        reply:
          query === 'invoice'
            ? '🧪 [simulação] Localizei a sua fatura de R$ 99,90 com vencimento em 10/10/2026. (No atendimento real: valor, PIX e boleto vêm do SGP.)'
            : query === 'plan'
              ? '🧪 [simulação] O seu plano atual é o FIBRA 500 MEGA. (No atendimento real: vem do SGP.)'
              : '🧪 [simulação] A sua conexão está normal do nosso lado. (No atendimento real: diagnóstico do SGP/PulseISP.)',
      }),
      openTicket: async (description) => ({
        status: 'ok',
        reply: `🧪 [simulação] Chamado seria aberto: "${description.slice(0, 120)}"`,
      }),
      isBusinessHours: () => (policy?.supportHours ? isWithinSupportHours(policy.supportHours) : null),
      isHumanRequest,
      interpretMenu: async (input, options) => interpretMenuChoice((await rules.classifyIntents(input)).intents, options),
    };

    const engine = new FlowEngine(definition, 'simulacao', 0);
    const result = await engine.step(state?.status === 'running' ? state : null, dto.message, rt);
    return {
      issues,
      replies: result.replies,
      outcome: result.outcome,
      state: result.state,
      trace: result.trace,
      handoff: result.handoff
        ? { ...result.handoff, departmentLabel: FLOW_DEPARTMENT_LABEL[result.handoff.department] }
        : undefined,
    };
  }
}
