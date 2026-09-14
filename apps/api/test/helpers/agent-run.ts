import { TenantPrismaService } from '../../src/prisma/tenant-prisma.service';
import { currentTenantId } from '../../src/common/tenant-context';

/**
 * `ToolCall.agentRunId` é obrigatório no schema (toda ferramenta é chamada dentro de um turno do
 * agente). A Fase 4 testa o pipeline de ferramentas isoladamente, antes do Agent Orchestrator (Fase 6)
 * existir — este helper cria o `Conversation`/`AgentRun` mínimo necessário para satisfazer a FK sem
 * inventar um orquestrador inteiro só para o teste.
 */
export async function createTestAgentRun(db: TenantPrismaService, channelUserId: string): Promise<string> {
  const tenantId = currentTenantId();
  if (!tenantId) throw new Error('createTestAgentRun requer contexto de tenant ativo');

  const conversation = await db.client.conversation.create({
    data: { tenantId, channel: 'WEBCHAT', channelUserId, status: 'AI_ACTIVE' },
  });

  const agentRun = await db.client.agentRun.create({
    data: {
      tenantId,
      conversationId: conversation.id,
      intent: 'OUTRO',
      intentConfidence: 'LOW',
      promptVersion: 'test-fixture-v0',
      model: 'test-fixture',
      mode: 'DEMO',
    },
  });

  return agentRun.id;
}
