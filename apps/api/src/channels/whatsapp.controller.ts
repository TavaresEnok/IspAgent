import { Controller, Get, Post, Query, Body, Headers, HttpCode, HttpStatus, Logger, BadRequestException } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { AgentOrchestratorService } from '../agent/agent-orchestrator.service';
import { ConversationService } from '../conversation/conversation.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { runWithTenant } from '../common/tenant-context';

@Controller('public/whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(
    private readonly orchestrator: AgentOrchestratorService,
    private readonly conversation: ConversationService,
    private readonly db: TenantPrismaService,
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
   * Recebe mensagens do WhatsApp (suporta payload oficial da Meta Cloud API e formato simplificado de integradores como Z-API/Evolution).
   */
  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleIncomingMessage(@Body() body: any, @Query('tenantId') queryTenantId?: string) {
    this.logger.log(`WhatsApp webhook recebido: ${JSON.stringify(body).slice(0, 300)}`);

    const tenantId = queryTenantId || process.env.DEFAULT_TENANT_ID || 'tnt_vibe';

    // 1. Extração do remetente e do texto da mensagem
    let fromNumber = '';
    let messageText = '';

    // Formato Meta Cloud API
    if (body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      const msg = body.entry[0].changes[0].value.messages[0];
      fromNumber = msg.from;
      if (msg.type === 'text') {
        messageText = msg.text?.body || '';
      } else if (msg.type === 'interactive') {
        messageText = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '';
      }
    } 
    // Formato Z-API / Evolution / Webhook genérico
    else if (body?.phone || body?.sender || body?.from) {
      fromNumber = String(body.phone || body.sender || body.from).replace(/\D/g, '');
      messageText = body.text || body.message || body.body || '';
    }

    if (!fromNumber || !messageText) {
      // Ignora eventos de status (delivered, read, sent) ou payloads sem texto
      return { status: 'ignored_or_status_ack' };
    }

    return runWithTenant(tenantId, async () => {
      // Cria ou busca a conversa no canal WHATSAPP
      const conv = await this.conversation.findOrCreateConversation('WHATSAPP', fromNumber);

      // Processa a mensagem pelo orquestrador inteligente
      const decision = await this.orchestrator.handleMessage(conv.id, messageText);

      // Busca a última mensagem gerada pela IA para devolver no ack/webhook
      const lastAiMsg = await this.db.client.message.findFirst({
        where: { conversationId: conv.id, role: 'AGENT' },
        orderBy: { createdAt: 'desc' },
      });

      this.logger.log(`Resposta gerada para WhatsApp (${fromNumber}): ${lastAiMsg?.content?.slice(0, 100)}...`);

      return {
        status: 'processed',
        conversationId: conv.id,
        reply: lastAiMsg?.content || (decision ? `Decisão: ${decision.outcome}` : 'Mensagem recebida'),
        decision,
      };
    });
  }
}
