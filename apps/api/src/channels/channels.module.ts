import { Module } from '@nestjs/common';
import { WebchatController } from './webchat.controller';
import { WhatsAppBroadcastController, WhatsAppController } from './whatsapp.controller';
import { ConversationModule } from '../conversation/conversation.module';
import { AgentModule } from '../agent/agent.module';
import { PulseISPModule } from '../integrations/pulseisp/pulseisp.module';
import { ERPModule } from '../integrations/erp/erp.module';
import { AiProviderModule } from '../integrations/ai/ai-provider.module';

@Module({
  imports: [ConversationModule, AgentModule, PulseISPModule, ERPModule, AiProviderModule],
  controllers: [WebchatController, WhatsAppController, WhatsAppBroadcastController],
})
export class ChannelsModule {}
