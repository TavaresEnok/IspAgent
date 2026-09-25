import { Controller, Req, Sse } from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { RealtimeEventsService } from './events.service';

@Controller('events')
export class RealtimeEventsController {
  constructor(private readonly events: RealtimeEventsService) {}

  /** Stream do painel (fila humana, mensagens novas). Tenant vem do login, token via ?access_token=. */
  @Sse('stream')
  streamEvents(@Req() req: Request): Observable<{ data: unknown }> {
    return this.events.streamForTenant(req.user!.tenantId);
  }
}
