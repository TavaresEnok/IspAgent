import { Module } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports: [IdentityModule],
  providers: [ConversationService],
  exports: [ConversationService],
})
export class ConversationModule {}
