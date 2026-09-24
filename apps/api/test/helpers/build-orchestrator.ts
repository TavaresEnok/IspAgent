import { PrismaService } from '../../src/prisma/prisma.service';
import { TenantPrismaService } from '../../src/prisma/tenant-prisma.service';
import { PolicyEngineService } from '../../src/policy/policy-engine.service';
import { ToolExecutorService } from '../../src/tools/tool-executor.service';
import { MockERPAdapter } from '../../src/integrations/erp/mock-erp.adapter';
import { ErpToolsService } from '../../src/tools/erp-tools.service';
import { MockPulseISPAdapter } from '../../src/integrations/pulseisp/mock-pulseisp.adapter';
import { HandoffService } from '../../src/handoff/handoff.service';
import { KnowledgeService } from '../../src/knowledge/knowledge.service';
import { MockAIProvider } from '../../src/integrations/ai/mock-ai.provider';
import { ConversationService } from '../../src/conversation/conversation.service';
import { IdentityResolutionService } from '../../src/identity/identity-resolution.service';
import { AgentOrchestratorService } from '../../src/agent/agent-orchestrator.service';
import { AIProvider } from '../../src/integrations/ai/ai-provider.interface';
import { fixedAiResolver } from './ai-resolver';

/** Monta o orquestrador com dependências reais (banco `_test`) e um AI provider fixo (Mock por padrão). */
export async function buildOrchestrator(ai: AIProvider = new MockAIProvider()) {
  const prisma = new PrismaService();
  await prisma.$connect();
  const db = new TenantPrismaService(prisma);

  const policy = new PolicyEngineService(db);
  const executor = new ToolExecutorService(db, policy);
  const erpTools = new ErpToolsService(new MockERPAdapter(db));
  const knowledge = new KnowledgeService(db);
  const identity = new IdentityResolutionService(db);
  const conversation = new ConversationService(db, identity);
  const handoff = new HandoffService(db);
  const pulseisp = new MockPulseISPAdapter(db);

  const orchestrator = new AgentOrchestratorService(
    db,
    conversation,
    executor,
    policy,
    erpTools,
    knowledge,
    fixedAiResolver(ai),
    pulseisp,
    handoff,
    undefined, // PulseIspClient (fallback de identificação pelo PulseISP)
    undefined, // PulseIspMirrorService
    identity,
  );

  return { prisma, db, policy, executor, conversation, handoff, identity, orchestrator };
}
