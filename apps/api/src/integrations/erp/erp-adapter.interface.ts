import {
  Contract,
  Customer,
  FinancialStatus,
  Invoice,
  Plan,
  RunMode,
  ServiceStatus,
  SupportTicket,
} from '@ispagent/shared';

/**
 * Contrato de integração com o ERP do provedor (seção 6.1). Nenhuma regra de negócio conhece IXC ou
 * SGP diretamente — só esta interface. Capacidade inexistente no ERP retorna `null`/lista vazia (nunca
 * dado fabricado); quem decide "NOT_SUPPORTED" é a ferramenta que consome o adapter, não o adapter em
 * si (ver `ToolExecuteOutcome`).
 */
export const ERP_ADAPTER = Symbol('ERP_ADAPTER');

export interface ERPAdapter {
  readonly name: string;
  readonly mode: RunMode;

  findCustomer(query: { phone?: string; document?: string; contractId?: string }): Promise<Customer | null>;
  getCustomer(customerId: string): Promise<Customer | null>;
  getContracts(customerId: string): Promise<Contract[]>;
  getPlans(): Promise<Plan[]>;
  getInvoices(contractId: string): Promise<Invoice[]>;
  getFinancialStatus(contractId: string): Promise<FinancialStatus | null>;
  getSupportTickets(contractId: string): Promise<SupportTicket[]>;
  createSupportTicket(input: {
    contractId: string;
    category: string;
    description: string;
    idempotencyKey: string;
  }): Promise<SupportTicket>;
  getServiceStatus(contractId: string): Promise<ServiceStatus | null>;
}
