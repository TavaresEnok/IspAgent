import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { IsString, MinLength } from 'class-validator';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { ConversationService } from '../conversation/conversation.service';
import { WhatsAppCloudClient } from '../channels/whatsapp-cloud.client';

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
    private readonly whatsapp: WhatsAppCloudClient,
  ) {}

  @Get()
  async list(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    const take = Math.min(Number(pageSize) || 20, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    const where: any = {};
    if (status && status !== 'ALL') {
      where.status = status;
    }
    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { channelUserId: { contains: q } },
        { customer: { name: { contains: q, mode: 'insensitive' } } },
        { customer: { document: { contains: q } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.db.client.conversation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take,
        skip,
        include: { customer: { select: { id: true, name: true, document: true } } },
      }),
      this.db.client.conversation.count({ where }),
    ]);

    return { items, total, page: Number(page) || 1, pageSize: take };
  }

  @Get(':id/copilot-suggestion')
  async copilotSuggestion(@Param('id') id: string) {
    const conversation = await this.db.client.conversation.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, document: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 10 },
        handoffs: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');

    const customerName = conversation.customer?.name ? conversation.customer.name.trim().split(/\s+/)[0] : '';
    const greeting = customerName ? `Olá, ${customerName}! ` : 'Olá! ';
    const lastCustomerMsg = conversation.messages.find((m) => m.role === 'CUSTOMER')?.content || '';
    const handoffReason = conversation.handoffs[0]?.reason || 'Atendimento transferido para suporte humano.';

    let suggestion = `${greeting}Aqui é do suporte ao cliente. Estou assumindo o seu atendimento agora. `;
    if (/lenta|lentid[aã]o|ruim|sinal|wifi/i.test(lastCustomerMsg)) {
      suggestion += 'Vi que você estava verificando sua conexão. Nosso diagnóstico de rede mostrou sinal óptico normal na fibra, mas vamos realizar juntos alguns testes no seu roteador para normalizar agora mesmo.';
    } else if (/pix|boleto|fatura|pdf/i.test(lastCustomerMsg)) {
      suggestion += 'Vi que você precisa da sua fatura ou código de pagamento. Já estou com os seus dados em tela para te auxiliar de imediato.';
    } else if (/cancelar|cancelamento/i.test(lastCustomerMsg)) {
      suggestion += 'Lamento saber da sua intenção de cancelamento. Gostaria muito de entender o que aconteceu e ver como podemos aplicar uma condição especial para você continuar com a gente.';
    } else {
      suggestion += 'Como posso te auxiliar a resolver essa questão hoje?';
    }

    return {
      suggestion,
      handoffReason,
      lastCustomerMessage: lastCustomerMsg,
    };
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

    // No WhatsApp a mensagem só chega ao cliente se for enviada pela API; no Web Chat ele lê do histórico.
    const delivery = conv.channel === 'WHATSAPP' ? await this.whatsapp.sendText(conv.channelUserId, dto.content) : null;
    return { ...message, delivery };
  }
}
