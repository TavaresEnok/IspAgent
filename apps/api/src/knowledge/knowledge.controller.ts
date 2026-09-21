import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { KnowledgeService } from './knowledge.service';
import { currentTenantId } from '../common/tenant-context';

class CreateKnowledgeDocDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  content!: string;

  @IsOptional()
  @IsString()
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

  @Post()
  async create(@Body() dto: CreateKnowledgeDocDto) {
    const tenantId = currentTenantId() as string;
    return this.db.client.knowledgeDocument.create({
      data: { tenantId, title: dto.title, content: dto.content, source: dto.source ?? null },
    });
  }
}
