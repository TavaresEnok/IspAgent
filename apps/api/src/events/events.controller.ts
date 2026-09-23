import { Controller, Get, Query, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { RealtimeEventsService } from './events.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('events')
export class RealtimeEventsController {
  constructor(private readonly events: RealtimeEventsService) {}

  /**
   * Endpoint de Server-Sent Events (SSE) para atualização em tempo real do painel de atendimento humano.
   * Transmite novos transbordos (handoffs), mensagens e atualizações de status.
   */
  @Public()
  @Sse('stream')
  streamEvents(@Query('tenantId') queryTenantId?: string): Observable<any> {
    const tenantId = queryTenantId || process.env.DEFAULT_TENANT_ID || 'tnt_vibe';
    return this.events.streamForTenant(tenantId);
  }
}
