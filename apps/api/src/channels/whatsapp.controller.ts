import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Post,
  Query,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ArrayMaxSize, IsArray, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AgentOrchestratorService } from '../agent/agent-orchestrator.service';
import { ConversationService } from '../conversation/conversation.service';
import { WHATSAPP_CSAT_QUESTION } from '../conversation/conversation-lifecycle.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { runWithTenant } from '../common/tenant-context';
import { AiProviderResolverService } from '../integrations/ai/ai-provider-resolver.service';
import { WhatsAppCloudClient, isValidMetaSignature, whatsappEnabled } from './whatsapp-cloud.client';

const UNREADABLE_AUDIO_MESSAGE = 'Não consegui entender o seu áudio. Pode escrever a sua mensagem, por favor?';
const UNREADABLE_IMAGE_MESSAGE =
  'Não consegui ler essa imagem como comprovante. Pode enviar uma foto mais nítida, ou escrever o valor e a data do pagamento?';

interface MetaMessage {
  from?: string;
  type?: string;
  text?: { body?: string };
  audio?: { id?: string };
  voice?: { id?: string };
  image?: { id?: string };
  document?: { id?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
}

interface MetaWebhookBody {
  entry?: Array<{ changes?: Array<{ value?: { messages?: MetaMessage[] } }> }>;
}

/** Texto a processar, ou resposta fixa quando a mídia não pôde ser lida (nunca inventar o conteúdo). */
type Incoming = { text: string } | { unreadable: string; marker: string } | null;

class BroadcastDto {
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  message!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @Matches(/^\d{10,15}$/, { each: true })
  phones?: string[];
}

/**
 * WhatsApp Cloud API (Meta). É o único canal em que o número PROVA a identidade — por isso o webhook só
 * aceita requisição assinada pela Meta (`X-Hub-Signature-256`), o tenant vem da configuração do servidor
 * (`ISPAGENT_WHATSAPP_TENANT_ID`, nunca da URL) e o canal fica desligado até
 * `ISPAGENT_CHANNEL_WHATSAPP_ENABLED=true`. As respostas vão ao cliente pela API da Meta; o corpo HTTP do
 * webhook nunca carrega conteúdo da conversa.
 */
@Controller('public/whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: AgentOrchestratorService,
    private readonly conversation: ConversationService,
    private readonly db: TenantPrismaService,
    private readonly aiResolver: AiProviderResolverService,
    private readonly whatsapp: WhatsAppCloudClient,
  ) {}

