import { CustomerNetworkHealth } from '@ispagent/shared';
import { PulseISPAdapter } from './pulseisp-adapter.interface';
import { isPulseId } from './pulseisp-ids';

/** Contratos vindos de um ERP real (espelhados no banco pelo adapter do ERP). */
export const ERP_CONTRACT_PREFIXES = ['sgp_'];

export function isErpContract(id: string | null | undefined): boolean {
  return typeof id === 'string' && ERP_CONTRACT_PREFIXES.some((p) => id.startsWith(p));
}

/**
 * O adapter injetado no orquestrador (token PULSEISP_ADAPTER): roteia por contrato.
 *   - `pulse_*`: cliente real do PulseISP → PulseISP de verdade;
 *   - contrato de ERP real (`sgp_*`): o PulseISP correspondente é localizado (`resolveErpContract`, pelo
 *     CPF do titular = login PPPoE) e consultado de verdade; sem correspondência → `null` (sem dados);
 *   - qualquer outro: dado DEMO do seed (mock).
 * Um cliente real NUNCA recebe diagnóstico do mock (que responde "saudável" para qualquer contrato).
 */
export class TenantPulseISPAdapter implements PulseISPAdapter {
  readonly name = 'PulseISPAdapter';

  constructor(
    private readonly mock: PulseISPAdapter,
    private readonly real: PulseISPAdapter,
    private readonly resolveErpContract?: (contractId: string) => Promise<string | null>,
  ) {}

  async getCustomerNetworkHealth(contractId: string): Promise<CustomerNetworkHealth | null> {
    if (isPulseId(contractId)) return this.real.getCustomerNetworkHealth(contractId);
    if (isErpContract(contractId)) {
      const pulseContractId = this.resolveErpContract ? await this.resolveErpContract(contractId) : null;
      return pulseContractId ? this.real.getCustomerNetworkHealth(pulseContractId) : null;
    }
    return this.mock.getCustomerNetworkHealth(contractId);
  }
}
