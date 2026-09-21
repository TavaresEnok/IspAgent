import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import { ConversationModule } from '../conversation/conversation.module';

@Module({
  imports: [ConversationModule],
  controllers: [ConversationsController],
})
export class ConversationsModule {}
