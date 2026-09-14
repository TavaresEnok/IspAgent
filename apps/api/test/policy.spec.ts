import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { PolicyEngineService } from '../src/policy/policy-engine.service';
import { runWithTenant } from '../src/common/tenant-context';

/**
 * Policy Engine isolada (seção 4): o modelo propõe, a policy decide (princípio 1.6). Testa as decisões
 * em si, sem depender do pipeline de ferramentas (isso é coberto em tools.spec.ts).
 */
describe('policy engine', () => {
  let prisma: PrismaService;
  let db: TenantPrismaService;
  let policy: PolicyEngineService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    db = new TenantPrismaService(prisma);
    policy = new PolicyEngineService(db);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('ação READ sem flag dedicada é permitida por padrão', async () => {
    const decision = await runWithTenant('tnt_demo_alpha', () => policy.evaluate('customer.lookup'));
    expect(decision.allowed).toBe(true);
    expect(decision.requiresConfirmation).toBe(false);
    expect(decision.tier).toBe('READ');
  });

  it('ação desabilitada pela policy do tenant é bloqueada, com motivo explicado', async () => {
    const decision = await runWithTenant('tnt_demo_alpha', () => policy.evaluate('account.unlock'));
    expect(decision.allowed).toBe(false);
    expect(decision.tier).toBe('WRITE_SENSITIVE');
    expect(decision.reason).toMatch(/canPerformUnlock/);
  });

  it('ADMIN é sempre bloqueado, sem depender de nenhuma configuração de tenant (fora de escopo do MVP)', async () => {
    const decision = await runWithTenant('tnt_demo_alpha', () => policy.evaluate('network.provision_vlan'));
    expect(decision.tier).toBe('ADMIN');
    expect(decision.allowed).toBe(false);
    expect(decision.requiresConfirmation).toBe(false);
  });

  it('toda decisão carrega tenantId, policyVersion e evaluatedAt rastreáveis', async () => {
    const decision = await runWithTenant('tnt_demo_alpha', () => policy.evaluate('billing.view'));
    expect(decision.tenantId).toBe('tnt_demo_alpha');
    expect(decision.policyVersion).toBeTruthy();
    expect(new Date(decision.evaluatedAt).getTime()).not.toBeNaN();
  });

  it('WRITE_SENSITIVE habilitado ainda exige confirmação por padrão', async () => {
    await runWithTenant('tnt_demo_alpha', () =>
      db.client.tenantPolicyConfig.update({
        where: { tenantId: 'tnt_demo_alpha' },
        data: { canPerformUnlock: true, requiresConfirmationForUnlock: true },
      }),
    );
    try {
      const decision = await runWithTenant('tnt_demo_alpha', () => policy.evaluate('account.unlock'));
      expect(decision.allowed).toBe(true);
      expect(decision.requiresConfirmation).toBe(true);

      const confirmed = await runWithTenant('tnt_demo_alpha', () =>
        policy.evaluate('account.unlock', { confirmed: true }),
      );
      expect(confirmed.allowed).toBe(true);
      expect(confirmed.requiresConfirmation).toBe(false);
    } finally {
      await runWithTenant('tnt_demo_alpha', () =>
        db.client.tenantPolicyConfig.update({
          where: { tenantId: 'tnt_demo_alpha' },
          data: { canPerformUnlock: false },
        }),
      );
    }
  });

  it('policy é isolada por tenant: Beta pode ter configuração diferente de Alpha', async () => {
    const alpha = await runWithTenant('tnt_demo_alpha', () => policy.evaluate('billing.view'));
    const beta = await runWithTenant('tnt_demo_beta', () => policy.evaluate('billing.view'));
    expect(alpha.tenantId).toBe('tnt_demo_alpha');
    expect(beta.tenantId).toBe('tnt_demo_beta');
  });
});
