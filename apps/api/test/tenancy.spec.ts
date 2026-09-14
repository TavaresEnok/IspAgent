import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { runWithTenant } from '../src/common/tenant-context';

/**
 * P0.8 — Tenant A não acessa conversa, cliente, KB, policy nem integração do tenant B.
 * Prova a extensão do Prisma (tenant-scoped.extension.ts) diretamente, sem passar por HTTP: se o
 * isolamento só existisse "por acidente" em algum controller, este teste continuaria vermelho.
 * Depende de `pnpm db:migrate && pnpm db:seed` já terem rodado (ver gate da Fase 2).
 */
describe('tenant isolation (P0.8)', () => {
  let prisma: PrismaService;
  let db: TenantPrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    db = new TenantPrismaService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('bloqueia leitura de modelo tenant-scoped sem contexto de tenant ativo', async () => {
    await expect(db.client.customer.findMany()).rejects.toThrow(/tenant-isolation/);
  });

  it('tenant Beta não enxerga cliente do tenant Alpha por id', async () => {
    const result = await runWithTenant('tnt_demo_beta', () =>
      db.client.customer.findUnique({ where: { id: 'cus_demo_a' } }),
    );
    expect(result).toBeNull();
  });

  it('tenant Alpha enxerga seu próprio cliente', async () => {
    const result = await runWithTenant('tnt_demo_alpha', () =>
      db.client.customer.findUnique({ where: { id: 'cus_demo_a' } }),
    );
    expect(result).not.toBeNull();
    expect(result?.tenantId).toBe('tnt_demo_alpha');
  });

  it('findMany do tenant Beta nunca inclui clientes do tenant Alpha', async () => {
    const betaCustomers = await runWithTenant('tnt_demo_beta', () => db.client.customer.findMany());
    expect(betaCustomers.every((c) => c.tenantId === 'tnt_demo_beta')).toBe(true);
    expect(betaCustomers.find((c) => c.id === 'cus_demo_a')).toBeUndefined();
  });

  it('bloqueia criação com tenantId divergente do contexto ativo', async () => {
    await expect(
      runWithTenant('tnt_demo_beta', () =>
        db.client.auditLog.create({
          data: {
            tenantId: 'tnt_demo_alpha',
            actorType: 'SYSTEM',
            action: 'test.cross_tenant_attempt',
          },
        }),
      ),
    ).rejects.toThrow(/tenant-isolation/);
  });

  it('tenant Alpha não acessa a policy config do tenant Beta', async () => {
    // tenantId é a própria PK de TenantPolicyConfig: um where.tenantId explícito e divergente do
    // contexto é bloqueado (erro), não silenciosamente substituído pelo tenant do contexto.
    await expect(
      runWithTenant('tnt_demo_alpha', () =>
        db.client.tenantPolicyConfig.findUnique({ where: { tenantId: 'tnt_demo_beta' } }),
      ),
    ).rejects.toThrow(/tenant-isolation/);
  });

  it('tenant Alpha só enxerga sua própria policy config', async () => {
    const result = await runWithTenant('tnt_demo_alpha', () =>
      db.client.tenantPolicyConfig.findUnique({ where: { tenantId: 'tnt_demo_alpha' } }),
    );
    expect(result?.tenantId).toBe('tnt_demo_alpha');
  });

  it('tenant Beta não acessa usuários do tenant Alpha', async () => {
    const result = await runWithTenant('tnt_demo_beta', () =>
      db.client.user.findMany({ where: { email: 'admin@alpha.ispagent.local' } }),
    );
    expect(result).toHaveLength(0);
  });
});
