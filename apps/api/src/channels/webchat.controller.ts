import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ROLE_HIERARCHY, Role } from '@ispagent/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { ConversationService } from '../conversation/conversation.service';
import { AgentOrchestratorService } from '../agent/agent-orchestrator.service';
import { runWithTenant } from '../common/tenant-context';
import { Public } from '../common/decorators/public.decorator';
import {
  demoEndpointsEnabled,
  isProduction,
  trustWebchatPhone,
  webchatPublicEnabled,
} from '../common/security-config';
import { ERP_ADAPTER, ERPAdapter } from '../integrations/erp/erp-adapter.interface';
import { AiProviderResolverService } from '../integrations/ai/ai-provider-resolver.service';
import { ReceiptAnalysisResult } from '../integrations/ai/ai-provider.interface';
import { isValidWebchatToken, issueWebchatToken } from './webchat-session';

/** Identificador do "usuário" do canal: telefone digitado (DEMO) ou id de sessão aleatório. */
const CHANNEL_USER_ID = /^[\w+:.@-]{1,64}$/;
/**
 * Prefixos reservados aos simuladores do painel (um admin escolheu um cliente real): `pulse:` (PulseISP)
 * e `sgp:` (ERP). Só aceitos com login de administrador do mesmo tenant.
 */
const RESERVED_PREFIXES = ['pulse:', 'sgp:'];
/** ~6 MB de arquivo (base64 cresce ~4/3). O limite de corpo dessas rotas é configurado em app.setup.ts. */
const MAX_MEDIA_BASE64 = 8_000_000;
const RECEIPT_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
const AUDIO_MIME = ['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a', 'audio/aac'];

const AUDIO_NOT_UNDERSTOOD =
  'Não consegui ouvir o seu áudio por aqui. Pode me escrever em poucas palavras o que você precisa?';

class ChannelUserDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(CHANNEL_USER_ID, { message: 'channelUserId inválido' })
  channelUserId!: string;
}

class WebchatMessageDto extends ChannelUserDto {
  // Cada mensagem aciona classificação + (possivelmente) LLM: sem teto, é custo e superfície de abuso.
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;
}

class SurveyDto extends ChannelUserDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

class ReceiptDto extends ChannelUserDto {
  @IsString()
  @MinLength(16)
  @MaxLength(MAX_MEDIA_BASE64)
  fileBase64!: string;

  @IsOptional()
  @IsIn(RECEIPT_MIME)
  mimeType?: string;
}

class VoiceDto extends ChannelUserDto {
  @IsString()
  @MinLength(16)
  @MaxLength(MAX_MEDIA_BASE64)
  audioBase64!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  mimeType?: string;
}

/**
 * Web Chat (seção 6.3): canal para o cliente final. Público (sem JWT) — quem identifica o tenant é o
 * segmento `:tenantId` da URL, não um token de staff. O "telefone" digitado NÃO prova identidade (só um
 * canal verificado, como o WhatsApp, provaria), por isso:
 *   - fora do modo DEMO (`ISPAGENT_ENV=production`) o canal fica desligado, a menos que
 *     `ISPAGENT_WEBCHAT_PUBLIC_ENABLED=true`; quando ligado em produção o telefone não identifica ninguém
 *     (só o documento informado no chat) e cada conversa exige um token de sessão emitido pelo servidor;
 *   - os prefixos `pulse:`/`sgp:` (cliente real escolhido no simulador) só aceitam login de admin do tenant;
 *   - buscar clientes do ERP/PulseISP e simular cliente são rotas de STAFF (`/sgp/*`, `/pulseisp/*`).
 * Toda rota que toca uma conversa (mensagem, comprovante, áudio, pesquisa, aviso) passa pelas mesmas
 * checagens de canal e de sessão.
 */
