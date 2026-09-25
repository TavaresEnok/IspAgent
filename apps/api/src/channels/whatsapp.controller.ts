import { Controller, Get, Post, Query, Body, HttpCode, HttpStatus, Logger, BadRequestException } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AgentOrchestratorService } from '../agent/agent-orchestrator.service';
import { ConversationService } from '../conversation/conversation.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { currentTenantId, runWithTenant } from '../common/tenant-context';
import { AiProviderResolverService } from '../integrations/ai/ai-provider-resolver.service';
import { WhatsAppCloudClient } from './whatsapp-cloud.client';

const UNREADABLE_AUDIO_MESSAGE = 'Não consegui entender o seu áudio. Pode escrever a sua mensagem, por favor?';
const UNREADABLE_IMAGE_MESSAGE =
  'Não consegui ler essa imagem como comprovante. Pode enviar uma foto mais nítida, ou escrever o valor e a data do pagamento?';

@Controller('public/whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(
    private readonly orchestrator: AgentOrchestratorService,
    private readonly conversation: ConversationService,
    private readonly db: TenantPrismaService,
    private readonly aiResolver: AiProviderResolverService,
    private readonly whatsapp: WhatsAppCloudClient,
  ) {}

  /** Validação do webhook pela Meta: devolve hub.challenge se o verify token bater. */
  @Public()
  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ) {
    const expectedToken = process.env.ISPAGENT_WHATSAPP_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN;
    if (expectedToken && mode === 'subscribe' && token === expectedToken) {
      this.logger.log('WhatsApp Webhook validado com sucesso pela Meta.');
      return challenge;
    }
    throw new BadRequestException('Token de validação inválido');
  }

  /** Mensagem recebida (formato WhatsApp Cloud API). A resposta é enviada pela API, não pelo corpo do webhook. */
  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleIncomingMessage(@Body() body: any, @Query('tenantId') queryTenantId?: string) {
    const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.from) return { status: 'ignored_or_status_ack' };

    const tenantId = queryTenantId || process.env.DEFAULT_TENANT_ID || 'tnt_vibe';
    const fromNumber = String(msg.from);
    const ai = await this.aiResolver.resolve(tenantId);

    // Texto que o agente vai processar, ou resposta fixa quando a mídia não pôde ser lida.
    let messageText = '';
    let unreadableReply: string | null = null;
    let customerMarker = '';

    if (msg.type === 'text') {
      messageText = msg.text?.body || '';
    } else if (msg.type === 'interactive') {
      messageText = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '';
    } else if (msg.type === 'audio' || msg.type === 'voice') {
      customerMarker = '[Áudio enviado pelo cliente]';
      const media = await this.whatsapp.downloadMedia(msg.audio?.id || msg.voice?.id);
      const transcription =
        media && ai.transcribeAudio ? await ai.transcribeAudio(media.base64, media.mimeType).catch(() => '') : '';
      if (transcription.trim()) messageText = `[Áudio transcrito do cliente]: "${transcription.trim()}"`;
      else unreadableReply = UNREADABLE_AUDIO_MESSAGE;
    } else if (msg.type === 'image') {
      customerMarker = '[Imagem enviada pelo cliente]';
      const media = await this.whatsapp.downloadMedia(msg.image?.id);
      const receipt = media && ai.analyzeReceipt ? await ai.analyzeReceipt(media.base64, media.mimeType).catch(() => null) : null;
      if (receipt?.isValid) {
        const amount = Number(receipt.amount);
        const amountStr = Number.isFinite(amount) && amount > 0 ? `R$ ${amount.toFixed(2)}` : 'valor não identificado';
        messageText = `[Comprovante enviado pelo cliente]: Valor ${amountStr}, Data: ${receipt.date || 'não identificada'}. Já efetuei o pagamento.`;
      } else {
        unreadableReply = UNREADABLE_IMAGE_MESSAGE;
      }
    }

    if (!messageText && !unreadableReply) return { status: 'ignored_or_status_ack' };

    return runWithTenant(tenantId, async () => {
      const conv = await this.conversation.findOrCreateConversation('WHATSAPP', fromNumber);

      if (unreadableReply) {
        await this.conversation.appendMessage(conv.id, 'CUSTOMER', customerMarker);
        await this.conversation.appendMessage(conv.id, 'AGENT', unreadableReply);
        const delivery = await this.whatsapp.sendText(fromNumber, unreadableReply);
        return { status: 'processed', conversationId: conv.id, reply: unreadableReply, delivery };
      }

      const before = new Date();
      const decision = await this.orchestrator.handleMessage(conv.id, messageText);
      // `null` = um atendente assumiu a conversa: a IA não responde nada.
      if (!decision) return { status: 'processed', conversationId: conv.id, reply: null, delivery: null };

      const replies = await this.db.client.message.findMany({
        where: { conversationId: conv.id, role: { in: ['AGENT', 'SYSTEM'] }, createdAt: { gte: before } },
        orderBy: { createdAt: 'asc' },
      });
      const deliveries = [];
      for (const r of replies) deliveries.push(await this.whatsapp.sendText(fromNumber, r.content));

      return { status: 'processed', conversationId: conv.id, replies: replies.map((r) => r.content), deliveries, decision };
    });
  }

  /** Aviso proativo (ex.: manutenção na PON) para clientes do tenant logado no WhatsApp. */
  @Roles('SUPERVISOR', 'TENANT_ADMIN', 'SUPER_ADMIN')
  @Post('broadcast-maintenance')
  @HttpCode(HttpStatus.OK)
  async broadcastMaintenance(@Body() body: { ponId?: string; message: string; phones?: string[] }) {
    const tenantId = currentTenantId() as string;
    const alertMessage = body.message?.trim();
    if (!alertMessage) throw new BadRequestException('Mensagem de aviso obrigatória.');

    let targetPhones = body.phones || [];
    if (!targetPhones.length) {
      const recentConvs = await this.db.client.conversation.findMany({
        where: { channel: 'WHATSAPP' },
        take: 50,
        select: { channelUserId: true },
      });
      targetPhones = recentConvs.map((c) => c.channelUserId);
    }

    const results = [];
    for (const phone of targetPhones) {
      const conv = await this.conversation.findOrCreateConversation('WHATSAPP', phone);
      const formattedMsg = `📢 *AVISO DE MANUTENÇÃO*\n\n${alertMessage}`;
      const msg = await this.conversation.appendMessage(conv.id, 'AGENT', formattedMsg);
      const delivery = await this.whatsapp.sendText(phone, formattedMsg);
      results.push({ phone, messageId: msg.id, ...delivery });
    }

    const delivered = results.filter((r) => r.delivered).length;
    this.logger.log(`Aviso proativo (tenant ${tenantId}): ${delivered}/${results.length} entregues ao WhatsApp.`);
    return {
      broadcast: true,
      totalRecipients: results.length,
      delivered,
      dispatchedAt: new Date().toISOString(),
      results,
    };
  }
}
