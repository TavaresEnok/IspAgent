import { BadRequestException, Body, ConflictException, Controller, Get, Put, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { currentTenantId } from '../common/tenant-context';
import { PrismaService } from '../prisma/prisma.service';
import { SLUG_RE } from './platform.controller';

const COLOR_RE = /^#[0-9a-f]{6}$/i;
// Logo pequena embutida (data URL): PNG/JPEG/WebP/SVG até ~300 KB de texto.
const LOGO_RE = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
const MAX_LOGO = 300_000;

export interface PublicBranding {
  tenantId: string | null;
  slug: string | null;
  name: string;
  color: string;
  logo: string | null;
}

const DEFAULT_BRANDING: PublicBranding = { tenantId: null, slug: null, name: 'ISPAgent', color: '#0891b2', logo: null };

class BrandingDto {
  @IsOptional() @IsString() @MaxLength(60) brandName?: string;
  @IsOptional() @Matches(COLOR_RE, { message: 'cor no formato #RRGGBB' }) brandColor?: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(MAX_LOGO) brandLogo?: string | null;
  @IsOptional() @Matches(SLUG_RE, { message: 'apelido: 3 a 40 caracteres, só letras minúsculas, números e "-"' }) slug?: string;
}

/**
 * White label: nome, cor e logo de cada provedor, lidos em tempo de execução (login, painel e Web Chat).
 * O público chega pelo apelido (`?p=vibe`) ou pelo domínio próprio do provedor.
 */
@Controller()
export class BrandingController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('public/branding')
  async publicBranding(@Query('p') slug?: string, @Req() req?: Request): Promise<PublicBranding> {
    const host = String(req?.headers['x-forwarded-host'] ?? req?.headers.host ?? '')
      .split(',')[0]
      .trim()
      .toLowerCase()
      .replace(/:\d+$/, '');
    const cleanSlug = (slug ?? '').trim().toLowerCase();
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        status: 'ACTIVE',
        OR: [
          ...(cleanSlug && SLUG_RE.test(cleanSlug) ? [{ slug: cleanSlug }] : []),
          // widget.js antigo manda o id interno (`?tenant=tnt_vibe`).
          ...(/^tnt_[a-z0-9_]{1,60}$/.test(cleanSlug) ? [{ id: cleanSlug }] : []),
          ...(host ? [{ customDomain: host }] : []),
        ],
      },
    });
    if (!tenant || (!cleanSlug && !host)) return DEFAULT_BRANDING;
    return {
      tenantId: tenant.id,
      slug: tenant.slug,
      name: tenant.brandName || tenant.name,
      color: tenant.brandColor || DEFAULT_BRANDING.color,
      logo: tenant.brandLogo,
    };
  }

  @Get('tenant/branding')
  async mine() {
    const t = await this.prisma.tenant.findUnique({ where: { id: currentTenantId() as string } });
    return {
      slug: t?.slug ?? null,
      name: t?.brandName || t?.name || DEFAULT_BRANDING.name,
      color: t?.brandColor || DEFAULT_BRANDING.color,
      logo: t?.brandLogo ?? null,
      customDomain: t?.customDomain ?? null,
      plan: t?.plan ?? null,
    };
  }

  @Put('tenant/branding')
  @Roles('TENANT_ADMIN')
  async save(@Body() dto: BrandingDto, @Req() req: Request) {
    const tenantId = currentTenantId() as string;
    if (dto.brandLogo && !LOGO_RE.test(dto.brandLogo)) throw new BadRequestException('Logo: envie PNG, JPEG, WebP ou SVG (até ~220 KB).');
    if (dto.slug && (await this.prisma.tenant.findFirst({ where: { slug: dto.slug, NOT: { id: tenantId } } }))) {
      throw new ConflictException('Esse apelido já é usado por outro provedor.');
    }
    const name = dto.brandName?.trim();
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(name ? { brandName: name } : {}),
        ...(dto.brandColor ? { brandColor: dto.brandColor.toLowerCase() } : {}),
        ...(dto.brandLogo !== undefined ? { brandLogo: dto.brandLogo } : {}),
        ...(dto.slug ? { slug: dto.slug } : {}),
      },
    });
    // A IA se apresenta com o nome da marca (persona), a menos que o provedor tenha definido outro.
    if (name) {
      await this.prisma.tenantPolicyConfig.upsert({
        where: { tenantId },
        create: { tenantId, companyName: name },
        update: { companyName: name },
      });
    }
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorType: 'USER',
        actorId: req.user!.userId,
        action: 'tenant.branding_saved',
        entityType: 'Tenant',
        entityId: tenantId,
        metadata: { brandName: name ?? null, brandColor: dto.brandColor ?? null, logo: dto.brandLogo === undefined ? 'mantido' : dto.brandLogo ? 'novo' : 'removido', slug: dto.slug ?? null },
      },
    });
    return this.mine();
  }
}
