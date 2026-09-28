import {
  BadGatewayException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { currentTenantId, runWithTenant } from '../common/tenant-context';
import { PrismaService } from '../prisma/prisma.service';
import { EvolutionError } from './evolution.client';
import { WhatsAppChannelService } from './whatsapp-channel.service';
import { Incoming, WhatsAppInboundService } from './whatsapp-inbound.service';
import { TenantAccessService } from '../platform/tenant-access.service';

class CloudDto {
  @IsString() @MaxLength(30) phoneNumberId!: string;
  @IsOptional() @IsString() @MaxLength(600) accessToken?: string;
}

/**
 * Tela "WhatsApp" do painel: cada provedor conecta o SEU número — por QR Code (instância própria na
 * Evolution) ou pela API oficial. Só admin do provedor: muda o canal de atendimento de todos os clientes.
 */
@Controller('whatsapp-web')
export class WhatsAppWebController {
  constructor(
    private readonly channels: WhatsAppChannelService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('status')
  @Roles('TENANT_ADMIN')
  status() {
    return this.call(() => this.channels.view(currentTenantId() as string));
  }

  @Post('connect')
  @Roles('TENANT_ADMIN')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async connect(@Req() req: Request) {
    const tenantId = currentTenantId() as string;
    const { qr } = await this.call(() => this.channels.connectEvolution(tenantId));
    await this.audit(req, 'whatsapp.qr_connect_started');
    return { ...(await this.call(() => this.channels.view(tenantId))), qr };
  }

  // O QR muda a cada ~20 s; a tela consulta a cada poucos segundos enquanto espera a leitura.
  @Get('qr')
  @Roles('TENANT_ADMIN')
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  async qr() {
    return { qr: await this.call(() => this.channels.qr(currentTenantId() as string)) };
  }

  @Post('disconnect')
  @Roles('TENANT_ADMIN')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async disconnect(@Req() req: Request) {
    const tenantId = currentTenantId() as string;
    await this.call(() => this.channels.disconnect(tenantId));
    await this.audit(req, 'whatsapp.disconnected');
    return this.call(() => this.channels.view(tenantId));
  }

  @Put('cloud')
  @Roles('TENANT_ADMIN')
  async saveCloud(@Body() dto: CloudDto, @Req() req: Request) {
    const view = await this.channels.saveCloud(currentTenantId() as string, dto);
    await this.audit(req, 'whatsapp.cloud_configured');
    return view;
  }

  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof EvolutionError) throw new BadGatewayException(err.message);
      throw err;
    }
  }

  private audit(req: Request, action: string) {
    const tenantId = currentTenantId() as string;
    return this.prisma.auditLog.create({
      data: { tenantId, actorType: 'USER', actorId: req.user!.userId, action, entityType: 'Tenant', entityId: tenantId, metadata: {} },
    });
  }
}

interface EvolutionMessage {
  key?: { remoteJid?: string; fromMe?: boolean; id?: string; senderPn?: string; remoteJidAlt?: string; participant?: string };
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    imageMessage?: { caption?: string; mimetype?: string };
    documentMessage?: { caption?: string; mimetype?: string };
    audioMessage?: { mimetype?: string };
    buttonsResponseMessage?: { selectedDisplayText?: string };
    listResponseMessage?: { title?: string };
    base64?: string;
  };
}

interface EvolutionEvent {
  event?: string;
  instance?: string;
  data?: EvolutionMessage;
}

/** Evolution pode repetir um evento: a mesma mensagem não pode gerar duas respostas. */
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

/** Número de quem mandou: `...@s.whatsapp.net`, ou o número real informado junto de um id anônimo (`@lid`). */
export function evolutionSender(key: EvolutionMessage['key']): string | null {
  const jids = [key?.remoteJid, key?.senderPn, key?.remoteJidAlt].filter(Boolean) as string[];
  if (jids.some((j) => j.endsWith('@g.us') || j.endsWith('@broadcast') || j.endsWith('@newsletter'))) return null;
  const pn = jids.find((j) => /@s\.whatsapp\.net$|@c\.us$/.test(j));
  const digits = pn ? pn.split('@')[0].replace(/\D/g, '') : '';
  return /^\d{10,15}$/.test(digits) ? digits : null;
}

/**
 * Mensagens dos números conectados por QR Code. O provedor é descoberto pela instância + segredo do
 * caminho (gerado por provedor, comparado em tempo constante) — nunca pelo corpo. Responde na hora e
 * processa em seguida, em ordem por cliente.
 */
@Controller('public/evolution')
export class EvolutionWebhookController {
  private readonly logger = new Logger(EvolutionWebhookController.name);
  private readonly queues = new Map<string, Promise<void>>();
  /** Último processamento agendado (os testes esperam por ele). */
  lastJob: Promise<void> = Promise.resolve();

  constructor(
    private readonly channels: WhatsAppChannelService,
    private readonly inbound: WhatsAppInboundService,
    private readonly access: TenantAccessService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Post('webhook/:instance/:secret')
  @HttpCode(HttpStatus.OK)
  async webhook(@Param('instance') instance: string, @Param('secret') secret: string, @Body() body: EvolutionEvent) {
    const tenantId = await this.channels.tenantForEvolution(instance, secret);
    if (!tenantId) throw new NotFoundException();
    if (!(await this.access.isActive(tenantId))) return { status: 'ignored' };

    const msg = body?.data;
    if (body?.event !== 'messages.upsert' || !msg?.key || msg.key.fromMe) return { status: 'ignored' };
    const phone = evolutionSender(msg.key);
    if (!phone) return { status: 'ignored' };
    if (msg.key.id && !firstTime(`${instance}:${msg.key.id}`)) return { status: 'duplicate' };

    const key = `${tenantId}:${phone}`;
    const job = (this.queues.get(key) ?? Promise.resolve())
      .then(() => runWithTenant(tenantId, async () => this.inbound.process(phone, await this.toIncoming(tenantId, msg))))
      .catch((err) => this.logger.error(`Falha ao processar mensagem da Evolution: ${err instanceof Error ? err.message : err}`))
      .finally(() => {
        if (this.queues.get(key) === job) this.queues.delete(key);
      });
    this.queues.set(key, job);
    this.lastJob = job;
    return { status: 'accepted' };
  }

  private async toIncoming(tenantId: string, msg: EvolutionMessage): Promise<Incoming> {
    const m = msg.message ?? {};
    const text =
      m.conversation ?? m.extendedTextMessage?.text ?? m.buttonsResponseMessage?.selectedDisplayText ?? m.listResponseMessage?.title;
    if (text) return { text };
    // Mídia vem embutida no evento (base64); acima de ~6 MB não é processada — o cliente é orientado a escrever.
    const raw = m.base64 && m.base64.length <= 8_500_000 ? m.base64.replace(/^data:[^;]+;base64,/, '') : null;
    const media = raw ? { base64: raw, mimeType: '' } : null;
    if (m.audioMessage) {
      return this.inbound.fromAudio(tenantId, media && { ...media, mimeType: (m.audioMessage.mimetype ?? 'audio/ogg').split(';')[0] });
    }
    if (m.imageMessage || m.documentMessage) {
      const caption = (m.imageMessage?.caption ?? m.documentMessage?.caption ?? '').trim();
      if (caption) return { text: caption };
      const mime = (m.imageMessage?.mimetype ?? m.documentMessage?.mimetype ?? 'image/jpeg').split(';')[0];
      return this.inbound.fromImage(tenantId, media && { ...media, mimeType: mime });
    }
    return null;
  }
}
