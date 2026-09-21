import { Module } from '@nestjs/common';
import { WebchatController } from './webchat.controller';
import { ConversationModule } from '../conversation/conversation.module';
import { AgentModule } from '../agent/agent.module';

@Module({
  imports: [ConversationModule, AgentModule],
  controllers: [WebchatController],
})
export class ChannelsModule {}
