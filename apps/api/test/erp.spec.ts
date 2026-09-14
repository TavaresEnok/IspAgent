import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { MockERPAdapter } from '../src/integrations/erp/mock-erp.adapter';
import { runWithTenant } from '../src/common/tenant-context';

/**
 * MockERPAdapter (seção 6.1, 9): lê/escreve dados REAIS do Postgres seedado — não payloads fabricados.
 * Cobre as capacidades mínimas da seção 6.1.
 */
describe('MockERPAdapter', () => {
  let prisma: PrismaService;
  let db: TenantPrismaService;
  let erp: MockERPAdapter;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    db = new TenantPrismaService(prisma);
    erp = new MockERPAdapter(db);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('findCustomer por telefone encontra cus_demo_a', async () => {
    const customer = await runWithTenant('tnt_demo_alpha', () => erp.findCustomer({ phone: '+5511999990001' }));
    expect(customer?.id).toBe('cus_demo_a');
  });

  it('findCustomer por documento encontra o cliente certo', async () => {
    const customer = await runWithTenant('tnt_demo_alpha', () =>
      erp.findCustomer({ document: '111.111.111-02' }),
    );
    expect(customer?.id).toBe('cus_demo_b');
  });

  it('getContracts devolve o contrato com o plano resolvido', async () => {
    const contracts = await runWithTenant('tnt_demo_alpha', () => erp.getContracts('cus_demo_e'));
    expect(contracts).toHaveLength(1);
    expect(contracts[0].id).toBe('ctt_demo_e');
    expect(contracts[0].planName).toBe('Internet 50 Mega (legado)');
  });

  it('getFinancialStatus reflete a fatura vencida de cus_demo_b', async () => {
    const status = await runWithTenant('tnt_demo_alpha', () => erp.getFinancialStatus('ctt_demo_b'));
    expect(status?.hasOverdueInvoice).toBe(true);
    expect(status?.isBlocked).toBe(true);
    expect(status?.overdueInvoiceIds.length).toBeGreaterThan(0);
  });

  it('getFinancialStatus de um cliente saudável não mostra atraso', async () => {
    const status = await runWithTenant('tnt_demo_alpha', () => erp.getFinancialStatus('ctt_demo_a'));
    expect(status?.hasOverdueInvoice).toBe(false);
    expect(status?.isBlocked).toBe(false);
  });

  it('getSupportTickets encontra o chamado já aberto de cus_demo_f', async () => {
    const tickets = await runWithTenant('tnt_demo_alpha', () => erp.getSupportTickets('ctt_demo_f'));
    expect(tickets.length).toBeGreaterThan(0);
    expect(tickets[0].status).toBe('OPEN');
  });

  it('createSupportTicket é idempotente pela chave', async () => {
    const key = `erp-test-${Date.now()}`;
    const first = await runWithTenant('tnt_demo_alpha', () =>
      erp.createSupportTicket({
        contractId: 'ctt_demo_a',
        category: 'TECNICO',
        description: 'teste idempotência ERP',
        idempotencyKey: key,
      }),
    );
    const second = await runWithTenant('tnt_demo_alpha', () =>
      erp.createSupportTicket({
        contractId: 'ctt_demo_a',
        category: 'TECNICO',
        description: 'teste idempotência ERP',
        idempotencyKey: key,
      }),
    );
    expect(second.id).toBe(first.id);

    const count = await runWithTenant('tnt_demo_alpha', () =>
      db.client.supportTicket.count({ where: { idempotencyKey: key } }),
    );
    expect(count).toBe(1);
  });

  it('getServiceStatus deriva do status real do contrato', async () => {
    const status = await runWithTenant('tnt_demo_alpha', () => erp.getServiceStatus('ctt_demo_a'));
    expect(status?.online).toBe(true);
  });

  it('capacidade sem correspondência (cliente inexistente) devolve null, nunca dado fabricado', async () => {
    const customer = await runWithTenant('tnt_demo_alpha', () => erp.getCustomer('cus_nao_existe'));
    expect(customer).toBeNull();
  });
});