  /** Validação do webhook pela Meta: devolve `hub.challenge` se o verify token bater. */
  @Public()
  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ) {
    const expected = process.env.ISPAGENT_WHATSAPP_VERIFY_TOKEN;
    if (!whatsappEnabled() || !expected) throw new NotFoundException();
    if (mode === 'subscribe' && token === expected) return challenge;
    throw new BadRequestException('Token de validação inválido');
  }

  @Public()
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleIncoming(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: MetaWebhookBody,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    if (!whatsappEnabled()) throw new NotFoundException();
    if (!isValidMetaSignature(req.rawBody, signature)) throw new ForbiddenException('Assinatura inválida.');

    const tenantId = process.env.ISPAGENT_WHATSAPP_TENANT_ID;
    if (!tenantId || !(await this.prisma.tenant.findUnique({ where: { id: tenantId } }))) {
      this.logger.error('ISPAGENT_WHATSAPP_TENANT_ID ausente ou inexistente — mensagem do WhatsApp descartada.');
      return { status: 'ignored' };
    }

    const messages = (body?.entry ?? []).flatMap((e) => e?.changes ?? []).flatMap((c) => c?.value?.messages ?? []);
    for (const msg of messages) {
      const from = String(msg.from ?? '').replace(/\D/g, '');
      if (!/^\d{10,15}$/.test(from)) continue;
      try {
        await runWithTenant(tenantId, () => this.process(tenantId, from, msg));
      } catch (err) {
        this.logger.error(`Falha ao processar mensagem do WhatsApp: ${err instanceof Error ? err.message : err}`);
      }
    }
    // A Meta só precisa do 200; nada da conversa volta aqui.
    return { status: 'received' };
  }

  private async process(tenantId: string, from: string, msg: MetaMessage) {
    const incoming = await this.toIncoming(tenantId, msg);
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

  private async toIncoming(tenantId: string, msg: MetaMessage): Promise<Incoming> {
    switch (msg.type) {
      case 'text':
        return { text: msg.text?.body ?? '' };
      case 'interactive':
        return { text: msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? '' };
      case 'audio':
      case 'voice': {
        const media = await this.whatsapp.downloadMedia(msg.audio?.id ?? msg.voice?.id);
        const ai = await this.aiResolver.resolve(tenantId);
        const transcription =
          media && ai.transcribeAudio ? (await ai.transcribeAudio(media.base64, media.mimeType).catch(() => '')).trim() : '';
        return transcription
          ? { text: `[Áudio transcrito do cliente]: "${transcription}"` }
          : { unreadable: UNREADABLE_AUDIO_MESSAGE, marker: '[Áudio enviado pelo cliente]' };
      }
      case 'image':
      case 'document': {
        const media = await this.whatsapp.downloadMedia(msg.image?.id ?? msg.document?.id);
        const ai = await this.aiResolver.resolve(tenantId);
        const receipt = media && ai.analyzeReceipt ? await ai.analyzeReceipt(media.base64, media.mimeType).catch(() => null) : null;
        if (!receipt?.isValid) return { unreadable: UNREADABLE_IMAGE_MESSAGE, marker: '[Imagem enviada pelo cliente]' };
        const amount = Number(receipt.amount);
        const amountStr = Number.isFinite(amount) && amount > 0 ? `R$ ${amount.toFixed(2).replace('.', ',')}` : 'valor não identificado';
        return {
          text: `[Comprovante enviado pelo cliente — leitura automática, não confirmada: ${amountStr}, ${receipt.date ?? 'data não identificada'}]. Já efetuei o pagamento.`,
        };
      }
      default:
        return null;
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

/**
 * Aviso proativo (ex.: manutenção numa PON) para clientes que já conversaram pelo WhatsApp. Rota de
 * STAFF: pública, qualquer um injetaria mensagens (golpe de PIX) em todas as conversas do provedor.
 */
@Controller('whatsapp')
export class WhatsAppBroadcastController {
  private readonly logger = new Logger(WhatsAppBroadcastController.name);

  constructor(
    private readonly db: TenantPrismaService,
    private readonly conversation: ConversationService,
    private readonly whatsapp: WhatsAppCloudClient,
  ) {}

  @Post('broadcast-maintenance')
  @Roles('SUPERVISOR')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async broadcastMaintenance(@Body() dto: BroadcastDto, @Req() req: Request) {
    const tenantId = req.user!.tenantId;
    const tenant = await this.db.client.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
    const brand = tenant?.name.replace(/\s*\(.*\)\s*$/, '').trim().toUpperCase() || 'SEU PROVEDOR';

    // Só números que já têm conversa no WhatsApp deste tenant (sem criar contato novo).
    const known = await this.db.client.conversation.findMany({
      where: { channel: 'WHATSAPP', ...(dto.phones?.length ? { channelUserId: { in: dto.phones } } : {}) },
      distinct: ['channelUserId'],
      take: 500,
      select: { channelUserId: true },
    });

    const text = `📢 *AVISO - ${brand}*\n\n${dto.message.trim()}`;
    const results: Array<{ phone: string; delivered: boolean; reason?: string }> = [];
    for (const { channelUserId: phone } of known) {
      try {
        const conv = await this.conversation.findOrCreateConversation('WHATSAPP', phone);
        await this.conversation.appendMessage(conv.id, 'AGENT', text);
        const delivery = await this.whatsapp.sendText(phone, text);
        results.push({ phone, delivered: delivery.delivered, ...(delivery.delivered ? {} : { reason: delivery.reason }) });
      } catch (err) {
        results.push({ phone, delivered: false, reason: err instanceof Error ? err.message : String(err) });
      }
    }

    const delivered = results.filter((r) => r.delivered).length;
    await this.db.client.auditLog.create({
      data: {
        tenantId,
        actorType: 'USER',
        actorId: req.user!.userId,
        action: 'whatsapp.broadcast',
        entityType: 'Tenant',
        entityId: tenantId,
        metadata: { recipients: results.length, delivered },
      },
    });
    this.logger.log(`Aviso proativo: ${delivered}/${results.length} entregues ao WhatsApp.`);
    return { broadcast: true, totalRecipients: results.length, delivered, dispatchedAt: new Date().toISOString(), results };
  }
}
