import { Module } from '@nestjs/common';
import { IntegrationsStatusController } from './integrations-status.controller';

@Module({
  controllers: [IntegrationsStatusController],
})
export class IntegrationsStatusModule {}
