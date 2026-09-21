import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { IsString, MinLength } from 'class-validator';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { ConversationService } from '../conversation/conversation.service';

class SendHumanMessageDto {
  @IsString()
  @MinLength(1)
  content!: string;
}

/**
 * Endpoints de staff (JWT obrigatório — guard global, ver AuthModule). Lista/detalhe de conversa
 * alimentam as telas "Conversas" e "Detalhe da conversa" (seção 10.1), incluindo a timeline de tool
 * calls e decisões de policy que o detalhe exige.
 */
@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly conversation: ConversationService,
  ) {}

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

  /**
   * P1 "troca AI → humano → AI" (seção 11, item 8) — a metade que faltava: `HandoffService.assume` só
   * tira a IA da jogada (`conversation.status = HUMAN_ACTIVE`); esta rota é o atendente de fato falando
   * com o cliente depois de assumir. Só funciona com a conversa em HUMAN_ACTIVE — não existe "responder
   * como humano" enquanto a IA ainda está no comando, isso seria os dois falando ao mesmo tempo.
   */
  @Post(':id/messages')
  async sendHumanMessage(@Param('id') id: string, @Body() dto: SendHumanMessageDto, @Req() req: Request) {
    const conv = await this.db.client.conversation.findUnique({ where: { id } });
    if (!conv) throw new NotFoundException('Conversa não encontrada');
    if (conv.status !== 'HUMAN_ACTIVE') {
      throw new BadRequestException(
        'Só é possível responder manualmente quando um atendente assumiu a conversa (status HUMAN_ACTIVE).',
      );
    }

    const message = await this.conversation.appendMessage(id, 'HUMAN', dto.content);

    await this.db.client.auditLog.create({
      data: {
        tenantId: conv.tenantId,
        actorType: 'USER',
        actorId: req.user!.userId,
        action: 'conversation.human_message_sent',
        entityType: 'Message',
        entityId: message.id,
        metadata: { conversationId: id },
      },
    });

    return message;
  }
}
