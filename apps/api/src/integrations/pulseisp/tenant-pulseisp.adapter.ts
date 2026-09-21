import { CustomerNetworkHealth } from '@ispagent/shared';
import { PulseISPAdapter } from './pulseisp-adapter.interface';
import { isPulseId } from './pulseisp-ids';

/**
 * O adapter injetado no orquestrador (token PULSEISP_ADAPTER): roteia por contrato. `pulse_*` = cliente
 * real do PulseISP do tenant; qualquer outro = dado DEMO do seed (mock). O orquestrador e os testes
 * continuam vendo um único `PulseISPAdapter`.
 */
export class TenantPulseISPAdapter implements PulseISPAdapter {
  readonly name = 'PulseISPAdapter';

  constructor(
    private readonly mock: PulseISPAdapter,
    private readonly real: PulseISPAdapter,
  ) {}

  getCustomerNetworkHealth(contractId: string): Promise<CustomerNetworkHealth | null> {
    return (isPulseId(contractId) ? this.real : this.mock).getCustomerNetworkHealth(contractId);
  }
}
