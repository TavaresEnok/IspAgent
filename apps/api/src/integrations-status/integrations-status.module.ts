import { Module } from '@nestjs/common';
import { IntegrationsStatusController } from './integrations-status.controller';
import { AiProviderModule } from '../integrations/ai/ai-provider.module';

@Module({
  imports: [AiProviderModule],
  controllers: [IntegrationsStatusController],
})
export class IntegrationsStatusModule {}
