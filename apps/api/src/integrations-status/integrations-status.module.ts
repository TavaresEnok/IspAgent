import { Module } from '@nestjs/common';
import { IntegrationsStatusController } from './integrations-status.controller';
import { AiProviderModule } from '../integrations/ai/ai-provider.module';
import { ERPModule } from '../integrations/erp/erp.module';

@Module({
  imports: [AiProviderModule, ERPModule],
  controllers: [IntegrationsStatusController],
})
export class IntegrationsStatusModule {}
