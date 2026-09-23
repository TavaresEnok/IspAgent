import { Module } from '@nestjs/common';
import { WebchatController } from './webchat.controller';
import { WhatsAppController } from './whatsapp.controller';
import { ConversationModule } from '../conversation/conversation.module';
import { AgentModule } from '../agent/agent.module';
import { PulseISPModule } from '../integrations/pulseisp/pulseisp.module';
import { ERPModule } from '../integrations/erp/erp.module';

@Module({
  imports: [ConversationModule, AgentModule, PulseISPModule, ERPModule],
  controllers: [WebchatController, WhatsAppController],
})
export class ChannelsModule {}
