import { Controller, Get, Post, Query, Req, Sse, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Observable } from 'rxjs';
import { RealtimeEventsService } from './events.service';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';

const TICKET_TTL_MS = 60_000;

function sign(payload: string): string {
  const secret = process.env.ISPAGENT_JWT_SECRET;
  if (!secret) throw new Error('[events] ISPAGENT_JWT_SECRET não definida.');
  return createHmac('sha256', secret).update(`sse|${payload}`).digest('base64url');
}

/** Ticket `tenantId.expiraEm.hmac`: só abre o stream do tenant de quem o pediu logado, e só por 60 s. */
function verifyTicket(ticket: string | undefined): string | null {
  const [tenantId, exp, mac] = (ticket ?? '').split('.');
  if (!tenantId || !exp || !mac || Number(exp) < Date.now()) return null;
  const expected = Buffer.from(sign(`${tenantId}.${exp}`));
  const actual = Buffer.from(mac);
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? tenantId : null;
}

/**
 * Server-Sent Events do painel (novos transbordos, mensagens, status). O `EventSource` do navegador não
 * envia `Authorization`, então o painel pede um ticket curto LOGADO (`POST /events/ticket`) e abre o
 * stream com ele — nunca por um `tenantId` na URL (isso expunha as conversas de qualquer provedor).
 */
@Controller('events')
export class RealtimeEventsController {
  constructor(private readonly events: RealtimeEventsService) {}

  @Post('ticket')
  @Roles('ANALYST')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  ticket(@Req() req: Request) {
    const tenantId = req.user!.tenantId;
    const exp = Date.now() + TICKET_TTL_MS;
    return { ticket: `${tenantId}.${exp}.${sign(`${tenantId}.${exp}`)}`, expiresInMs: TICKET_TTL_MS };
  }

  @Public()
  @Sse('stream')
  streamEvents(@Query('ticket') ticket?: string): Observable<{ data: unknown }> {
    const tenantId = verifyTicket(ticket);
    if (!tenantId) throw new UnauthorizedException('Ticket de eventos inválido ou expirado.');
    return this.events.streamForTenant(tenantId);
  }
}
