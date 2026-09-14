import {
  Contract,
  Customer,
  FinancialStatus,
  Invoice,
  Plan,
  ServiceStatus,
  SupportTicket,
} from '@ispagent/shared';
import { ERPAdapter } from './erp-adapter.interface';

/**
 * Base para adapters de ERP cuja API real não pôde ser validada nesta sessão (seção 6.1, passo 4:
 * "apenas estruturar" quando não há documentação oficial acessível — nunca inventar endpoint/payload).
 * `docs/integration-capability-matrix.md` reflete isso como NÃO VALIDADO/INDISPONÍVEL, não VALIDADO.
 */
export abstract class UnvalidatedERPAdapter implements ERPAdapter {
  abstract readonly name: string;
  readonly mode = 'LIVE' as const;

  protected unsupported(method: string): never {
    throw new Error(
      `[${this.name}] "${method}" não pode ser implementado: nenhuma documentação oficial acessível foi ` +
        `fornecida nesta sessão para validar endpoints/payloads reais (ver docs/integration-capability-matrix.md). ` +
        `Configure ISPAGENT_ERP_PROVIDER=demo, ou implemente este adapter contra uma API real validada.`,
    );
  }

  async findCustomer(): Promise<Customer | null> {
    this.unsupported('findCustomer');
  }
  async getCustomer(): Promise<Customer | null> {
    this.unsupported('getCustomer');
  }
  async getContracts(): Promise<Contract[]> {
    this.unsupported('getContracts');
  }
  async getPlans(): Promise<Plan[]> {
    this.unsupported('getPlans');
  }
  async getInvoices(): Promise<Invoice[]> {
    this.unsupported('getInvoices');
  }
  async getFinancialStatus(): Promise<FinancialStatus | null> {
    this.unsupported('getFinancialStatus');
  }
  async getSupportTickets(): Promise<SupportTicket[]> {
    this.unsupported('getSupportTickets');
  }
  async createSupportTicket(): Promise<SupportTicket> {
    this.unsupported('createSupportTicket');
  }
  async getServiceStatus(): Promise<ServiceStatus | null> {
    this.unsupported('getServiceStatus');
  }
}
