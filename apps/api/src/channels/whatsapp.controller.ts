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
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { runWithTenant } from '../common/tenant-context';
import { AiProviderResolverService } from '../integrations/ai/ai-provider-resolver.service';
import { downloadWhatsAppMedia, isValidMetaSignature, sendWhatsAppText, whatsappEnabled } from './whatsapp-cloud';

const MEDIA_NOT_UNDERSTOOD =
  'Não consegui abrir o arquivo que você enviou. Pode me escrever em poucas palavras o que você precisa?';

interface MetaMessage {
  from?: string;
  type?: string;
  text?: { body?: string };
  audio?: { id?: string; mime_type?: string };
  voice?: { id?: string; mime_type?: string };
  image?: { id?: string; mime_type?: string };
  document?: { id?: string; mime_type?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
}

interface MetaWebhookBody {
  entry?: Array<{ changes?: Array<{ value?: { messages?: MetaMessage[] } }> }>;
}

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
 * WhatsApp Cloud API (Meta). É o único canal em que o número PROVA a identidade — justamente por isso o
 * webhook só aceita requisição assinada pela Meta (`X-Hub-Signature-256`) e o canal fica desligado até
 * `ISPAGENT_CHANNEL_WHATSAPP_ENABLED=true`. A resposta vai para o cliente pela API da Meta; o corpo HTTP
 * do webhook nunca carrega conteúdo da conversa.
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
    const conv = await this.conversation.findOrCreateConversation('WHATSAPP', from);
    const text = await this.toText(tenantId, msg);

    if (text === null) {
      await this.conversation.appendMessage(conv.id, 'CUSTOMER', `[${msg.type ?? 'mensagem'} recebido — não foi possível processar]`);
      if (conv.status !== 'HUMAN_ACTIVE') {
        await this.conversation.appendMessage(conv.id, 'AGENT', MEDIA_NOT_UNDERSTOOD);
        await sendWhatsAppText(from, MEDIA_NOT_UNDERSTOOD);
      }
      return;
    }
    if (!text.trim()) return;

    const decision = await this.orchestrator.handleMessage(conv.id, text.slice(0, 2000));
    if (!decision) return; // humano assumiu: quem responde é o atendente

    const reply = await this.db.client.message.findFirst({
      where: { conversationId: conv.id, role: { in: ['AGENT', 'SYSTEM'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (reply && !(await sendWhatsAppText(from, reply.content))) {
      this.logger.warn('Resposta não enviada ao WhatsApp (canal sem PHONE_NUMBER_ID/ACCESS_TOKEN ou erro da Meta).');
    }
  }

  /** Texto do turno; `null` = mídia que não deu para processar (nunca inventar o conteúdo). */
  private async toText(tenantId: string, msg: MetaMessage): Promise<string | null> {
    switch (msg.type) {
      case 'text':
        return msg.text?.body ?? '';
      case 'interactive':
        return msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? '';
      case 'audio':
      case 'voice': {
        const media = msg.audio?.id ?? msg.voice?.id;
        const file = media ? await downloadWhatsAppMedia(media).catch(() => null) : null;
        const ai = await this.aiResolver.resolve(tenantId);
        if (!file || typeof ai.transcribeAudio !== 'function') return null;
        const transcription = (await ai.transcribeAudio(file.base64, file.mimeType).catch(() => '')).trim();
        return transcription ? `[Áudio transcrito]: ${transcription}` : null;
      }
      case 'image':
      case 'document': {
        const media = msg.image?.id ?? msg.document?.id;
        const file = media ? await downloadWhatsAppMedia(media).catch(() => null) : null;
        if (!file) return null;
        const ai = await this.aiResolver.resolve(tenantId);
        const receipt =
          typeof ai.analyzeReceipt === 'function' ? await ai.analyzeReceipt(file.base64, file.mimeType).catch(() => null) : null;
        if (receipt?.isValid) {
          const amount = receipt.amount ? `R$ ${receipt.amount.toFixed(2).replace('.', ',')}` : 'valor não identificado';
          return `[Comprovante de pagamento enviado pelo cliente — leitura automática, não confirmada: ${amount}, ${receipt.date ?? 'data não identificada'}]. Já efetuei o pagamento, segue o comprovante.`;
        }
        return '[Arquivo enviado pelo cliente — a leitura automática não reconheceu um comprovante de pagamento].';
      }
      default:
        return null;
    }
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
    const results: Array<{ phone: string; status: 'sent' | 'recorded' | 'failed' }> = [];
    for (const { channelUserId: phone } of known) {
      try {
        const conv = await this.conversation.findOrCreateConversation('WHATSAPP', phone);
        await this.conversation.appendMessage(conv.id, 'AGENT', text);
        results.push({ phone, status: (await sendWhatsAppText(phone, text)) ? 'sent' : 'recorded' });
      } catch {
        results.push({ phone, status: 'failed' });
      }
    }

    await this.db.client.auditLog.create({
      data: {
        tenantId,
        actorType: 'USER',
        actorId: req.user!.userId,
        action: 'whatsapp.broadcast',
        entityType: 'Tenant',
        entityId: tenantId,
        metadata: { recipients: results.length, sent: results.filter((r) => r.status === 'sent').length },
      },
    });
    this.logger.log(`Aviso proativo registrado para ${results.length} conversas.`);
    return { broadcast: true, totalRecipients: results.length, dispatchedAt: new Date().toISOString(), results };
  }
}