@Controller('public/webchat')
export class WebchatController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly db: TenantPrismaService,
    private readonly conversation: ConversationService,
    private readonly orchestrator: AgentOrchestratorService,
    @Inject(ERP_ADAPTER) private readonly erp: ERPAdapter,
    private readonly aiResolver: AiProviderResolverService,
  ) {}

  @Public()
  @Get('config')
  config() {
    this.assertEnabled();
    return {
      phoneIdentifies: trustWebchatPhone(),
      sessionTokenRequired: isProduction(),
      demoEndpoints: demoEndpointsEnabled(),
    };
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(':tenantId/message')
  async sendMessage(
    @Param('tenantId') tenantId: string,
    @Body() dto: WebchatMessageDto,
    @Req() req: Request,
    @Headers('x-webchat-token') token?: string,
  ) {
    return this.withConversation(tenantId, dto.channelUserId, req, token, async (convId) => ({
      decision: await this.orchestrator.handleMessage(convId, dto.message),
    }));
  }

  // Leitura pura: nunca cria conversa (um GET não pode ter efeito colateral).
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':tenantId/conversation/:channelUserId')
  async getConversation(
    @Param('tenantId') tenantId: string,
    @Param('channelUserId') channelUserId: string,
    @Req() req: Request,
    @Headers('x-webchat-token') token?: string,
  ) {
    this.assertEnabled();
    await this.requireTenant(tenantId);
    this.assertChannelUserAllowed(tenantId, channelUserId, req);

    return runWithTenant(tenantId, async () => {
      const conv = await this.findOpenConversation(channelUserId);
      if (!conv) return { conversationId: null, status: null, messages: [] };
      this.assertSession(tenantId, channelUserId, req, token, true);

      const messages = await this.db.client.message.findMany({
        where: { conversationId: conv.id },
        orderBy: { createdAt: 'asc' },
      });
      return { conversationId: conv.id, status: conv.status, messages };
    });
  }

  // "Resetar conversa" do DEMO. Em produção só um supervisor logado pode apagar (sem login = 404).
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Delete(':tenantId/conversation/:channelUserId')
  async resetConversation(
    @Param('tenantId') tenantId: string,
    @Param('channelUserId') channelUserId: string,
    @Req() req: Request,
    @Headers('x-webchat-token') token?: string,
  ) {
    this.assertEnabled();
    await this.requireTenant(tenantId);
    this.assertChannelUserAllowed(tenantId, channelUserId, req);

    const staff = this.staffOf(tenantId, req, 'SUPERVISOR');
    if (!demoEndpointsEnabled() && !staff) throw new NotFoundException();

    return runWithTenant(tenantId, async () => {
      const existing = await this.db.client.conversation.findMany({
        where: { channel: 'WEBCHAT', channelUserId },
      });
      if (existing.length > 0 && !staff) this.assertSession(tenantId, channelUserId, req, token, true);

      // Ordem de limpeza segura de FK: ToolCall -> AgentRun/Handoff/filhos -> Message -> Conversation.
      for (const conv of existing) {
        const runs = await this.db.client.agentRun.findMany({ where: { conversationId: conv.id } });
        for (const run of runs) {
          await this.db.client.toolCall.deleteMany({ where: { agentRunId: run.id } });
        }
        await this.db.client.agentRun.deleteMany({ where: { conversationId: conv.id } });
        await this.db.client.handoff.deleteMany({ where: { conversationId: conv.id } });
        await this.db.client.satisfactionSurvey.deleteMany({ where: { conversationId: conv.id } });
        await this.db.client.cancellationRequest.deleteMany({ where: { conversationId: conv.id } });
        await this.db.client.message.deleteMany({ where: { conversationId: conv.id } });
        await this.db.client.conversation.delete({ where: { id: conv.id } });
      }

      await this.db.client.auditLog.create({
        data: {
          tenantId,
          actorType: staff ? 'USER' : 'SYSTEM',
          actorId: staff?.userId ?? null,
          action: 'webchat.conversation_reset',
          entityType: 'Conversation',
          metadata: { conversationsRemoved: existing.length },
        },
      });

      return { reset: true, conversationsRemoved: existing.length };
    });
  }

  /** Pesquisa de satisfação (CSAT) ao encerrar: só da PRÓPRIA conversa aberta do canal/sessão. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':tenantId/survey')
  async submitSurvey(
    @Param('tenantId') tenantId: string,
    @Body() dto: SurveyDto,
    @Req() req: Request,
    @Headers('x-webchat-token') token?: string,
  ) {
    this.assertEnabled();
    await this.requireTenant(tenantId);
    this.assertChannelUserAllowed(tenantId, dto.channelUserId, req);

    return runWithTenant(tenantId, async () => {
      const conv = await this.findOpenConversation(dto.channelUserId);
      if (!conv) throw new NotFoundException('Conversa não encontrada.');
      this.assertSession(tenantId, dto.channelUserId, req, token, true);

      const survey = await this.db.client.satisfactionSurvey.create({
        data: {
          tenantId,
          conversationId: conv.id,
          score: dto.rating,
          feedback: dto.comment?.trim() || null,
        },
      });
      await this.db.client.conversation.update({ where: { id: conv.id }, data: { status: 'CLOSED' } });

      return { success: true, surveyId: survey.id };
    });
  }

  /** Aviso proativo: o serviço do cliente identificado nesta conversa está sem sinal agora? */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get(':tenantId/incident-check/:channelUserId')
  async checkIncident(
    @Param('tenantId') tenantId: string,
    @Param('channelUserId') channelUserId: string,
    @Req() req: Request,
    @Headers('x-webchat-token') token?: string,
  ) {
    this.assertEnabled();
    await this.requireTenant(tenantId);
    this.assertChannelUserAllowed(tenantId, channelUserId, req);

    return runWithTenant(tenantId, async () => {
      const conv = await this.findOpenConversation(channelUserId);
      if (!conv?.contractId) return { hasIncident: false };
      this.assertSession(tenantId, channelUserId, req, token, true);

      // Status desconhecido (null) não é incidente: só avisa o que o ERP confirmou.
      const status = await this.erp.getServiceStatus(conv.contractId).catch(() => null);
      if (status && status.online === false) {
        return {
          hasIncident: true,
          severity: 'warning',
          title: 'Sinal indisponível',
          message:
            'Identificamos que a sua conexão está sem sinal no momento. Se precisar, é só me contar o que está acontecendo por aqui.',
        };
      }
      return { hasIncident: false };
    });
  }

  /**
   * Comprovante de pagamento (foto/PDF). A leitura automática é só um indício para o atendente — a imagem
   * vem do cliente e pode ser forjada, então o texto registrado deixa claro que não foi confirmada.
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':tenantId/upload-receipt')
  async uploadReceipt(
    @Param('tenantId') tenantId: string,
    @Body() dto: ReceiptDto,
    @Req() req: Request,
    @Headers('x-webchat-token') token?: string,
  ) {
    return this.withConversation(tenantId, dto.channelUserId, req, token, async (convId) => {
      const ai = await this.aiResolver.resolve(tenantId);
      let receiptAnalysis: ReceiptAnalysisResult | null = null;
      if (typeof ai.analyzeReceipt === 'function') {
        receiptAnalysis = await ai.analyzeReceipt(dto.fileBase64, dto.mimeType || 'image/jpeg').catch(() => null);
      }

      let text = '[Comprovante de pagamento enviado pelo cliente — leitura automática indisponível].';
      if (receiptAnalysis?.isValid) {
        const amount = receiptAnalysis.amount
          ? `R$ ${receiptAnalysis.amount.toFixed(2).replace('.', ',')}`
          : 'valor não identificado';
        const date = receiptAnalysis.date ?? 'data não identificada';
        text = `[Comprovante de pagamento enviado pelo cliente — leitura automática, não confirmada: ${amount}, ${date}].`;
      } else if (receiptAnalysis) {
        text = '[Arquivo enviado pelo cliente como comprovante — a leitura automática não reconheceu um pagamento].';
      }
      const message = `${text} Já efetuei o pagamento, segue o comprovante.`;

      return { receiptAnalysis, decision: await this.orchestrator.handleMessage(convId, message) };
    });
  }

  /** Mensagem de voz: transcreve e segue como texto. Sem transcrição, pede para escrever — nunca inventa. */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(':tenantId/voice')
  async sendVoiceNote(
    @Param('tenantId') tenantId: string,
    @Body() dto: VoiceDto,
    @Req() req: Request,
    @Headers('x-webchat-token') token?: string,
  ) {
    const mimeType = (dto.mimeType || 'audio/webm').split(';')[0].trim().toLowerCase();
    return this.withConversation(tenantId, dto.channelUserId, req, token, async (convId, status) => {
      const ai = await this.aiResolver.resolve(tenantId);
      let transcription = '';
      if (AUDIO_MIME.includes(mimeType) && typeof ai.transcribeAudio === 'function') {
        transcription = (await ai.transcribeAudio(dto.audioBase64, mimeType).catch(() => '')).trim().slice(0, 2000);
      }

      if (!transcription) {
        await this.conversation.appendMessage(convId, 'CUSTOMER', '[Áudio enviado pelo cliente — não foi possível transcrever]');
        if (status !== 'HUMAN_ACTIVE') await this.conversation.appendMessage(convId, 'AGENT', AUDIO_NOT_UNDERSTOOD);
        return { transcription: null, decision: null };
      }

      return {
        transcription,
        decision: await this.orchestrator.handleMessage(convId, `[Áudio transcrito]: ${transcription}`),
      };
    });
  }

  /**
   * Fluxo comum das rotas que escrevem na conversa: canal habilitado, tenant existe, prefixo permitido,
   * sessão válida (produção), conversa aberta (ou nova) e resposta com mensagens + status atualizados.
   */
  private async withConversation<T extends object>(
    tenantId: string,
    channelUserId: string,
    req: Request,
    token: string | undefined,
    handler: (conversationId: string, status: string) => Promise<T>,
  ) {
    this.assertEnabled();
    await this.requireTenant(tenantId);
    this.assertChannelUserAllowed(tenantId, channelUserId, req);

    return runWithTenant(tenantId, async () => {
      const existing = await this.findOpenConversation(channelUserId);
      this.assertSession(tenantId, channelUserId, req, token, existing !== null);

      const conv = existing ?? (await this.conversation.findOrCreateConversation('WEBCHAT', channelUserId));
      const result = await handler(conv.id, conv.status);
      const [messages, refreshed] = await Promise.all([
        this.db.client.message.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: 'asc' } }),
        this.db.client.conversation.findUniqueOrThrow({ where: { id: conv.id } }),
      ]);
      // `status` fresco — o Web Chat usa isto para saber, sem recarregar, que a IA parou de responder
      // (HUMAN_ACTIVE) ou que a conversa entrou na fila humana (HANDOFF_PENDING).
      return {
        conversationId: conv.id,
        ...result,
        messages,
        status: refreshed.status,
        ...(isProduction() ? { sessionToken: issueWebchatToken(tenantId, channelUserId) } : {}),
      };
    });
  }

  private assertEnabled() {
    if (!webchatPublicEnabled()) throw new NotFoundException();
  }

  private findOpenConversation(channelUserId: string) {
    return this.db.client.conversation.findFirst({
      where: { channel: 'WEBCHAT', channelUserId, status: { not: 'CLOSED' } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Staff logado (JWT lido pelo middleware) do MESMO tenant da URL e com papel mínimo, ou `null`. */
  private staffOf(tenantId: string, req: Request, minRole: Role) {
    const user = req.user;
    if (!user || user.tenantId !== tenantId) return null;
    return ROLE_HIERARCHY[user.role as Role] >= ROLE_HIERARCHY[minRole] ? user : null;
  }

  private isReserved(channelUserId: string) {
    return RESERVED_PREFIXES.some((p) => channelUserId.startsWith(p));
  }

  private assertChannelUserAllowed(tenantId: string, channelUserId: string, req: Request) {
    if (!CHANNEL_USER_ID.test(channelUserId)) throw new ForbiddenException('channelUserId inválido.');

    if (this.isReserved(channelUserId)) {
      if (!this.staffOf(tenantId, req, 'TENANT_ADMIN')) {
        throw new ForbiddenException('Este canal é reservado ao simulador do painel (exige login de administrador).');
      }
      return;
    }
    // Em produção o id é uma sessão aleatória, nunca um telefone/valor adivinhável.
    if (isProduction() && !/^[A-Za-z0-9_-]{16,64}$/.test(channelUserId)) {
      throw new ForbiddenException('channelUserId precisa ser um identificador de sessão aleatório.');
    }
  }

  /** Em produção, conversa existente só é acessível com o token emitido quando ela foi criada. */
  private assertSession(tenantId: string, channelUserId: string, req: Request, token: string | undefined, exists: boolean) {
    if (!isProduction() || !exists) return;
    if (this.isReserved(channelUserId) && this.staffOf(tenantId, req, 'TENANT_ADMIN')) return;
    if (!isValidWebchatToken(tenantId, channelUserId, token)) {
      throw new ForbiddenException('Sessão do chat inválida.');
    }
  }

  private async requireTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant não encontrado');
    return tenant;
  }
}
