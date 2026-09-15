import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';

/**
 * Endpoints de staff (JWT obrigatório — guard global, ver AuthModule). Lista/detalhe de conversa
 * alimentam as telas "Conversas" e "Detalhe da conversa" (seção 10.1), incluindo a timeline de tool
 * calls e decisões de policy que o detalhe exige.
 */
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly db: TenantPrismaService) {}

  @Get()
  async list(@Query('page') page = '1', @Query('pageSize') pageSize = '20') {
    const take = Math.min(Number(pageSize) || 20, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const [items, total] = await Promise.all([
      this.db.client.conversation.findMany({
        orderBy: { updatedAt: 'desc' },
        take,
        skip,
        include: { customer: { select: { id: true, name: true } } },
      }),
      this.db.client.conversation.count(),
    ]);

    return { items, total, page: Number(page) || 1, pageSize: take };
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const conversation = await this.db.client.conversation.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, document: true } },
        messages: { orderBy: { createdAt: 'asc' } },
        agentRuns: {
          orderBy: { createdAt: 'asc' },
          include: { toolCalls: { orderBy: { createdAt: 'asc' } } },
        },
        handoffs: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');
    return conversation;
  }
}
