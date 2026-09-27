import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { timingSafeEqual } from 'node:crypto';
import { Public } from '../common/decorators/public.decorator';
import { runWithTenant } from '../common/tenant-context';
import { AgentOrchestratorService } from '../agent/agent-orchestrator.service';
import { ConversationService } from '../conversation/conversation.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
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

function config() {
  return {
    baseUrl: (process.env.ISPAGENT_CHATWOOT_URL ?? '').trim().replace(/\/+$/, ''),
    accountId: (process.env.ISPAGENT_CHATWOOT_ACCOUNT_ID ?? '').trim(),
    botToken: (process.env.ISPAGENT_CHATWOOT_BOT_TOKEN ?? '').trim(),
    tenantId: (process.env.ISPAGENT_CHATWOOT_TENANT_ID ?? '').trim(),
    webhookToken: (process.env.ISPAGENT_CHATWOOT_WEBHOOK_TOKEN ?? '').trim(),
    publicUrl: (process.env.ISPAGENT_CHATWOOT_PUBLIC_URL ?? '').trim().replace(/\/+$/, ''),
    widgetToken: (process.env.ISPAGENT_CHATWOOT_WIDGET_TOKEN ?? '').trim(),
  };
}

export function chatwootEnabled(): boolean {
  const c = config();
  return Boolean(c.baseUrl && c.accountId && c.botToken && c.tenantId && c.webhookToken.length >= 32);
}

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** API do Chatwoot com o token do Agent Bot (só o que um bot pode fazer: responder e transferir). */
@Injectable()
export class ChatwootClient {
  private readonly logger = new Logger(ChatwootClient.name);
  fetchImpl: typeof fetch = (...args) => fetch(...args);

  private async call(method: 'POST', path: string, body: unknown): Promise<boolean> {
    const { baseUrl, accountId, botToken } = config();
    try {
      const res = await this.fetchImpl(`${baseUrl}/api/v1/accounts/${accountId}${path}`, {
        method,
        headers: { api_access_token: botToken, 'Content-Type': 'application/json' },
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

  reply(conversationId: number, content: string) {
    return this.call('POST', `/conversations/${conversationId}/messages`, { content, message_type: 'outgoing', private: false });
  }

  /** Transferência: sai da fila do bot (`pending`) para a fila dos atendentes (`open`), com o setor. */
  async handoff(conversationId: number, department: string | null) {
    await this.call('POST', `/conversations/${conversationId}/toggle_status`, { status: 'open' });
    const label = department ? DEPARTMENT_LABEL[department] : null;
    if (label) await this.call('POST', `/conversations/${conversationId}/labels`, { labels: [label] });
  }

  /** Anexo de áudio/imagem: só do próprio Chatwoot (caminho do Active Storage), nunca a URL crua do webhook. */
  async download(url: string | undefined): Promise<{ base64: string; mimeType: string } | null> {
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
      const res = await this.fetchImpl(`${config().baseUrl}${path}`, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0 || buf.length > MAX_MEDIA_BYTES) return null;
      return { base64: buf.toString('base64'), mimeType: (res.headers.get('content-type') ?? 'application/octet-stream').split(';')[0] };
    } catch {
      return null;
    }
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
 * Webhook do Agent Bot do Chatwoot. O Chatwoot não assina as chamadas do bot, então a autenticação é o
 * token secreto no caminho (≥ 32 caracteres, comparado em tempo constante) + a conta configurada. O tenant
 * vem da configuração do servidor, nunca do corpo.
 *
 * O bot só responde conversas em `pending` (fila do bot). Depois da transferência a conversa fica `open`
 * e é do atendente: o ISPAgent não fala por cima dele.
 */
@Controller('public/chatwoot')
export class ChatwootWebhookController {
  private readonly logger = new Logger(ChatwootWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly db: TenantPrismaService,
    private readonly conversation: ConversationService,
    private readonly orchestrator: AgentOrchestratorService,
    private readonly inbound: WhatsAppInboundService,
    private readonly chatwoot: ChatwootClient,
  ) {}

  /** Para a página de teste do widget: endereço público e token do site (públicos por natureza). */
  @Public()
  @Get('widget-config')
  widgetConfig() {
    const { publicUrl, widgetToken } = config();
    if (!chatwootEnabled() || !publicUrl || !widgetToken) throw new NotFoundException();
    return { baseUrl: publicUrl, websiteToken: widgetToken };
  }

  @Public()
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @Post('webhook/:token')
  @HttpCode(HttpStatus.OK)
  async webhook(@Param('token') token: string, @Body() body: ChatwootEvent) {
    const c = config();
    if (!chatwootEnabled() || !sameSecret(token, c.webhookToken)) throw new NotFoundException();
    if (String(body?.account?.id ?? '') !== c.accountId) return { status: 'ignored' };

    const convId = Number(body?.conversation?.id);
    const isCustomerMessage = body?.event === 'message_created' && body.message_type === 'incoming' && !body.private;
    if (!isCustomerMessage || !Number.isInteger(convId) || body.conversation?.status !== 'pending') {
      return { status: 'ignored' };
    }
    if (!(await this.prisma.tenant.findUnique({ where: { id: c.tenantId } }))) return { status: 'ignored' };

    try {
      await runWithTenant(c.tenantId, () => this.process(c.tenantId, convId, body));
    } catch (err) {
      this.logger.error(`Falha ao processar mensagem do Chatwoot: ${err instanceof Error ? err.message : err}`);
    }
    return { status: 'received' };
  }

  private async process(tenantId: string, chatwootConvId: number, body: ChatwootEvent) {
    const attachment = body.attachments?.[0];
    const text = (body.content ?? '').trim();
    const incoming =
      attachment?.file_type === 'audio'
        ? await this.inbound.fromAudio(tenantId, await this.chatwoot.download(attachment.data_url))
        : attachment?.file_type === 'image' || attachment?.file_type === 'file'
          ? text
            ? { text }
            : await this.inbound.fromImage(tenantId, await this.chatwoot.download(attachment.data_url))
          : text
            ? { text }
            : null;
    if (!incoming) return;

    const conv = await this.conversation.findOrCreateConversation('WEBCHAT', `cw:${config().accountId}:${chatwootConvId}`);
    if ('unreadable' in incoming) {
      await this.conversation.appendMessage(conv.id, 'CUSTOMER', incoming.marker);
      await this.conversation.appendMessage(conv.id, 'AGENT', incoming.unreadable);
      await this.chatwoot.reply(chatwootConvId, incoming.unreadable);
      return;
    }

    const before = new Date();
    const decision = await this.orchestrator.handleMessage(conv.id, incoming.text.slice(0, 2000));
    if (!decision) return;

    const replies = await this.db.client.message.findMany({
      where: { conversationId: conv.id, role: { in: ['AGENT', 'SYSTEM'] }, createdAt: { gte: before } },
      orderBy: { createdAt: 'asc' },
    });
    for (const r of replies) await this.chatwoot.reply(chatwootConvId, r.content);

    if (decision.outcome === 'HANDOFF') {
      const handoff = await this.db.client.handoff.findFirst({ where: { conversationId: conv.id }, orderBy: { createdAt: 'desc' } });
      await this.chatwoot.handoff(chatwootConvId, handoff?.department ?? null);
    }
  }
}
