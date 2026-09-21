import { CustomerNetworkHealth } from '@ispagent/shared';

export const PULSEISP_ADAPTER = Symbol('PULSEISP_ADAPTER');

/**
 * Seção 6.2: o agente consome só `CustomerNetworkHealth`. O contrato de domínio não muda quando um
 * OpenAPI real do PulseISP chegar — só a implementação concreta muda.
 */
export interface PulseISPAdapter {
  readonly name: string;
  getCustomerNetworkHealth(contractId: string): Promise<CustomerNetworkHealth | null>;
}
