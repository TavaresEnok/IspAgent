import { Injectable } from '@nestjs/common';
import { CustomerNetworkHealth } from '@ispagent/shared';
import { PulseISPAdapter } from './pulseisp-adapter.interface';

/**
 * Sem OpenAPI do PulseISP compartilhado nesta sessão (docs/integration-capability-matrix.md) — nunca
 * inventa endpoint. Lança erro explícito; só existe para o dia em que o contrato real chegar (a
 * interface `PulseISPAdapter` não muda, só esta implementação).
 */
@Injectable()
export class RealPulseISPAdapter implements PulseISPAdapter {
  readonly name = 'RealPulseISPAdapter';

  async getCustomerNetworkHealth(_contractId: string): Promise<CustomerNetworkHealth | null> {
    throw new Error(
      '[RealPulseISPAdapter] não implementado: sem OpenAPI do PulseISP validado nesta sessão. ' +
        'Configure ISPAGENT_PULSEISP_ENABLED=false ou use o mock.',
    );
  }
}
