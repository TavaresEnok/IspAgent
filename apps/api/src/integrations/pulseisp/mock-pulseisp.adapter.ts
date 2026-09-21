import { Injectable } from '@nestjs/common';
import { CustomerNetworkHealth } from '@ispagent/shared';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { PulseISPAdapter } from './pulseisp-adapter.interface';

/**
 * Mock determinístico (seção 9 / 6.2): telemetria sintética por contrato, coerente com os cenários do
 * seed — `ctt_demo_c` (degradação individual) e `ctt_demo_d` (incidente coletivo na PON) sempre
 * devolvem o mesmo diagnóstico, para o `verify.ps1` e os testes serem reprodutíveis. Confirma que o
 * contrato existe (via Postgres, respeitando isolamento de tenant) antes de responder — nunca inventa
 * telemetria para um contrato que não existe.
 */
@Injectable()
export class MockPulseISPAdapter implements PulseISPAdapter {
  readonly name = 'MockPulseISPAdapter';

  constructor(private readonly db: TenantPrismaService) {}

  async getCustomerNetworkHealth(contractId: string): Promise<CustomerNetworkHealth | null> {
    const contract = await this.db.client.contract.findUnique({ where: { id: contractId } });
    if (!contract) return null;

    const now = new Date().toISOString();

    if (contractId === 'ctt_demo_c') {
      return {
        healthScore: 42,
        status: 'DEGRADED',
        optical: { rxDbm: -27.4, txDbm: 2.1, trend: 'DEGRADING' },
        stability: { disconnects7d: 14, reconnects7d: 14, lastEventAt: now },
        activeAnomalies: [],
        recommendations: [
          'Sinal óptico em degradação progressiva — provável problema na fibra ou conectorização do cliente.',
          'Recomenda-se visita técnica individual, não reinício simples do roteador.',
        ],
        observedAt: now,
        mode: 'DEMO',
      };
    }

    if (contractId === 'ctt_demo_d') {
      return {
        healthScore: 15,
        status: 'CRITICAL',
        optical: { rxDbm: null, txDbm: null, trend: 'UNKNOWN' },
        stability: { disconnects7d: 1, reconnects7d: 0, lastEventAt: now },
        activeAnomalies: [
          {
            id: 'anomaly_demo_pon_1',
            scope: 'PON',
            affectedCustomers: 23,
            startedAt: now,
            description: 'ONU da PON offline — incidente coletivo afetando todos os clientes da porta.',
          },
        ],
        recommendations: [
          'Incidente coletivo já identificado — não abrir chamado individual duplicado, informar previsão de restabelecimento.',
        ],
        observedAt: now,
        mode: 'DEMO',
      };
    }

    // Qualquer outro contrato existente: saudável, sem anomalia.
    return {
      healthScore: 97,
      status: 'HEALTHY',
      optical: { rxDbm: -18.2, txDbm: 2.0, trend: 'STABLE' },
      stability: { disconnects7d: 0, reconnects7d: 0, lastEventAt: null },
      activeAnomalies: [],
      recommendations: [],
      observedAt: now,
      mode: 'DEMO',
    };
  }
}
