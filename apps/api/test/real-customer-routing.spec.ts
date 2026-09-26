import { CustomerNetworkHealth } from '@ispagent/shared';
import { PulseISPAdapter } from '../src/integrations/pulseisp/pulseisp-adapter.interface';
import { TenantPulseISPAdapter } from '../src/integrations/pulseisp/tenant-pulseisp.adapter';
import { IdentityResolutionService } from '../src/identity/identity-resolution.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';

const health = (mode: 'DEMO' | 'LIVE'): CustomerNetworkHealth => ({
  healthScore: mode === 'DEMO' ? 97 : 30,
  status: mode === 'DEMO' ? 'HEALTHY' : 'CRITICAL',
  optical: { rxDbm: null, txDbm: null, trend: 'UNKNOWN' },
  stability: { disconnects7d: 0, reconnects7d: 0, lastEventAt: null },
  activeAnomalies: [],
  recommendations: [],
  observedAt: new Date().toISOString(),
  mode,
});

function adapters() {
  const mock: PulseISPAdapter & { calls: string[] } = {
    name: 'mock',
    calls: [],
    async getCustomerNetworkHealth(id) {
      this.calls.push(id);
      return health('DEMO');
    },
  };
  const real: PulseISPAdapter & { calls: string[] } = {
    name: 'real',
    calls: [],
    async getCustomerNetworkHealth(id) {
      this.calls.push(id);
      return health('LIVE');
    },
  };
  return { mock, real };
}

describe('diagnóstico de rede de cliente real nunca vem do mock', () => {
  it('contrato do SGP vai ao PulseISP real, localizado pelo resolvedor (CPF = login PPPoE)', async () => {
    const { mock, real } = adapters();
    const adapter = new TenantPulseISPAdapter(mock, real, async (id) => (id === 'sgp_30923' ? 'pulse_abc' : null));

    expect((await adapter.getCustomerNetworkHealth('sgp_30923'))?.mode).toBe('LIVE');
    expect(real.calls).toEqual(['pulse_abc']);
    expect(mock.calls).toEqual([]);
  });

  it('contrato do SGP sem correspondência no PulseISP devolve "sem dados", não o "saudável" do mock', async () => {
    const { mock, real } = adapters();
    const adapter = new TenantPulseISPAdapter(mock, real, async () => null);
    expect(await adapter.getCustomerNetworkHealth('sgp_999')).toBeNull();
    const semResolvedor = new TenantPulseISPAdapter(mock, real);
    expect(await semResolvedor.getCustomerNetworkHealth('sgp_999')).toBeNull();
    expect(mock.calls).toEqual([]);
  });

  it('só contrato DEMO do seed usa o mock; espelho do PulseISP vai direto ao real', async () => {
    const { mock, real } = adapters();
    const adapter = new TenantPulseISPAdapter(mock, real, async () => null);
    await adapter.getCustomerNetworkHealth('ctt_demo_a');
    await adapter.getCustomerNetworkHealth('pulse_xyz');
    expect(mock.calls).toEqual(['ctt_demo_a']);
    expect(real.calls).toEqual(['pulse_xyz']);
  });
});

describe('mesmo CPF no cadastro do ERP e num espelho do PulseISP', () => {
  const customer = (id: string, contracts: Array<{ id: string }>) => ({ id, name: id, contracts });
  const service = (rows: ReturnType<typeof customer>[]) =>
    new IdentityResolutionService({ client: { customer: { findMany: async () => rows } } } as unknown as TenantPrismaService);

  it('vale o cadastro oficial do ERP (fatura/plano ficam disponíveis)', async () => {
    const r = await service([customer('pulse_fdb43', [{ id: 'pulse_fdb43' }]), customer('sgp_13161', [{ id: 'sgp_30923' }])]).resolveByDocument(
      '04103918403',
    );
    expect(r).toMatchObject({ method: 'DOCUMENT', customerId: 'sgp_13161', contractId: 'sgp_30923', confidence: 'MEDIUM' });
  });

  it('duas pessoas "oficiais" com o mesmo documento continuam ambíguas (atendente decide)', async () => {
    const r = await service([customer('sgp_1', [{ id: 'sgp_c1' }]), customer('sgp_2', [{ id: 'sgp_c2' }])]).resolveByDocument('04103918403');
    expect(r.method).toBe('AMBIGUOUS');
  });
});
