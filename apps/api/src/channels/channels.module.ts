import { Module } from '@nestjs/common';
import { WebchatController } from './webchat.controller';
import { WhatsAppBroadcastController, WhatsAppController } from './whatsapp.controller';
import { ConversationModule } from '../conversation/conversation.module';
import { AgentModule } from '../agent/agent.module';
import { PulseISPModule } from '../integrations/pulseisp/pulseisp.module';
import { ERPModule } from '../integrations/erp/erp.module';
import { AiProviderModule } from '../integrations/ai/ai-provider.module';
import { WhatsAppCloudModule } from './whatsapp-cloud.client';
import { IncidentNotifierService } from './incident-notifier.service';
import { EvolutionWebhookController, WhatsAppWebController } from './whatsapp-web.controller';
import { WhatsAppInboundService } from './whatsapp-inbound.service';
import { ChatwootClient, ChatwootConnectionController, ChatwootConnectionService, ChatwootWebhookController } from './chatwoot';

@Module({
  imports: [ConversationModule, AgentModule, PulseISPModule, ERPModule, AiProviderModule, WhatsAppCloudModule],
  controllers: [WebchatController, WhatsAppController, WhatsAppBroadcastController, WhatsAppWebController, EvolutionWebhookController, ChatwootWebhookController, ChatwootConnectionController],
  providers: [IncidentNotifierService, WhatsAppInboundService, ChatwootClient, ChatwootConnectionService],
})
export class ChannelsModule {}
