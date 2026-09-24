import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { KnowledgeService } from './knowledge.service';
import { currentTenantId } from '../common/tenant-context';
import { Roles } from '../common/decorators/roles.decorator';

class CreateKnowledgeDocDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  source?: string;
}

@Controller('knowledge')
export class KnowledgeController {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly knowledge: KnowledgeService,
  ) {}

  @Get()
  async list() {
    return this.db.client.knowledgeDocument.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Get('search')
  async search(@Query('q') query: string) {
    return this.knowledge.search(query ?? '');
  }

  // O conteúdo da KB vira "fato" para o agente: quem escreve aqui influencia o que o cliente lê.
  @Post()
  @Roles('SUPERVISOR')
  async create(@Body() dto: CreateKnowledgeDocDto) {
    const tenantId = currentTenantId() as string;
    return this.db.client.knowledgeDocument.create({
      data: { tenantId, title: dto.title, content: dto.content, source: dto.source ?? null },
    });
  }
}
