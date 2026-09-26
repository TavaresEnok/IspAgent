import { Module } from '@nestjs/common';
import { WebchatController } from './webchat.controller';
import { WhatsAppController } from './whatsapp.controller';
import { ConversationModule } from '../conversation/conversation.module';
import { AgentModule } from '../agent/agent.module';
import { PulseISPModule } from '../integrations/pulseisp/pulseisp.module';
import { ERPModule } from '../integrations/erp/erp.module';
import { AiProviderModule } from '../integrations/ai/ai-provider.module';
import { WhatsAppCloudModule } from './whatsapp-cloud.client';
import { IncidentNotifierService } from './incident-notifier.service';

@Module({
  imports: [ConversationModule, AgentModule, PulseISPModule, ERPModule, AiProviderModule, WhatsAppCloudModule],
  controllers: [WebchatController, WhatsAppController],
  providers: [IncidentNotifierService],
})
export class ChannelsModule {}
