import { Injectable, Logger } from '@nestjs/common';
import { AgentOrchestratorService } from '../agent/agent-orchestrator.service';
import { ConversationService } from '../conversation/conversation.service';
import { WHATSAPP_CSAT_QUESTION } from '../conversation/conversation-lifecycle.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { AiProviderResolverService } from '../integrations/ai/ai-provider-resolver.service';
import { WhatsAppCloudClient } from './whatsapp-cloud.client';

export const UNREADABLE_AUDIO_MESSAGE = 'Não consegui entender o seu áudio. Pode escrever a sua mensagem, por favor?';
export const UNREADABLE_IMAGE_MESSAGE =
  'Não consegui ler essa imagem como comprovante. Pode enviar uma foto mais nítida, ou escrever o valor e a data do pagamento?';

/** Texto a processar, ou resposta fixa quando a mídia não pôde ser lida (nunca inventar o conteúdo). */
export type Incoming = { text: string } | { unreadable: string; marker: string } | null;
type Media = { base64: string; mimeType: string } | null;

/**
 * Mensagem de WhatsApp já autenticada (assinatura da Meta ou HMAC do WAHA) → atendimento. Comum aos dois
 * transportes: avaliação pós-atendimento, mídia ilegível, humano assumindo e envio das respostas do turno
 * (o `WhatsAppCloudClient` escolhe o transporte). Sempre chamado dentro do contexto do tenant.
 */
@Injectable()
export class WhatsAppInboundService {
  private readonly logger = new Logger(WhatsAppInboundService.name);

  constructor(
    private readonly orchestrator: AgentOrchestratorService,
    private readonly conversation: ConversationService,
    private readonly db: TenantPrismaService,
    private readonly aiResolver: AiProviderResolverService,
    private readonly whatsapp: WhatsAppCloudClient,
  ) {}

  async fromAudio(tenantId: string, media: Media): Promise<Incoming> {
    const ai = await this.aiResolver.resolve(tenantId);
    const transcription = media && ai.transcribeAudio ? (await ai.transcribeAudio(media.base64, media.mimeType).catch(() => '')).trim() : '';
    return transcription
      ? { text: `[Áudio transcrito do cliente]: "${transcription}"` }
      : { unreadable: UNREADABLE_AUDIO_MESSAGE, marker: '[Áudio enviado pelo cliente]' };
  }

  async fromImage(tenantId: string, media: Media): Promise<Incoming> {
    const ai = await this.aiResolver.resolve(tenantId);
    const receipt = media && ai.analyzeReceipt ? await ai.analyzeReceipt(media.base64, media.mimeType).catch(() => null) : null;
    if (!receipt?.isValid) return { unreadable: UNREADABLE_IMAGE_MESSAGE, marker: '[Imagem enviada pelo cliente]' };
    const amount = Number(receipt.amount);
    const amountStr = Number.isFinite(amount) && amount > 0 ? `R$ ${amount.toFixed(2).replace('.', ',')}` : 'valor não identificado';
    return {
      text: `[Comprovante enviado pelo cliente — leitura automática, não confirmada: ${amountStr}, ${receipt.date ?? 'data não identificada'}]. Já efetuei o pagamento.`,
    };
  }

  async process(from: string, incoming: Incoming): Promise<void> {
    if (!incoming) return;

    if ('text' in incoming) {
      if (!incoming.text.trim()) return;
      if (await this.recordCsatReply(from, incoming.text)) return;
    }

    const conv = await this.conversation.findOrCreateConversation('WHATSAPP', from);

    if ('unreadable' in incoming) {
      await this.conversation.appendMessage(conv.id, 'CUSTOMER', incoming.marker);
      if (conv.status !== 'HUMAN_ACTIVE') {
        await this.conversation.appendMessage(conv.id, 'AGENT', incoming.unreadable);
        await this.whatsapp.sendText(from, incoming.unreadable);
      }
      return;
    }

    const before = new Date();
    const decision = await this.orchestrator.handleMessage(conv.id, incoming.text.slice(0, 2000));
    if (!decision) return; // atendente humano assumiu: quem responde é ele (pelo painel)

    const replies = await this.db.client.message.findMany({
      where: { conversationId: conv.id, role: { in: ['AGENT', 'SYSTEM'] }, createdAt: { gte: before } },
      orderBy: { createdAt: 'asc' },
    });
    for (const r of replies) {
      const delivery = await this.whatsapp.sendText(from, r.content);
      if (!delivery.delivered) this.logger.warn(`Resposta não entregue ao WhatsApp: ${delivery.reason}`);
    }
  }

  /**
   * Nota de 1 a 5 enviada logo depois do encerramento automático (que pergunta a nota): vira a avaliação
   * daquele atendimento em vez de abrir uma conversa nova com a IA.
   */
  private async recordCsatReply(fromNumber: string, messageText: string): Promise<boolean> {
    const score = /^\s*([1-5])\s*[.!]?\s*$/.exec(messageText)?.[1];
    if (!score) return false;

    const open = await this.db.client.conversation.findFirst({
      where: { channel: 'WHATSAPP', channelUserId: fromNumber, status: { not: 'CLOSED' } },
    });
    if (open) return false;

    const closed = await this.db.client.conversation.findFirst({
      where: { channel: 'WHATSAPP', channelUserId: fromNumber, status: 'CLOSED', updatedAt: { gte: new Date(Date.now() - 24 * 3600_000) } },
      orderBy: { updatedAt: 'desc' },
      include: { surveys: { select: { id: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    const askedForRating = closed?.messages[0]?.role === 'AGENT' && closed.messages[0].content.includes(WHATSAPP_CSAT_QUESTION);
    if (!closed || !askedForRating || closed.surveys.length > 0) return false;

    await this.db.client.satisfactionSurvey.create({
      data: { tenantId: closed.tenantId, conversationId: closed.id, score: Number(score) },
    });
    const thanks = 'Obrigado pela avaliação! Se precisar de algo, é só mandar uma mensagem.';
    await this.conversation.appendMessage(closed.id, 'CUSTOMER', messageText.trim());
    await this.conversation.appendMessage(closed.id, 'AGENT', thanks);
    await this.whatsapp.sendText(fromNumber, thanks);
    return true;
  }
}
