import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { createHash, randomBytes } from 'node:crypto';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { currentTenantId, runWithTenant } from '../common/tenant-context';
import { encryptSecret, tryDecryptSecret } from '../common/secret-cipher';
import { UnsafeOutboundUrlError, assertSafeOutboundUrl } from '../common/outbound-url';
import { AgentOrchestratorService } from '../agent/agent-orchestrator.service';
import { ConversationService } from '../conversation/conversation.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantAccessService } from '../platform/tenant-access.service';
import { WhatsAppInboundService } from './whatsapp-inbound.service';

const TIMEOUT_MS = 15_000;
const MAX_MEDIA_BYTES = 6 * 1024 * 1024;

/** Etiqueta que o atendente vê no Chatwoot em cada transferência (setor da fila humana). */
const DEPARTMENT_LABEL: Record<string, string> = {
  SUPORTE_TECNICO: 'suporte-tecnico',
  FINANCEIRO: 'financeiro',
  COMERCIAL: 'comercial',
  RETENCAO: 'retencao',
};

export interface ChatwootConfig {
  tenantId: string;
  baseUrl: string;
  publicUrl: string;
  accountId: string;
  botToken: string;
  widgetToken: string | null;
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Chatwoot de CADA provedor (tela "Chatwoot"): servidor, conta e token do Agent Bot, com os segredos
 * cifrados. O webhook do bot é achado pelo HASH do token secreto do caminho — o token em si não fica
 * consultável no banco.
 */
@Injectable()
export class ChatwootConnectionService implements OnModuleInit {
  private readonly logger = new Logger(ChatwootConnectionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Instalação antiga (um Chatwoot no `.env`): grava na primeira subida para o provedor de lá. */
  async onModuleInit() {
    const e = (k: string) => (process.env[`ISPAGENT_CHATWOOT_${k}`] ?? '').trim();
    const tenantId = e('TENANT_ID');
    if (!tenantId || !e('URL') || !e('ACCOUNT_ID') || !e('BOT_TOKEN') || e('WEBHOOK_TOKEN').length < 32) return;
    try {
      if (!(await this.prisma.tenant.findUnique({ where: { id: tenantId } }))) return;
      if (await this.prisma.chatwootConnection.findUnique({ where: { tenantId } })) return;
      await this.prisma.chatwootConnection.create({
        data: {
          tenantId,
          baseUrl: e('URL').replace(/\/+$/, ''),
          publicUrl: (e('PUBLIC_URL') || e('URL')).replace(/\/+$/, ''),
          accountId: e('ACCOUNT_ID'),
          botToken: encryptSecret(e('BOT_TOKEN')),
          webhookToken: encryptSecret(e('WEBHOOK_TOKEN')),
          webhookTokenHash: hashToken(e('WEBHOOK_TOKEN')),
          widgetToken: e('WIDGET_TOKEN') || null,
        },
      });
      this.logger.log(`Chatwoot do .env gravado (cifrado) no provedor ${tenantId}.`);
    } catch (err) {
      this.logger.error(`Migração do Chatwoot do .env falhou: ${err instanceof Error ? err.message : err}`);
    }
  }

  private toConfig(row: { tenantId: string; baseUrl: string; publicUrl: string; accountId: string; botToken: string; widgetToken: string | null }): ChatwootConfig | null {
    const botToken = tryDecryptSecret(row.botToken);
    return botToken ? { tenantId: row.tenantId, baseUrl: row.baseUrl, publicUrl: row.publicUrl, accountId: row.accountId, botToken, widgetToken: row.widgetToken } : null;
  }

  async byTenant(tenantId: string): Promise<ChatwootConfig | null> {
    const row = await this.prisma.chatwootConnection.findUnique({ where: { tenantId } });
    return row ? this.toConfig(row) : null;
  }

  async byWebhookToken(token: string): Promise<ChatwootConfig | null> {
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return null;
    const row = await this.prisma.chatwootConnection.findUnique({ where: { webhookTokenHash: hashToken(token) } });
    return row ? this.toConfig(row) : null;
  }

  async view(tenantId: string) {
    const row = await this.prisma.chatwootConnection.findUnique({ where: { tenantId } });
    const token = row ? tryDecryptSecret(row.webhookToken) : null;
    const apiBase = (process.env.ISPAGENT_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '');
    return {
      configured: Boolean(row),
      baseUrl: row?.baseUrl ?? null,
      publicUrl: row?.publicUrl ?? null,
      accountId: row?.accountId ?? null,
      hasBotToken: Boolean(row?.botToken),
      widgetToken: row?.widgetToken ?? null,
      // O admin cola esta URL no Agent Bot do Chatwoot (o token é o que autentica as chamadas).
      webhookUrl: token && apiBase ? `${apiBase}/public/chatwoot/webhook/${token}` : null,
      webhookPath: token ? `/public/chatwoot/webhook/${token}` : null,
    };
  }

  async save(tenantId: string, input: { baseUrl: string; publicUrl?: string; accountId: string; botToken?: string; widgetToken?: string }) {
    const baseUrl = input.baseUrl.trim().replace(/\/+$/, '');
    const publicUrl = (input.publicUrl?.trim() || baseUrl).replace(/\/+$/, '');
    for (const u of [baseUrl, publicUrl]) {
      if (!/^https?:\/\/[^\s/]+/i.test(u)) throw new BadRequestException('URL inválida (ex.: https://chat.provedor.com.br).');
    }
    try {
      await assertSafeOutboundUrl(baseUrl);
    } catch (err) {
      if (err instanceof UnsafeOutboundUrlError) throw new BadRequestException(`URL não permitida: ${err.message}`);
      throw err;
    }
    const accountId = input.accountId.trim();
    if (!/^\d{1,10}$/.test(accountId)) throw new BadRequestException('Informe o número da conta do Chatwoot.');
    const existing = await this.prisma.chatwootConnection.findUnique({ where: { tenantId } });
    const typed = input.botToken?.trim();
    const botToken = typed ? encryptSecret(typed) : existing && existing.baseUrl === baseUrl ? existing.botToken : null;
    if (!botToken) throw new BadRequestException('Informe o token de acesso do Agent Bot.');
    const webhookTokenPlain = (existing && tryDecryptSecret(existing.webhookToken)) || randomBytes(32).toString('hex');
    const widgetToken = input.widgetToken?.trim() || existing?.widgetToken || null;
    await this.prisma.chatwootConnection.upsert({
      where: { tenantId },
      create: { tenantId, baseUrl, publicUrl, accountId, botToken, widgetToken, webhookToken: encryptSecret(webhookTokenPlain), webhookTokenHash: hashToken(webhookTokenPlain) },
      update: { baseUrl, publicUrl, accountId, botToken, widgetToken },
    });
    return this.view(tenantId);
  }
}

/** API do Chatwoot do provedor, com o token do Agent Bot (só o que um bot pode fazer: responder e transferir). */
@Injectable()
export class ChatwootClient {
  private readonly logger = new Logger(ChatwootClient.name);
  fetchImpl: typeof fetch = (...args) => fetch(...args);

