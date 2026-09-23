import { Global, Module } from '@nestjs/common';
import { RealtimeEventsService } from './events.service';
import { RealtimeEventsController } from './events.controller';

@Global()
@Module({
  controllers: [RealtimeEventsController],
  providers: [RealtimeEventsService],
  exports: [RealtimeEventsService],
})
export class EventsModule {}
