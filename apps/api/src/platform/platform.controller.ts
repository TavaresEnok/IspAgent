import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { TenantAccessService } from './tenant-access.service';

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
const PLANS = ['basic', 'pro', 'enterprise'];

class CreateTenantDto {
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @Matches(SLUG_RE, { message: 'slug: 3 a 40 caracteres, só letras minúsculas, números e "-"' }) slug!: string;
  @IsEmail() @MaxLength(160) adminEmail!: string;
  @IsString() @MinLength(2) @MaxLength(80) adminName!: string;
  @IsOptional() @IsIn(PLANS) plan?: string;
  @IsOptional() @IsInt() @Min(1) @Max(10_000_000) monthlyConversationLimit?: number;
  @IsOptional() @IsInt() @Min(1) @Max(10_000) maxUsers?: number;
}

class UpdateTenantDto {
  @IsOptional() @IsIn(['ACTIVE', 'SUSPENDED']) status?: string;
  @IsOptional() @IsIn(PLANS) plan?: string;
  // null = sem limite
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) @Max(10_000_000) monthlyConversationLimit?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) @Max(10_000) maxUsers?: number | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(253) customDomain?: string | null;
}

/** Senha inicial legível e forte (o admin troca depois). */
function initialPassword(): string {
  return `Isp#${randomBytes(9).toString('base64url')}`;
}

/**
 * Painel do dono da plataforma (SUPER_ADMIN): cadastrar provedores, suspender, plano e limites, domínio
 * próprio e consumo. Rotas fora do isolamento por tenant de propósito — por isso só o papel mais alto.
 */
@Controller('platform/tenants')
export class PlatformController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TenantAccessService,
  ) {}

  @Get()
  @Roles('SUPER_ADMIN')
  async list() {
    const tenants = await this.prisma.tenant.findMany({ orderBy: { createdAt: 'asc' } });
    return Promise.all(
      tenants.map(async (t) => ({
        id: t.id,
        name: t.brandName || t.name,
        slug: t.slug,
        status: t.status,
        plan: t.plan,
        customDomain: t.customDomain,
        createdAt: t.createdAt,
        usage: await this.access.usage(t.id),
      })),
    );
  }

  @Post()
  @Roles('SUPER_ADMIN')
  async create(@Body() dto: CreateTenantDto, @Req() req: Request) {
    const id = `tnt_${dto.slug.replace(/-/g, '_')}`;
    if (await this.prisma.tenant.findFirst({ where: { OR: [{ id }, { slug: dto.slug }] } })) {
      throw new ConflictException('Já existe um provedor com esse apelido.');
    }
    const password = initialPassword();
    const passwordHash = await bcrypt.hash(password, 10);
    const name = dto.name.trim();
    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.create({
        data: {
          id,
          name,
          brandName: name,
          slug: dto.slug,
          plan: dto.plan ?? 'basic',
          monthlyConversationLimit: dto.monthlyConversationLimit ?? null,
          maxUsers: dto.maxUsers ?? null,
        },
      });
      await tx.tenantPolicyConfig.create({ data: { tenantId: id, companyName: name } });
      await tx.erpConnection.create({ data: { tenantId: id, provider: 'demo' } });
      await tx.user.create({
        data: { tenantId: id, email: dto.adminEmail.trim().toLowerCase(), name: dto.adminName.trim(), role: 'TENANT_ADMIN', passwordHash },
      });
      await tx.auditLog.create({
        data: {
          tenantId: req.user!.tenantId,
          actorType: 'USER',
          actorId: req.user!.userId,
          action: 'platform.tenant_created',
          entityType: 'Tenant',
          entityId: id,
          metadata: { slug: dto.slug, plan: dto.plan ?? 'basic' },
        },
      });
    });
    // A senha inicial só aparece aqui, uma vez (o banco guarda apenas o hash).
    return { id, slug: dto.slug, admin: { email: dto.adminEmail.trim().toLowerCase(), initialPassword: password } };
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN')
  async update(@Param('id') id: string, @Body() dto: UpdateTenantDto, @Req() req: Request) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException();
    if (id === req.user!.tenantId && dto.status === 'SUSPENDED') {
      throw new BadRequestException('A plataforma não pode suspender a si mesma.');
    }
    let customDomain: string | null | undefined = dto.customDomain;
    if (typeof customDomain === 'string') {
      customDomain = customDomain.trim().toLowerCase() || null;
      if (customDomain && !DOMAIN_RE.test(customDomain)) throw new BadRequestException('Domínio inválido (ex.: atendimento.provedor.com.br).');
      if (customDomain && (await this.prisma.tenant.findFirst({ where: { customDomain, NOT: { id } } }))) {
        throw new ConflictException('Esse domínio já está em uso por outro provedor.');
      }
    }
    const updated = await this.prisma.tenant.update({
      where: { id },
      data: {
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.plan ? { plan: dto.plan } : {}),
        ...(dto.monthlyConversationLimit !== undefined ? { monthlyConversationLimit: dto.monthlyConversationLimit } : {}),
        ...(dto.maxUsers !== undefined ? { maxUsers: dto.maxUsers } : {}),
        ...(customDomain !== undefined ? { customDomain } : {}),
      },
    });
    if (dto.status === 'SUSPENDED') {
      // Suspensão vale na hora: derruba as sessões (refresh tokens) dos usuários do provedor.
      await this.prisma.refreshToken.deleteMany({ where: { user: { tenantId: id } } });
    }
    this.access.forget(id);
    await this.prisma.auditLog.create({
      data: {
        tenantId: req.user!.tenantId,
        actorType: 'USER',
        actorId: req.user!.userId,
        action: 'platform.tenant_updated',
        entityType: 'Tenant',
        entityId: id,
        metadata: JSON.parse(JSON.stringify(dto)),
      },
    });
    return { id: updated.id, status: updated.status, plan: updated.plan, customDomain: updated.customDomain };
  }
}
