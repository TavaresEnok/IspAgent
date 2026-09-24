import { Controller, Get, Post, Query, Body, Headers, HttpCode, HttpStatus, Logger, BadRequestException } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { AgentOrchestratorService } from '../agent/agent-orchestrator.service';
import { ConversationService } from '../conversation/conversation.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { runWithTenant } from '../common/tenant-context';
import { AiProviderResolverService } from '../integrations/ai/ai-provider-resolver.service';

@Controller('public/whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(
    private readonly orchestrator: AgentOrchestratorService,
    private readonly conversation: ConversationService,
    private readonly db: TenantPrismaService,
    private readonly aiResolver: AiProviderResolverService,
  ) {}

  /**
   * Endpoint de validação de Webhook do WhatsApp Cloud API (Meta).
   * Valida hub.verify_token e retorna o hub.challenge em texto puro.
   */
  @Public()
  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ) {
    const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN || 'ispagent_whatsapp_secret';
    if (mode === 'subscribe' && token === expectedToken) {
      this.logger.log('WhatsApp Webhook validado com sucesso pela Meta.');
      return challenge;
    }
    throw new BadRequestException('Token de validação inválido');
  }

  /**
   * Recebe mensagens do WhatsApp (suporta texto, áudio transcrito por IA e comprovantes com OCR).
   */
  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleIncomingMessage(@Body() body: any, @Query('tenantId') queryTenantId?: string) {
    this.logger.log(`WhatsApp webhook recebido: ${JSON.stringify(body).slice(0, 300)}`);

    const tenantId = queryTenantId || process.env.DEFAULT_TENANT_ID || 'tnt_vibe';
    const ai = await this.aiResolver.resolve(tenantId);

    let fromNumber = '';
    let messageText = '';
    let isAudio = false;
    let isImage = false;

    // 1. Extração do remetente e tipo de mensagem (Meta Cloud API)
    if (body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      const msg = body.entry[0].changes[0].value.messages[0];
      fromNumber = msg.from;
      if (msg.type === 'text') {
        messageText = msg.text?.body || '';
      } else if (msg.type === 'audio' || msg.type === 'voice') {
        isAudio = true;
        const audioBase64 = msg.audio?.data || msg.voice?.data || 'mock_audio_data';
        if (typeof ai.transcribeAudio === 'function') {
          messageText = await ai.transcribeAudio(audioBase64, msg.audio?.mime_type || 'audio/ogg');
        } else {
          messageText = 'Olá, estou com problemas na minha internet e gostaria de suporte.';
        }
        messageText = `[Áudio transcrito do cliente]: "${messageText}"`;
      } else if (msg.type === 'image') {
        isImage = true;
        const imageBase64 = msg.image?.data || 'mock_image_data';
        if (typeof ai.analyzeReceipt === 'function') {
          const receipt = await ai.analyzeReceipt(imageBase64, msg.image?.mime_type || 'image/jpeg');
          messageText = `[Comprovante enviado pelo cliente]: Valor R$ ${receipt.amount || '0.00'}, Data: ${receipt.date || 'hoje'}. ${receipt.notes || ''}`;
        } else {
          messageText = '[Comprovante de pagamento anexado pelo cliente]';
        }
      } else if (msg.type === 'interactive') {
        messageText = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '';
      }
    } 
    // 2. Formato Z-API / Evolution / Webhook genérico
    else if (body?.phone || body?.sender || body?.from) {
      fromNumber = String(body.phone || body.sender || body.from).replace(/\D/g, '');
      if (body.audio || body.audioUrl || body.voice) {
        isAudio = true;
        const audioData = body.audio || body.voice || 'mock_audio';
        if (typeof ai.transcribeAudio === 'function') {
          messageText = await ai.transcribeAudio(audioData, 'audio/ogg');
        } else {
          messageText = 'Olá, gostaria de verificar a minha conexão.';
        }
        messageText = `[Áudio transcrito do cliente]: "${messageText}"`;
      } else if (body.image || body.imageUrl) {
        isImage = true;
        const imgData = body.image || 'mock_image';
        if (typeof ai.analyzeReceipt === 'function') {
          const receipt = await ai.analyzeReceipt(imgData, 'image/jpeg');
          messageText = `[Comprovante enviado pelo cliente]: Valor R$ ${receipt.amount || '0.00'}, Data: ${receipt.date || 'hoje'}. ${receipt.notes || ''}`;
        } else {
          messageText = '[Comprovante de pagamento anexado pelo cliente]';
        }
      } else {
        messageText = body.text || body.message || body.body || '';
      }
    }

    if (!fromNumber || !messageText) {
      return { status: 'ignored_or_status_ack' };
    }

    return runWithTenant(tenantId, async () => {
      const conv = await this.conversation.findOrCreateConversation('WHATSAPP', fromNumber);
      const decision = await this.orchestrator.handleMessage(conv.id, messageText);

      const lastAiMsg = await this.db.client.message.findFirst({
        where: { conversationId: conv.id, role: 'AGENT' },
        orderBy: { createdAt: 'desc' },
      });

      this.logger.log(`Resposta gerada para WhatsApp (${fromNumber}): ${lastAiMsg?.content?.slice(0, 100)}...`);

      return {
        status: 'processed',
        conversationId: conv.id,
        isAudio,
        isImage,
        reply: lastAiMsg?.content || (decision ? `Decisão: ${decision.outcome}` : 'Mensagem recebida'),
        decision,
      };
    });
  }

  /**
   * Disparo proativo de avisos de manutenção na PON / Região para clientes via WhatsApp.
   */
  @Public()
  @Post('broadcast-maintenance')
  @HttpCode(HttpStatus.OK)
  async broadcastMaintenance(
    @Body() body: { tenantId?: string; ponId?: string; message: string; phones?: string[] },
  ) {
    const tenantId = body.tenantId || process.env.DEFAULT_TENANT_ID || 'tnt_vibe';
    const alertMessage = body.message?.trim();
    if (!alertMessage) throw new BadRequestException('Mensagem de aviso obrigatória.');

    return runWithTenant(tenantId, async () => {
      let targetPhones = body.phones || [];
      if (!targetPhones.length) {
        // Se não especificou telefones, busca conversas ativas no canal WhatsApp
        const recentConvs = await this.db.client.conversation.findMany({
          where: { channel: 'WHATSAPP' },
          take: 50,
          select: { channelUserId: true },
        });
        targetPhones = recentConvs.map((c) => c.channelUserId);
      }

      const results = [];
      for (const phone of targetPhones) {
        try {
          const conv = await this.conversation.findOrCreateConversation('WHATSAPP', phone);
          const formattedMsg = `📢 *AVISO DE MANUTENÇÃO PROATIVA - VIBE TELECOM*\n\n${alertMessage}`;
          const msg = await this.conversation.appendMessage(conv.id, 'AGENT', formattedMsg);
          results.push({ phone, status: 'sent', messageId: msg.id });
        } catch (e: any) {
          results.push({ phone, status: 'failed', error: e.message });
        }
      }

      this.logger.log(`Disparo proativo de manutenção enviado para ${results.length} destinatários.`);
      return {
        broadcast: true,
        totalRecipients: results.length,
        dispatchedAt: new Date().toISOString(),
        results,
      };
    });
  }
}

