import { Module } from '@nestjs/common';
import { HandoffService } from './handoff.service';
import { HandoffController } from './handoff.controller';

@Module({
  controllers: [HandoffController],
  providers: [HandoffService],
  exports: [HandoffService],
})
export class HandoffModule {}
