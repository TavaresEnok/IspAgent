import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { runWithTenant } from '../common/tenant-context';
import { RealtimeEventsService } from '../events/events.service';
import { WhatsAppCloudClient } from '../channels/whatsapp-cloud.client';
import { ConversationService } from './conversation.service';

const CLOSING_MESSAGE =
  'Encerrei este atendimento por falta de interação. Se precisar de algo, é só mandar uma nova mensagem.';
export const WHATSAPP_CSAT_QUESTION = 'Como foi o atendimento? Responda com uma nota de 1 a 5.';

/** Só conversas com a IA: fila humana e atendente em curso são responsabilidade de gente. */
const AUTO_CLOSABLE = ['AI_ACTIVE', 'AWAITING_CONFIRMATION'] as const;
const STALE_AFTER_MS = 24 * 3600_000;
const BATCH_SIZE = 200;

function idleMinutes(): number {
  const n = Number(process.env.ISPAGENT_CONVERSATION_IDLE_MINUTES);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

/**
 * Encerra conversas paradas com a IA. Sem isso a conversa nunca fechava: a próxima mensagem herdava
 * estado antigo (identidade, oferta de chamado) e a avaliação de satisfação não tinha momento para ocorrer.
 */
@Injectable()
export class ConversationLifecycleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConversationLifecycleService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversation: ConversationService,
    private readonly events: RealtimeEventsService,
    private readonly whatsapp: WhatsAppCloudClient,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      this.closeIdle().catch((err) => this.logger.warn(`Varredura de conversas paradas falhou: ${err}`));
    }, 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Fecha as conversas sem mensagem há mais que o limite; devolve quantas fechou. */
  async closeIdle(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - idleMinutes() * 60_000);
    const staleCutoff = new Date(now.getTime() - STALE_AFTER_MS);
    const idleSince = (since: Date): Prisma.ConversationWhereInput => ({
      status: { in: [...AUTO_CLOSABLE] },
      createdAt: { lt: since },
      messages: { none: { createdAt: { gt: since } } },
    });

    // Parada há mais de um dia: fecha em silêncio. Avisar (e pedir nota) semanas depois só confundiria o
    // cliente — e a primeira varredura após o deploy pegaria todo o histórico de uma vez.
    const stale = await this.prisma.conversation.updateMany({ where: idleSince(staleCutoff), data: { status: 'CLOSED' } });

    // Varredura entre tenants: cliente sem escopo; cada fechamento roda no contexto do próprio tenant.
    const idleWhere = idleSince(cutoff);
    let closed = stale.count;
    // Em lotes: cada conversa processada sai do filtro (fechou, ou o cliente acabou de escrever).
    for (;;) {
      const batch = await this.prisma.conversation.findMany({
        where: idleWhere,
        select: { id: true, tenantId: true, channel: true, channelUserId: true, messages: { where: { role: 'CUSTOMER' }, take: 1, select: { id: true } } },
        take: BATCH_SIZE,
      });
      for (const conv of batch) closed += await this.closeOne(conv, idleWhere);
      if (batch.length < BATCH_SIZE) break;
    }
    if (closed) this.logger.log(`${closed} conversa(s) encerrada(s) por inatividade.`);
    return closed;
  }

  private async closeOne(
    conv: { id: string; tenantId: string; channel: string; channelUserId: string; messages: Array<{ id: string }> },
    idleWhere: Prisma.ConversationWhereInput,
  ): Promise<number> {
    return runWithTenant(conv.tenantId, async () => {
      // Condição repetida no update: se o cliente escreveu entre a busca e aqui, não fecha.
      const { count } = await this.prisma.conversation.updateMany({
        where: { id: conv.id, ...idleWhere },
        data: { status: 'CLOSED' },
      });
      if (count === 0) return 0;
      // Só aviso do sistema (ex.: incidente) e nenhuma fala do cliente: não há atendimento a encerrar nem avaliar.
      if (conv.messages.length === 0) return 1;

      const text = conv.channel === 'WHATSAPP' ? `${CLOSING_MESSAGE}\n\n${WHATSAPP_CSAT_QUESTION}` : CLOSING_MESSAGE;
      await this.conversation.appendMessage(conv.id, 'AGENT', text);
      this.events.emit({ tenantId: conv.tenantId, type: 'STATUS_CHANGED', data: { conversationId: conv.id, status: 'CLOSED' } });
      if (conv.channel === 'WHATSAPP') await this.whatsapp.sendText(conv.channelUserId, text);
      return 1;
    });
  }
}
