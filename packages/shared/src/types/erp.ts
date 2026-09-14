export interface Customer {
  id: string;
  tenantId: string;
  name: string;
  document: string; // CPF/CNPJ, sempre mascarado ao sair para o LLM/UI de suporte
  phones: string[];
  email: string | null;
  externalId: string | null;
}

export interface Contract {
  id: string;
  customerId: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
  planId: string;
  planName: string;
  address: string;
  installedAt: string | null;
}

export interface Plan {
  id: string;
  name: string;
  downloadMbps: number;
  uploadMbps: number;
  priceCents: number;
}

export interface Invoice {
  id: string;
  contractId: string;
  referenceMonth: string; // YYYY-MM
  amountCents: number;
  status: 'PAID' | 'OPEN' | 'OVERDUE';
  dueDate: string;
  paidAt: string | null;
  barcodeUrl: string | null;
}

export interface FinancialStatus {
  contractId: string;
  hasOverdueInvoice: boolean;
  isBlocked: boolean;
  overdueInvoiceIds: string[];
}

export interface SupportTicket {
  id: string;
  contractId: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  category: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceStatus {
  contractId: string;
  online: boolean;
  lastSeenAt: string | null;
}
