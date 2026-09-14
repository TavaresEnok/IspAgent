import { Module } from '@nestjs/common';
import { AgentOrchestratorService } from './agent-orchestrator.service';
import { ClaimValidatorService } from './claim-validator.service';
import { ConversationModule } from '../conversation/conversation.module';
import { ToolsModule } from '../tools/tools.module';
import { PolicyModule } from '../policy/policy.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { AiProviderModule } from '../integrations/ai/ai-provider.module';
import { PulseISPModule } from '../integrations/pulseisp/pulseisp.module';

@Module({
  imports: [ConversationModule, ToolsModule, PolicyModule, KnowledgeModule, AiProviderModule, PulseISPModule],
  providers: [AgentOrchestratorService, ClaimValidatorService],
  exports: [AgentOrchestratorService, ClaimValidatorService],
})
export class AgentModule {}
