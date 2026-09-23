import { Injectable } from '@nestjs/common';
import { CustomerNetworkHealth } from '@ispagent/shared';
import { currentTenantId } from '../../common/tenant-context';
import { PulseISPAdapter } from './pulseisp-adapter.interface';
import { PulseIspClient, PulseIspError } from './pulseisp-client.service';
import { fromPulseId } from './pulseisp-ids';
import { mapCustomer360ToNetworkHealth, PulseAnomalyDetail } from './pulseisp-mapper';

/**
 * Adapter REAL do PulseISP (seção 6.2): lê o Customer 360 do cliente no PulseISP do tenant e traduz para
 * o contrato `CustomerNetworkHealth`. Só entra em cena para contratos `pulse_*` (clientes reais escolhidos
 * no simulador); dados DEMO do seed continuam no `MockPulseISPAdapter`. Erro de rede/login PROPAGA
 * (o `ToolExecutorService` vira UPSTREAM_ERROR e o turno escala pra humano) — nunca devolve diagnóstico
 * inventado. Cliente sem telemetria no PulseISP devolve `null` (NOT_FOUND), não um "score 0".
 */
@Injectable()
export class RealPulseISPAdapter implements PulseISPAdapter {
  readonly name = 'RealPulseISPAdapter';

  constructor(private readonly client: PulseIspClient) {}

  async getCustomerNetworkHealth(contractId: string): Promise<CustomerNetworkHealth | null> {
    const tenantId = currentTenantId();
    if (!tenantId) throw new Error('[RealPulseISPAdapter] requer contexto de tenant ativo.');

    const pulseCustomerId = fromPulseId(contractId);
    if (!pulseCustomerId) return null;

    let c360;
    try {
      c360 = await this.client.customer360(tenantId, pulseCustomerId);
    } catch (err) {
      if (err instanceof PulseIspError && err.status === 404) return null;
      throw err;
    }

    const details: Record<string, PulseAnomalyDetail> = {};
    for (const a of (c360.anomalies ?? []).filter((x) => x.status === 'ACTIVE')) {
      const d = await this.client.anomalyDetail(tenantId, a.id);
      if (d) details[a.id] = d;
    }

    return mapCustomer360ToNetworkHealth(c360, details);
  }
}
