import { Injectable, Logger } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';

export interface AppRealtimeEvent {
  tenantId: string;
  type: 'NEW_HANDOFF' | 'NEW_MESSAGE' | 'STATUS_CHANGED' | 'NEW_SURVEY' | 'NEW_LEAD';
  data: any;
}

@Injectable()
export class RealtimeEventsService {
  private readonly logger = new Logger(RealtimeEventsService.name);
  private readonly subject = new Subject<AppRealtimeEvent>();

  emit(event: AppRealtimeEvent) {
    this.logger.debug(`Evento emitido [${event.type}] para tenant ${event.tenantId}`);
    this.subject.next(event);
  }

  streamForTenant(tenantId: string): Observable<{ data: any }> {
    return this.subject.asObservable().pipe(
      // Evento sem tenant não vai para ninguém (fail-closed).
      filter((e) => Boolean(e.tenantId) && e.tenantId === tenantId),
      map((e) => ({
        data: {
          type: e.type,
          payload: e.data,
          timestamp: new Date().toISOString(),
        },
      })),
    );
  }

  /** Mensagens e mudanças de status de uma conversa — é o que o Web Chat do cliente pode ver. */
  streamForConversation(tenantId: string, conversationId: string): Observable<{ data: unknown }> {
    return this.subject.asObservable().pipe(
      filter(
        (e) =>
          e.tenantId === tenantId &&
          (e.type === 'NEW_MESSAGE' || e.type === 'STATUS_CHANGED') &&
          e.data?.conversationId === conversationId,
      ),
      map((e) => {
        // Stream público: de uma mudança de status só vai o status, nunca dados internos (ex.: id do atendente).
        const payload = e.type === 'STATUS_CHANGED' ? { conversationId, status: e.data?.status } : e.data;
        return { data: { type: e.type, payload, timestamp: new Date().toISOString() } };
      }),
    );
  }
}
