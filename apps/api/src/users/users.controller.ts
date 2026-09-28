import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ROLE_HIERARCHY, Role } from '@ispagent/shared';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { Roles } from '../common/decorators/roles.decorator';
import { currentTenantId } from '../common/tenant-context';
import { PrismaService } from '../prisma/prisma.service';

/** Papéis que um provedor dá à própria equipe (SUPER_ADMIN é só da plataforma). */
const TENANT_ROLES: Role[] = ['TENANT_ADMIN', 'SUPERVISOR', 'AGENT', 'ANALYST', 'READ_ONLY'];

class CreateUserDto {
  @IsEmail() @MaxLength(160) email!: string;
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @IsIn(TENANT_ROLES) role!: Role;
}

class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @IsIn(TENANT_ROLES) role?: Role;
  @IsOptional() @IsBoolean() active?: boolean;
}

function initialPassword(): string {
  return `Isp#${randomBytes(9).toString('base64url')}`;
}

/**
 * Tela "Operadores": o admin do provedor cadastra a própria equipe. Ninguém dá um papel acima do seu,
 * ninguém se desativa (o provedor ficaria sem admin por engano) e o plano limita operadores ativos.
 */
@Controller('users')
export class UsersController {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @Roles('TENANT_ADMIN', 'SUPER_ADMIN')
  async list() {
    return this.db.client.user.findMany({
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  @Post()
  @Roles('TENANT_ADMIN')
  async create(@Body() dto: CreateUserDto, @Req() req: Request) {
    const tenantId = currentTenantId() as string;
    this.assertCanGrant(req, dto.role);
    await this.assertSeatAvailable(tenantId);
    const email = dto.email.trim().toLowerCase();
    if (await this.db.client.user.findFirst({ where: { email } })) throw new ConflictException('Já existe um operador com esse e-mail.');
    const password = initialPassword();
    const user = await this.db.client.user.create({
      data: { tenantId, email, name: dto.name.trim(), role: dto.role, passwordHash: await bcrypt.hash(password, 10) },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    });
    await this.audit(req, 'user.created', user.id, { role: dto.role });
    return { ...user, initialPassword: password };
  }

  @Patch(':id')
  @Roles('TENANT_ADMIN')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto, @Req() req: Request) {
    const user = await this.db.client.user.findFirst({ where: { id } });
    if (!user) throw new NotFoundException();
    if (id === req.user!.userId && (dto.active === false || (dto.role && dto.role !== user.role))) {
      throw new BadRequestException('Você não pode desativar nem trocar o próprio papel.');
    }
    this.assertCanGrant(req, user.role as Role);
    if (dto.role) this.assertCanGrant(req, dto.role);
    if (dto.active === true && !user.active) await this.assertSeatAvailable(user.tenantId);
    const updated = await this.db.client.user.update({
      where: { id },
      data: { ...(dto.name ? { name: dto.name.trim() } : {}), ...(dto.role ? { role: dto.role } : {}), ...(dto.active !== undefined ? { active: dto.active } : {}) },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    });
    // Desativar derruba as sessões abertas na hora.
    if (dto.active === false) await this.prisma.refreshToken.deleteMany({ where: { userId: id } });
    await this.audit(req, 'user.updated', id, JSON.parse(JSON.stringify(dto)));
    return updated;
  }

  @Post(':id/reset-password')
  @Roles('TENANT_ADMIN')
  async resetPassword(@Param('id') id: string, @Req() req: Request) {
    const user = await this.db.client.user.findFirst({ where: { id } });
    if (!user) throw new NotFoundException();
    this.assertCanGrant(req, user.role as Role);
    const password = initialPassword();
    await this.db.client.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
    await this.prisma.refreshToken.deleteMany({ where: { userId: id } });
    await this.audit(req, 'user.password_reset', id, {});
    return { initialPassword: password };
  }

  private assertCanGrant(req: Request, role: Role) {
    const mine = ROLE_HIERARCHY[req.user!.role as Role] ?? 0;
    if ((ROLE_HIERARCHY[role] ?? 0) > mine) throw new ForbiddenException('Você não pode gerenciar um papel acima do seu.');
  }

  private async assertSeatAvailable(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { maxUsers: true } });
    if (!tenant?.maxUsers) return;
    const active = await this.db.client.user.count({ where: { active: true } });
    if (active >= tenant.maxUsers) throw new BadRequestException(`O plano permite ${tenant.maxUsers} operadores ativos.`);
  }

  private audit(req: Request, action: string, userId: string, metadata: Record<string, unknown>) {
    return this.prisma.auditLog.create({
      data: { tenantId: currentTenantId() as string, actorType: 'USER', actorId: req.user!.userId, action, entityType: 'User', entityId: userId, metadata: metadata as object },
    });
  }
}
