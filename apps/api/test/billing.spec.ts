import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { PolicyEngineService } from '../src/policy/policy-engine.service';
import { ToolExecutorService } from '../src/tools/tool-executor.service';
import { MockERPAdapter } from '../src/integrations/erp/mock-erp.adapter';
import { createBillingTool } from '../src/tools/erp-tools';
import { runWithTenant } from '../src/common/tenant-context';
import { createTestAgentRun } from './helpers/agent-run';

/**
 * P0.2 — pergunta financeira executa BillingTool de fato e a resposta deriva do resultado: prova que
 * `toolCallId` e `Claim.evidence` (Fase 6) têm algo real para apontar — aqui provamos a metade que já
 * existe nesta fase: o ToolResult com `facts` derivados de dado real do ERP (mock).
 */
describe('BillingTool', () => {
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

  it('cus_demo_b (fatura vencida): BillingTool executa e os facts mostram o atraso real', async () => {
    const billingTool = createBillingTool(erp);

    const result = await runWithTenant('tnt_demo_alpha', async () => {
      const agentRunId = await createTestAgentRun(db, `+55${randomUUID().replace(/\D/g, '').slice(0, 10)}`);
      return executor.run(billingTool, { contractId: 'ctt_demo_b' }, { agentRunId });
    });

    expect(result.status).toBe('OK');
    expect(result.source.adapter).toBe('MockERPAdapter');
    expect(result.source.mode).toBe('DEMO');

    const overdueFact = result.facts.find((f) => f.path === 'data.financial.hasOverdueInvoice');
    expect(overdueFact?.value).toBe(true);

    // P0.2: toolCallId real, rastreável até um ToolCall persistido — é o que uma Claim.evidence
    // referencia (`toolCallId#facts.path`) a partir da Fase 6.
    const stored = await runWithTenant('tnt_demo_alpha', () =>
      db.client.toolCall.findUnique({ where: { id: result.toolCallId } }),
    );
    expect(stored).not.toBeNull();
    expect(stored?.tool).toBe('BillingTool');
  });

  it('cus_demo_a (saudável): BillingTool mostra ausência de atraso, sem inventar dado', async () => {
    const billingTool = createBillingTool(erp);

    const result = await runWithTenant('tnt_demo_alpha', async () => {
      const agentRunId = await createTestAgentRun(db, `+55${randomUUID().replace(/\D/g, '').slice(0, 10)}`);
      return executor.run(billingTool, { contractId: 'ctt_demo_a' }, { agentRunId });
    });

    expect(result.status).toBe('OK');
    const overdueFact = result.facts.find((f) => f.path === 'data.financial.hasOverdueInvoice');
    expect(overdueFact?.value).toBe(false);
  });

  it('contrato inexistente devolve NOT_FOUND, não um erro genérico nem dado fabricado', async () => {
    const billingTool = createBillingTool(erp);

    const result = await runWithTenant('tnt_demo_alpha', async () => {
      const agentRunId = await createTestAgentRun(db, `+55${randomUUID().replace(/\D/g, '').slice(0, 10)}`);
      return executor.run(billingTool, { contractId: 'ctt_nao_existe' }, { agentRunId });
    });

    expect(result.status).toBe('NOT_FOUND');
    expect(result.facts).toHaveLength(0);
  });

  it('BillingTool é bloqueado quando a policy do tenant desabilita billing', async () => {
    await runWithTenant('tnt_demo_alpha', () =>
      db.client.tenantPolicyConfig.update({
        where: { tenantId: 'tnt_demo_alpha' },
        data: { canAccessBilling: false },
      }),
    );
    try {
      const billingTool = createBillingTool(erp);
      const result = await runWithTenant('tnt_demo_alpha', async () => {
        const agentRunId = await createTestAgentRun(db, `+55${randomUUID().replace(/\D/g, '').slice(0, 10)}`);
        return executor.run(billingTool, { contractId: 'ctt_demo_a' }, { agentRunId });
      });
      expect(result.status).toBe('BLOCKED_BY_POLICY');
    } finally {
      await runWithTenant('tnt_demo_alpha', () =>
        db.client.tenantPolicyConfig.update({
          where: { tenantId: 'tnt_demo_alpha' },
          data: { canAccessBilling: true },
        }),
      );
    }
  });
});
