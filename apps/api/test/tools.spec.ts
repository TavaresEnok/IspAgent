import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { PolicyEngineService } from '../src/policy/policy-engine.service';
import { ToolExecutorService } from '../src/tools/tool-executor.service';
import { runWithTenant } from '../src/common/tenant-context';
import { createTestAgentRun } from './helpers/agent-run';
import { makeLookupTool, makeCreateTicketTool, makeUnlockTool } from './helpers/fixture-tools';

/**
 * Pipeline de execução de ferramentas (seção 4): Schema Validation → Policy Engine → Confirmation →
 * Execução → ToolResult → Audit Log. Cada etapa é testada isoladamente, incluindo a prova de P0.6
 * (ação bloqueada pela policy NUNCA chega a executar — espião no adapter com zero chamadas).
 */
describe('tool executor pipeline', () => {
  let prisma: PrismaService;
  let db: TenantPrismaService;
  let executor: ToolExecutorService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    db = new TenantPrismaService(prisma);
    executor = new ToolExecutorService(db, new PolicyEngineService(db));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('entrada inválida nunca chega a executar a ferramenta (INVALID_INPUT)', async () => {
    const { def, execute } = makeLookupTool();

    const result = await runWithTenant('tnt_demo_alpha', async () => {
      const agentRunId = await createTestAgentRun(db, `+55${randomUUID().replace(/\D/g, '').slice(0, 10)}`);
      return executor.run(def, { id: '' }, { agentRunId });
    });

    expect(result.status).toBe('INVALID_INPUT');
    expect(execute).not.toHaveBeenCalled();
  });

  it('ferramenta permitida executa de fato e persiste ToolCall + AuditLog', async () => {
    const { def, execute } = makeLookupTool();

    const { result, agentRunId } = await runWithTenant('tnt_demo_alpha', async () => {
      const agentRunId = await createTestAgentRun(db, `+55${randomUUID().replace(/\D/g, '').slice(0, 10)}`);
      const result = await executor.run(def, { id: 'cus_demo_a' }, { agentRunId });
      return { result, agentRunId };
    });

    expect(result.status).toBe('OK');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.data).toEqual({ id: 'cus_demo_a', name: 'Cliente cus_demo_a' });
    expect(result.facts.length).toBeGreaterThan(0);

    const storedCall = await runWithTenant('tnt_demo_alpha', () =>
      db.client.toolCall.findUnique({ where: { id: result.toolCallId } }),
    );
    expect(storedCall?.tool).toBe('TestLookupTool');
    expect(storedCall?.status).toBe('OK');
    expect(storedCall?.agentRunId).toBe(agentRunId);

    const auditEntries = await runWithTenant('tnt_demo_alpha', () =>
      db.client.auditLog.findMany({ where: { entityId: result.toolCallId } }),
    );
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0].action).toBe('tool.TestLookupTool');
  });

  it('P0.6 — ação bloqueada pela policy nunca executa a ferramenta (zero chamadas ao adapter)', async () => {
    // account.unlock é bloqueado por padrão no seed (canPerformUnlock=false).
    const { def, execute } = makeUnlockTool();

    const result = await runWithTenant('tnt_demo_alpha', async () => {
      const agentRunId = await createTestAgentRun(db, `+55${randomUUID().replace(/\D/g, '').slice(0, 10)}`);
      return executor.run(def, { contractId: 'ctt_demo_a' }, { agentRunId });
    });

    expect(result.status).toBe('BLOCKED_BY_POLICY');
    expect(execute).not.toHaveBeenCalled();
  });

  it('ação WRITE_SENSITIVE habilitada exige confirmação antes de executar', async () => {
    const { def, execute } = makeUnlockTool();

    await runWithTenant('tnt_demo_alpha', () =>
      db.client.tenantPolicyConfig.update({
        where: { tenantId: 'tnt_demo_alpha' },
        data: { canPerformUnlock: true },
      }),
    );

    try {
      const { withoutConfirm, withConfirm } = await runWithTenant('tnt_demo_alpha', async () => {
        const agentRunId = await createTestAgentRun(db, `+55${randomUUID().replace(/\D/g, '').slice(0, 10)}`);

        const withoutConfirm = await executor.run(def, { contractId: 'ctt_demo_a' }, { agentRunId });
        const withConfirm = await executor.run(
          def,
          { contractId: 'ctt_demo_a' },
          { agentRunId, confirmed: true },
        );
        return { withoutConfirm, withConfirm };
      });

      expect(withoutConfirm.status).toBe('NEEDS_CONFIRMATION');
      expect(withConfirm.status).toBe('OK');
      expect(execute).toHaveBeenCalledTimes(1); // só a chamada confirmada executou de fato
    } finally {
      await runWithTenant('tnt_demo_alpha', () =>
        db.client.tenantPolicyConfig.update({
          where: { tenantId: 'tnt_demo_alpha' },
          data: { canPerformUnlock: false },
        }),
      );
    }
  });

  it('WRITE_LOW_RISK habilitado executa automaticamente, sem exigir confirmação', async () => {
    const { def, execute } = makeCreateTicketTool();

    const result = await runWithTenant('tnt_demo_alpha', async () => {
      const agentRunId = await createTestAgentRun(db, `+55${randomUUID().replace(/\D/g, '').slice(0, 10)}`);
      return executor.run(def, { description: 'sem conexão' }, { agentRunId });
    });

    expect(result.status).toBe('OK');
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
