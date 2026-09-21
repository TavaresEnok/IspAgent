import { Module } from '@nestjs/common';
import { WebchatController } from './webchat.controller';
import { ConversationModule } from '../conversation/conversation.module';
import { AgentModule } from '../agent/agent.module';
import { PulseISPModule } from '../integrations/pulseisp/pulseisp.module';

@Module({
  imports: [ConversationModule, AgentModule, PulseISPModule],
  controllers: [WebchatController],
})
export class ChannelsModule {}