  private async call(cfg: ChatwootConfig, path: string, body: unknown): Promise<boolean> {
    try {
      // A URL é do provedor: confere de novo a cada chamada (o DNS pode ter mudado desde o cadastro).
      await assertSafeOutboundUrl(cfg.baseUrl);
      const res = await this.fetchImpl(`${cfg.baseUrl}/api/v1/accounts/${cfg.accountId}${path}`, {
        method: 'POST',
        headers: { api_access_token: cfg.botToken, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) this.logger.warn(`Chatwoot respondeu HTTP ${res.status} em ${path}`);
      return res.ok;
    } catch (err) {
      this.logger.warn(`Falha ao falar com o Chatwoot: ${err instanceof Error ? err.message : err}`);
      return false;
    }
  }

  reply(cfg: ChatwootConfig, conversationId: number, content: string) {
    return this.call(cfg, `/conversations/${conversationId}/messages`, { content, message_type: 'outgoing', private: false });
  }

  /** Transferência: sai da fila do bot (`pending`) para a fila dos atendentes (`open`), com o setor. */
  async handoff(cfg: ChatwootConfig, conversationId: number, department: string | null) {
    await this.call(cfg, `/conversations/${conversationId}/toggle_status`, { status: 'open' });
    const label = department ? DEPARTMENT_LABEL[department] : null;
    if (label) await this.call(cfg, `/conversations/${conversationId}/labels`, { labels: [label] });
  }

  /** Anexo de áudio/imagem: só do próprio Chatwoot (caminho do Active Storage), nunca a URL crua do webhook. */
  async download(cfg: ChatwootConfig, url: string | undefined): Promise<{ base64: string; mimeType: string } | null> {
    if (!url) return null;
    let path: string;
    try {
      const u = new URL(url);
      path = `${u.pathname}${u.search}`;
    } catch {
      return null;
    }
    if (!/^\/rails\/active_storage\/[\w\-/.=%]+(\?[\w\-=&%.]*)?$/.test(path) || path.includes('..')) return null;
    try {
      await assertSafeOutboundUrl(cfg.baseUrl);
      const res = await this.fetchImpl(`${cfg.baseUrl}${path}`, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0 || buf.length > MAX_MEDIA_BYTES) return null;
      return { base64: buf.toString('base64'), mimeType: (res.headers.get('content-type') ?? 'application/octet-stream').split(';')[0] };
    } catch {
      return null;
    }
  }
}

class SaveChatwootDto {
  @IsString() @MaxLength(300) baseUrl!: string;
  @IsOptional() @IsString() @MaxLength(300) publicUrl?: string;
  @Matches(/^\d{1,10}$/) accountId!: string;
  @IsOptional() @IsString() @MaxLength(200) botToken?: string;
  @IsOptional() @IsString() @MaxLength(200) widgetToken?: string;
}

/** Tela "Chatwoot" do painel (admin do provedor). */
@Controller('chatwoot/connection')
export class ChatwootConnectionController {
  constructor(
    private readonly connections: ChatwootConnectionService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @Roles('TENANT_ADMIN')
  view() {
    return this.connections.view(currentTenantId() as string);
  }

  @Put()
  @Roles('TENANT_ADMIN')
  async save(@Body() dto: SaveChatwootDto, @Req() req: Request) {
    const tenantId = currentTenantId() as string;
    const view = await this.connections.save(tenantId, dto);
    await this.prisma.auditLog.create({
      data: { tenantId, actorType: 'USER', actorId: req.user!.userId, action: 'chatwoot.connection_saved', entityType: 'Tenant', entityId: tenantId, metadata: { baseUrl: view.baseUrl, accountId: view.accountId } },
    });
    return view;
  }
}

interface ChatwootEvent {
  event?: string;
  message_type?: string;
  private?: boolean;
  content?: string | null;
  account?: { id?: number };
  conversation?: { id?: number; status?: string };
  attachments?: Array<{ file_type?: string; data_url?: string }>;
}

/**
 * Webhook do Agent Bot do Chatwoot. O Chatwoot não assina as chamadas do bot: a autenticação é o token
 * secreto do caminho (≥ 32 caracteres, gerado por provedor, procurado pelo hash) + a conta cadastrada.
 *
 * O bot só responde conversas em `pending` (fila do bot). Depois da transferência a conversa fica `open`
 * e é do atendente: o ISPAgent não fala por cima dele. Responde ao Chatwoot NA HORA e processa depois —
 * ele espera poucos segundos e, se passar, marca o bot como falho e entrega a conversa aos humanos.
 */
@Controller('public/chatwoot')
export class ChatwootWebhookController {
  private readonly logger = new Logger(ChatwootWebhookController.name);
  private readonly queues = new Map<string, Promise<void>>();
  /** Último processamento agendado (os testes esperam por ele). */
  lastJob: Promise<void> = Promise.resolve();

  constructor(
    private readonly db: TenantPrismaService,
    private readonly conversation: ConversationService,
    private readonly orchestrator: AgentOrchestratorService,
    private readonly inbound: WhatsAppInboundService,
    private readonly chatwoot: ChatwootClient,
    private readonly connections: ChatwootConnectionService,
    private readonly access: TenantAccessService,
    private readonly prisma: PrismaService,
  ) {}

  /** Página de teste do widget: endereço público e token do site do provedor (públicos por natureza). */
  @Public()
  @Get('widget-config')
  async widgetConfig(@Query('t') tenant?: string) {
    const key = (tenant ?? '').trim();
    const row = key
      ? await this.prisma.tenant.findFirst({ where: { OR: [{ id: key }, { slug: key.toLowerCase() }], status: 'ACTIVE' }, select: { id: true } })
      : null;
    const cfg = row ? await this.connections.byTenant(row.id) : null;
    if (!cfg?.widgetToken) throw new NotFoundException();
    return { baseUrl: cfg.publicUrl, websiteToken: cfg.widgetToken };
  }

  @Public()
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Post('webhook/:token')
  @HttpCode(HttpStatus.OK)
  async webhook(@Param('token') token: string, @Body() body: ChatwootEvent) {
    const cfg = await this.connections.byWebhookToken(token);
    if (!cfg) throw new NotFoundException();
    if (String(body?.account?.id ?? '') !== cfg.accountId) return { status: 'ignored' };
    if (!(await this.access.isActive(cfg.tenantId))) return { status: 'ignored' };

    const convId = Number(body?.conversation?.id);
    const isCustomerMessage = body?.event === 'message_created' && body.message_type === 'incoming' && !body.private;
    if (!isCustomerMessage || !Number.isInteger(convId) || body.conversation?.status !== 'pending') {
      return { status: 'ignored' };
    }

    const key = `${cfg.tenantId}:${convId}`;
    const job = (this.queues.get(key) ?? Promise.resolve())
      .then(() => runWithTenant(cfg.tenantId, () => this.process(cfg, convId, body)))
      .catch((err) => this.logger.error(`Falha ao processar mensagem do Chatwoot: ${err instanceof Error ? err.message : err}`))
      .finally(() => {
        if (this.queues.get(key) === job) this.queues.delete(key);
      });
    this.queues.set(key, job);
    this.lastJob = job;
    return { status: 'accepted' };
  }

  private async process(cfg: ChatwootConfig, chatwootConvId: number, body: ChatwootEvent) {
    const attachment = body.attachments?.[0];
    const text = (body.content ?? '').trim();
    const incoming =
      attachment?.file_type === 'audio'
        ? await this.inbound.fromAudio(cfg.tenantId, await this.chatwoot.download(cfg, attachment.data_url))
        : attachment?.file_type === 'image' || attachment?.file_type === 'file'
          ? text
            ? { text }
            : await this.inbound.fromImage(cfg.tenantId, await this.chatwoot.download(cfg, attachment.data_url))
          : text
            ? { text }
            : null;
    if (!incoming) return;

    const conv = await this.conversation.findOrCreateConversation('WEBCHAT', `cw:${cfg.accountId}:${chatwootConvId}`);
    if ('unreadable' in incoming) {
      await this.conversation.appendMessage(conv.id, 'CUSTOMER', incoming.marker);
      await this.conversation.appendMessage(conv.id, 'AGENT', incoming.unreadable);
      await this.chatwoot.reply(cfg, chatwootConvId, incoming.unreadable);
      return;
    }

    const before = new Date();
    const decision = await this.orchestrator.handleMessage(conv.id, incoming.text.slice(0, 2000));
    if (!decision) return;

    const replies = await this.db.client.message.findMany({
      where: { conversationId: conv.id, role: { in: ['AGENT', 'SYSTEM'] }, createdAt: { gte: before } },
      orderBy: { createdAt: 'asc' },
    });
    for (const r of replies) await this.chatwoot.reply(cfg, chatwootConvId, r.content);

    if (decision.outcome === 'HANDOFF') {
      const handoff = await this.db.client.handoff.findFirst({ where: { conversationId: conv.id }, orderBy: { createdAt: 'desc' } });
      await this.chatwoot.handoff(cfg, chatwootConvId, handoff?.department ?? null);
    }
  }
}
