import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { PolicyEngineService } from '../src/policy/policy-engine.service';
import { ToolExecutorService } from '../src/tools/tool-executor.service';
import { runWithTenant } from '../src/common/tenant-context';
import { createTestAgentRun } from './helpers/agent-run';
import { makeCreateTicketTool } from './helpers/fixture-tools';

/**
 * Princípio 1.7 — idempotência em toda escrita: retry com a mesma idempotencyKey nunca duplica efeito.
 */
describe('tool idempotency', () => {
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

  it('retry com a mesma idempotencyKey não reexecuta a ferramenta nem duplica o ToolCall', async () => {
    const { def, execute } = makeCreateTicketTool();
    const idempotencyKey = `test-idem-${randomUUID()}`;

    const { first, second } = await runWithTenant('tnt_demo_alpha', async () => {
      const agentRunId = await createTestAgentRun(db, `+55${randomUUID().replace(/\D/g, '').slice(0, 10)}`);

      const first = await executor.run(def, { description: 'sem conexão' }, { agentRunId, idempotencyKey });
      const second = await executor.run(def, { description: 'sem conexão' }, { agentRunId, idempotencyKey });
      return { first, second };
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(second.toolCallId).toBe(first.toolCallId);
    expect(second.status).toBe(first.status);
    expect(second.data).toEqual(first.data);

    const count = await runWithTenant('tnt_demo_alpha', () =>
      db.client.toolCall.count({ where: { idempotencyKey } }),
    );
    expect(count).toBe(1);
  });

  it('chaves de idempotência diferentes executam a ferramenta de novo, de forma independente', async () => {
    const { def, execute } = makeCreateTicketTool();

    await runWithTenant('tnt_demo_alpha', async () => {
      const agentRunId = await createTestAgentRun(db, `+55${randomUUID().replace(/\D/g, '').slice(0, 10)}`);
      await executor.run(def, { description: 'A' }, { agentRunId, idempotencyKey: `key-a-${randomUUID()}` });
      await executor.run(def, { description: 'B' }, { agentRunId, idempotencyKey: `key-b-${randomUUID()}` });
    });

    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('idempotência é isolada por tenant: a mesma chave em tenants diferentes não colide', async () => {
    const { def, execute } = makeCreateTicketTool();
    const sharedKey = `test-idem-cross-tenant-${randomUUID()}`;

    const alphaResult = await runWithTenant('tnt_demo_alpha', async () => {
      const agentRunId = await createTestAgentRun(db, `+55${randomUUID().replace(/\D/g, '').slice(0, 10)}`);
      return executor.run(def, { description: 'alpha' }, { agentRunId, idempotencyKey: sharedKey });
    });

    const betaResult = await runWithTenant('tnt_demo_beta', async () => {
      const agentRunId = await createTestAgentRun(db, `+55${randomUUID().replace(/\D/g, '').slice(0, 10)}`);
      return executor.run(def, { description: 'beta' }, { agentRunId, idempotencyKey: sharedKey });
    });

    expect(execute).toHaveBeenCalledTimes(2); // cada tenant executou a sua, nenhuma reaproveitou a do outro
    expect(alphaResult.toolCallId).not.toBe(betaResult.toolCallId);
  });
});
