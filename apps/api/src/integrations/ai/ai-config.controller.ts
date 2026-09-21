import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { currentTenantId } from '../../common/tenant-context';
import { Roles } from '../../common/decorators/roles.decorator';
import { AI_PROVIDER_CATALOG, AiConfigService, AiProviderName } from './ai-config.service';
import { AiProviderResolverService } from './ai-provider-resolver.service';

const PROVIDER_VALUES = AI_PROVIDER_CATALOG.map((p) => p.value);

class SaveCredentialDto {
  @IsOptional() @IsString() @MaxLength(500) apiKey?: string;
  @IsOptional() @IsString() @MaxLength(200) model?: string;
  @IsOptional() @IsBoolean() clearApiKey?: boolean;
}

class TestConnectionDto {
  @IsOptional() @IsString() @MaxLength(500) apiKey?: string;
  @IsOptional() @IsString() @MaxLength(200) model?: string;
}

class SetActiveDto {
  @IsIn(PROVIDER_VALUES) provider!: AiProviderName;
}

/**
 * Tela "IA" do painel: a config de cada provider fica salva lado a lado e o admin só escolhe qual usar.
 * Mudanças e teste exigem ADMIN (a chave é um segredo e o teste gasta cota da API); `GET` qualquer staff
 * autenticado pode ver, mas nunca recebe a chave inteira — só a versão mascarada.
 */
@Controller('ai-config')
export class AiConfigController {
  constructor(
    private readonly config: AiConfigService,
    private readonly resolver: AiProviderResolverService,
  ) {}

  // Mostra provider/modelo/chave mascarada: só administradores (a tela "IA" é de administração).
  @Get()
  @Roles('TENANT_ADMIN', 'SUPER_ADMIN')
  overview() {
    return this.config.getOverview(currentTenantId() as string);
  }

  @Patch('providers/:provider')
  @Roles('TENANT_ADMIN', 'SUPER_ADMIN')
  saveCredential(@Param('provider') provider: string, @Body() dto: SaveCredentialDto) {
    return this.config.saveCredential(currentTenantId() as string, provider, dto);
  }

  // Cada teste é uma chamada real (e paga, fora do free tier) — limite apertado por IP.
  @Post('providers/:provider/test')
  @Roles('TENANT_ADMIN', 'SUPER_ADMIN')
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  test(@Param('provider') provider: string, @Body() dto: TestConnectionDto) {
    const known = PROVIDER_VALUES.find((p) => p === provider);
    if (!known) return { ok: false, provider, model: null, latencyMs: 0, error: `Provider desconhecido: ${provider}` };
    return this.resolver.testConnection(currentTenantId() as string, known, dto);
  }

  @Patch('active')
  @Roles('TENANT_ADMIN', 'SUPER_ADMIN')
  setActive(@Body() dto: SetActiveDto) {
    return this.config.setActive(currentTenantId() as string, dto.provider);
  }
}
