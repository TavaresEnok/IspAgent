import {
  BadGatewayException,
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
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../common/decorators/roles.decorator';
import { currentTenantId, runWithTenant } from '../common/tenant-context';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppInboundService } from './whatsapp-inbound.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { WahaClient, WahaError } from './waha.client';

/**
 * Tela "WhatsApp" do painel: o provedor conecta o número lendo o QR Code AQUI, sem abrir o WAHA. Só admin
 * do tenant — conectar/desconectar muda o canal de atendimento de todos os clientes.
 */
@Controller('whatsapp-web')
export class WahaController {
  constructor(
    private readonly waha: WahaClient,
    private readonly db: TenantPrismaService,
  ) {}

  @Get('status')
  @Roles('TENANT_ADMIN', 'SUPER_ADMIN')
  async status() {
    if (!this.waha.isAvailableFor(currentTenantId() as string)) return { configured: false };
    return { configured: true, ...(await this.call(() => this.waha.status())) };
  }

  @Post('connect')
  @Roles('TENANT_ADMIN', 'SUPER_ADMIN')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async connect(@Req() req: Request) {
    this.assertAvailable();
    await this.call(() => this.waha.start());
    await this.audit(req, 'whatsapp_web.connect_started');
    return this.call(() => this.waha.status());
  }

  // O QR muda a cada ~20 s; a tela consulta a cada poucos segundos enquanto espera a leitura.
  @Get('qr')
  @Roles('TENANT_ADMIN', 'SUPER_ADMIN')
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  async qr() {
    this.assertAvailable();
    return this.call(() => this.waha.qr());
  }

  @Post('disconnect')
  @Roles('TENANT_ADMIN', 'SUPER_ADMIN')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async disconnect(@Req() req: Request) {
    this.assertAvailable();
    await this.call(() => this.waha.logout());
    await this.audit(req, 'whatsapp_web.disconnected');
    return this.call(() => this.waha.status());
  }

  private assertAvailable() {
    if (!this.waha.isAvailableFor(currentTenantId() as string)) {
      throw new NotFoundException('WhatsApp por QR Code não está habilitado para este provedor.');
    }
  }

  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof WahaError) throw new BadGatewayException(err.message);
      throw err;
    }
  }

  private audit(req: Request, action: string) {
    const tenantId = currentTenantId() as string;
    return this.db.client.auditLog.create({
      data: {
        tenantId,
        actorType: 'USER',
        actorId: req.user!.userId,
        action,
        entityType: 'Tenant',
        entityId: tenantId,
        metadata: {},
      },
    });
  }
}

/** `X-Webhook-Hmac`: HMAC-SHA512 (hex) do corpo BRUTO com o segredo configurado na sessão do WAHA. */
export function isValidWahaSignature(rawBody: Buffer | undefined, header: string | undefined): boolean {
  const secret = (process.env.ISPAGENT_WAHA_WEBHOOK_SECRET ?? '').trim();
  if (!secret || !rawBody || !header || !/^[0-9a-f]{128}$/i.test(header)) return false;
  const expected = Buffer.from(createHmac('sha512', secret).update(rawBody).digest('hex'));
  const actual = Buffer.from(header.toLowerCase());
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

interface WahaMessageEvent {
  event?: string;
  session?: string;
  payload?: {
    id?: string;
    from?: string;
    fromMe?: boolean;
    body?: string;
    hasMedia?: boolean;
    media?: { url?: string; mimetype?: string } | null;
  };
}

/** O WAHA tenta de novo quando demora: a mesma mensagem não pode gerar duas respostas. */
const SEEN_TTL_MS = 10 * 60_000;
const seen = new Map<string, number>();
function firstTime(id: string): boolean {
  const now = Date.now();
  for (const [k, at] of seen) if (now - at > SEEN_TTL_MS) seen.delete(k);
  if (seen.has(id)) return false;
  if (seen.size > 5000) seen.clear();
  seen.set(id, now);
  return true;
}

/**
 * Mensagens do número conectado por QR Code (WAHA). Só aceita o que vier assinado com o segredo da
 * sessão (`X-Webhook-Hmac`) — sem isso qualquer um "mandaria mensagem" como um cliente e veria a fatura
 * dele. O tenant vem da configuração do servidor (`ISPAGENT_WAHA_TENANT_ID`), nunca do corpo.
 */
@Controller('public/waha')
export class WahaWebhookController {
  private readonly logger = new Logger(WahaWebhookController.name);

  constructor(
    private readonly waha: WahaClient,
    private readonly prisma: PrismaService,
    private readonly inbound: WhatsAppInboundService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: WahaMessageEvent,
    @Headers('x-webhook-hmac') signature?: string,
  ) {
    const tenantId = this.waha.tenantId;
    if (!tenantId || !this.waha.isAvailableFor(tenantId)) throw new NotFoundException();
    if (!isValidWahaSignature(req.rawBody, signature)) throw new ForbiddenException('Assinatura inválida.');

    const msg = body?.payload;
    if (body?.event !== 'message' || body.session !== this.waha.session || !msg?.from || msg.fromMe) {
      return { status: 'ignored' };
    }
    if (msg.id && !firstTime(msg.id)) return { status: 'duplicate' };
    if (!(await this.prisma.tenant.findUnique({ where: { id: tenantId } }))) return { status: 'ignored' };

    const phone = await this.waha.resolvePhone(msg.from);
    if (!phone || !/^\d{10,15}$/.test(phone)) {
      this.logger.warn('Mensagem do WAHA sem número identificável (grupo, status ou contato anônimo) — ignorada.');
      return { status: 'ignored' };
    }

    try {
      await runWithTenant(tenantId, async () => {
        const mime = (msg.media?.mimetype ?? '').toLowerCase();
        const media = msg.hasMedia ? await this.waha.downloadMedia(msg.media?.url) : null;
        const incoming = !msg.hasMedia
          ? { text: msg.body ?? '' }
          : mime.startsWith('audio/')
            ? await this.inbound.fromAudio(tenantId, media)
            : mime.startsWith('image/') || mime === 'application/pdf'
              ? await this.inbound.fromImage(tenantId, media)
              : msg.body?.trim()
                ? { text: msg.body }
                : null;
        await this.inbound.process(phone, incoming);
      });
    } catch (err) {
      this.logger.error(`Falha ao processar mensagem do WAHA: ${err instanceof Error ? err.message : err}`);
    }
    return { status: 'received' };
  }
}
