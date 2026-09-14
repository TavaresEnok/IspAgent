import { Injectable } from '@nestjs/common';
import { UnvalidatedERPAdapter } from './unvalidated-erp.adapter';

/**
 * SGP — ver docs/integration-capability-matrix.md. Sem documentação oficial acessível nesta sessão para
 * validar endpoints/payloads reais; estruturado conforme seção 6.1 passo 4, não implementado.
 */
@Injectable()
export class SGPAdapter extends UnvalidatedERPAdapter {
  readonly name = 'SGPAdapter';
}
