import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import { ConversationModule } from '../conversation/conversation.module';
import { WhatsAppCloudModule } from '../channels/whatsapp-cloud.client';

@Module({
  imports: [ConversationModule, WhatsAppCloudModule],
  controllers: [ConversationsController],
})
export class ConversationsModule {}
