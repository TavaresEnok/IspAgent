import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
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
import { isValidWebchatToken, issueWebchatToken } from './webchat-session';

/** Identificador do "usuário" do canal: telefone digitado (DEMO) ou id de sessão aleatório. */
const CHANNEL_USER_ID = /^[\w+:.@-]{1,64}$/;
/** Prefixo reservado ao simulador do painel (cliente real do PulseISP escolhido por um admin). */
const RESERVED_PREFIX = 'pulse:';

class WebchatMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(CHANNEL_USER_ID, { message: 'channelUserId inválido' })
  channelUserId!: string;

  // Cada mensagem aciona classificação + (possivelmente) LLM: sem teto, é custo e superfície de abuso.
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;
}

/**
 * Web Chat (seção 6.3): canal 100% local, sem serviço externo. Público (sem JWT) — quem identifica o
 * tenant é o segmento `:tenantId` da URL, não um token de staff. É um canal de DEMO: o "telefone" digitado
 * NÃO prova identidade (só o WhatsApp, verificado pela Meta, provaria), por isso:
 *   - fora do modo DEMO (`ISPAGENT_ENV=production`) o canal fica desligado, a menos que
 *     `ISPAGENT_WEBCHAT_PUBLIC_ENABLED=true`; quando ligado em produção o telefone não identifica ninguém
 *     (só o documento informado no chat) e cada conversa exige um token de sessão emitido pelo servidor;
 *   - o prefixo `pulse:` (cliente real do PulseISP) só aceita requisição com login de admin do tenant;
 *   - buscar clientes do PulseISP e simular cliente são rotas de STAFF (`/pulseisp/*`), nunca públicas.
 */
@Controller('public/webchat')
export class WebchatController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly db: TenantPrismaService,
    private readonly conversation: ConversationService,
    private readonly orchestrator: AgentOrchestratorService,
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
    this.assertEnabled();
    await this.requireTenant(tenantId);
    this.assertChannelUserAllowed(tenantId, dto.channelUserId, req);

    return runWithTenant(tenantId, async () => {
      const existing = await this.findOpenConversation(dto.channelUserId);
      this.assertSession(tenantId, dto.channelUserId, req, token, existing !== null);

      const conv = existing ?? (await this.conversation.findOrCreateConversation('WEBCHAT', dto.channelUserId));
      const decision = await this.orchestrator.handleMessage(conv.id, dto.message);
      const [messages, refreshed] = await Promise.all([
        this.db.client.message.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: 'asc' } }),
        this.db.client.conversation.findUniqueOrThrow({ where: { id: conv.id } }),
      ]);
      // `status` fresco (não o `conv` capturado antes de handleMessage rodar) — o Web Chat usa isto
      // pra saber, sem precisar recarregar a página, que a IA parou de responder (HUMAN_ACTIVE) ou que
      // a conversa entrou na fila humana (HANDOFF_PENDING).
      return {
        conversationId: conv.id,
        decision,
        messages,
        status: refreshed.status,
        ...(isProduction() ? { sessionToken: issueWebchatToken(tenantId, dto.channelUserId) } : {}),
      };
    });
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

      // Mesma ordem de limpeza segura de FK usada em test/conversation.spec.ts (resetConversationsFor):
      // ToolCall -> AgentRun/Handoff -> Message -> Conversation.
      for (const conv of existing) {
        const runs = await this.db.client.agentRun.findMany({ where: { conversationId: conv.id } });
        for (const run of runs) {
          await this.db.client.toolCall.deleteMany({ where: { agentRunId: run.id } });
        }
        await this.db.client.agentRun.deleteMany({ where: { conversationId: conv.id } });
        await this.db.client.handoff.deleteMany({ where: { conversationId: conv.id } });
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

  private assertChannelUserAllowed(tenantId: string, channelUserId: string, req: Request) {
    if (!CHANNEL_USER_ID.test(channelUserId)) throw new ForbiddenException('channelUserId inválido.');

    if (channelUserId.startsWith(RESERVED_PREFIX)) {
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
    if (channelUserId.startsWith(RESERVED_PREFIX) && this.staffOf(tenantId, req, 'TENANT_ADMIN')) return;
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
