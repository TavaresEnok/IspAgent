import { Module } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { ConversationLifecycleService } from './conversation-lifecycle.service';
import { IdentityModule } from '../identity/identity.module';
import { WhatsAppCloudModule } from '../channels/whatsapp-cloud.client';

@Module({
  imports: [IdentityModule, WhatsAppCloudModule],
  providers: [ConversationService, ConversationLifecycleService],
  exports: [ConversationService],
})
export class ConversationModule {}
