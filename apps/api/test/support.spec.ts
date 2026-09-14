import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { PolicyEngineService } from '../src/policy/policy-engine.service';
import { ToolExecutorService } from '../src/tools/tool-executor.service';
import { MockERPAdapter } from '../src/integrations/erp/mock-erp.adapter';
import { createSupportCreateTicketTool, createSupportGetTicketsTool } from '../src/tools/erp-tools';
import { runWithTenant } from '../src/common/tenant-context';
import { createTestAgentRun } from './helpers/agent-run';

describe('SupportTool', () => {
  let prisma: PrismaService;
  let db: TenantPrismaService;
  let executor: ToolExecutorService;
  let erp: MockERPAdapter;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    db = new TenantPrismaService(prisma);
    erp = new MockERPAdapter(db);
    executor = new ToolExecutorService(db, new PolicyEngineService(db));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('consulta o chamado já aberto de cus_demo_f', async () => {
    const getTickets = createSupportGetTicketsTool(erp);

    const result = await runWithTenant('tnt_demo_alpha', async () => {
      const agentRunId = await createTestAgentRun(db, `+55${randomUUID().replace(/\D/g, '').slice(0, 10)}`);
      return executor.run(getTickets, { contractId: 'ctt_demo_f' }, { agentRunId });
    });

    expect(result.status).toBe('OK');
    expect(result.facts.length).toBeGreaterThan(0);
  });

  it('cria um chamado real com idempotencyKey e não duplica em retry', async () => {
    const createTicket = createSupportCreateTicketTool(erp);
    const idempotencyKey = `support-test-${randomUUID()}`;

    const { first, second } = await runWithTenant('tnt_demo_alpha', async () => {
      const agentRunId = await createTestAgentRun(db, `+55${randomUUID().replace(/\D/g, '').slice(0, 10)}`);
      const input = { contractId: 'ctt_demo_a', category: 'TECNICO', description: 'sem conexão desde ontem' };

      const first = await executor.run(createTicket, input, { agentRunId, idempotencyKey });
      const second = await executor.run(createTicket, input, { agentRunId, idempotencyKey });
      return { first, second };
    });

    expect(first.status).toBe('OK');
    expect(second.toolCallId).toBe(first.toolCallId);

    const ticketId = (first.data as { ticket: { id: string } }).ticket.id;
    const ticketRows = await runWithTenant('tnt_demo_alpha', () =>
      db.client.supportTicket.findMany({ where: { id: ticketId } }),
    );
    expect(ticketRows).toHaveLength(1); // nenhuma duplicata, nem no ToolCall nem no ERP

    const ticketCountByKey = await runWithTenant('tnt_demo_alpha', () =>
      db.client.supportTicket.count({ where: { idempotencyKey } }),
    );
    expect(ticketCountByKey).toBe(1);
  });

  it('SupportTool é bloqueado quando a policy do tenant desabilita abertura de chamado', async () => {
    await runWithTenant('tnt_demo_alpha', () =>
      db.client.tenantPolicyConfig.update({
        where: { tenantId: 'tnt_demo_alpha' },
        data: { canCreateTicket: false },
      }),
    );
    try {
      const createTicket = createSupportCreateTicketTool(erp);
      const result = await runWithTenant('tnt_demo_alpha', async () => {
        const agentRunId = await createTestAgentRun(db, `+55${randomUUID().replace(/\D/g, '').slice(0, 10)}`);
        return executor.run(
          createTicket,
          { contractId: 'ctt_demo_a', category: 'TECNICO', description: 'x' },
          { agentRunId, idempotencyKey: `blocked-${randomUUID()}` },
        );
      });
      expect(result.status).toBe('BLOCKED_BY_POLICY');
    } finally {
      await runWithTenant('tnt_demo_alpha', () =>
        db.client.tenantPolicyConfig.update({
          where: { tenantId: 'tnt_demo_alpha' },
          data: { canCreateTicket: true },
        }),
      );
    }
  });
});
