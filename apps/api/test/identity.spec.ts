import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { IdentityResolutionService } from '../src/identity/identity-resolution.service';
import { runWithTenant } from '../src/common/tenant-context';

/**
 * P0.1 / P0.7 — identidade resolvida corretamente quando inequívoca, e NUNCA vinculada ao contrato
 * errado quando ambígua ou ausente. Depende do seed determinístico (cus_demo_a, cus_demo_g/g2, cus_demo_h).
 */
describe('identity resolution (P0.1 / P0.7)', () => {
  let prisma: PrismaService;
  let db: TenantPrismaService;
  let identity: IdentityResolutionService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    db = new TenantPrismaService(prisma);
    identity = new IdentityResolutionService(db);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('resolve cliente conhecido com telefone único (cus_demo_a)', async () => {
    const result = await runWithTenant('tnt_demo_alpha', () => identity.resolveByPhone('+5511999990001'));
    expect(result.method).toBe('PHONE_EXACT');
    expect(result.confidence).toBe('HIGH');
    if (result.method === 'PHONE_EXACT') {
      expect(result.customerId).toBe('cus_demo_a');
      expect(result.contractId).toBe('ctt_demo_a');
    }
  });

  it('telefone compartilhado entre dois clientes (cus_demo_g/cus_demo_g2) é AMBIGUOUS, nunca resolve sozinho', async () => {
    const result = await runWithTenant('tnt_demo_alpha', () => identity.resolveByPhone('+5511999990007'));
    expect(result.method).toBe('AMBIGUOUS');
    if (result.method === 'AMBIGUOUS') {
      const ids = result.candidates.map((c) => c.customerId).sort();
      expect(ids).toEqual(['cus_demo_g', 'cus_demo_g2']);
    }
  });

  it('telefone não cadastrado nunca é vinculado a um cliente (NOT_FOUND)', async () => {
    const result = await runWithTenant('tnt_demo_alpha', () => identity.resolveByPhone('+5511900000000'));
    expect(result.method).toBe('NOT_FOUND');
  });

  it('desambiguação por CPF resolve exatamente cus_demo_g, não cus_demo_g2', async () => {
    const result = await runWithTenant('tnt_demo_alpha', () =>
      identity.resolveByPhoneAndDocument('+5511999990007', '111.111.111-07'),
    );
    expect(result.method).toBe('DOCUMENT');
    if (result.method === 'DOCUMENT') {
      expect(result.customerId).toBe('cus_demo_g');
    }
  });

  it('desambiguação por CPF errado para aquele telefone não resolve ninguém', async () => {
    const result = await runWithTenant('tnt_demo_alpha', () =>
      identity.resolveByPhoneAndDocument('+5511999990007', '000.000.000-00'),
    );
    expect(result.method).toBe('NOT_FOUND');
  });

  it('tenant Beta não resolve telefone cadastrado no tenant Alpha (isolamento reafirmado)', async () => {
    const result = await runWithTenant('tnt_demo_beta', () => identity.resolveByPhone('+5511999990001'));
    expect(result.method).toBe('NOT_FOUND');
  });
});
