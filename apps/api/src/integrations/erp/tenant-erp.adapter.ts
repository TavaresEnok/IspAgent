import { Injectable } from '@nestjs/common';
import { currentTenantId } from '../../common/tenant-context';
import { ERPAdapter } from './erp-adapter.interface';
import { ErpConnectionService } from './erp-connection.service';
import { MockERPAdapter } from './mock-erp.adapter';
import { SGPAdapter } from './sgp.adapter';

/**
 * O `ERP_ADAPTER` que o resto do sistema usa: escolhe, POR CHAMADA, o ERP do provedor da requisição
 * (tela "ERP"). Provedor sem SGP configurado usa a base de demonstração — nunca o SGP de outro provedor.
 * `name`/`mode` vêm do cache síncrono da conexão (auditoria mostra LIVE só quando é o SGP real).
 */
@Injectable()
export class TenantErpAdapter implements ERPAdapter {
  constructor(
    private readonly connections: ErpConnectionService,
    private readonly demo: MockERPAdapter,
    private readonly sgp: SGPAdapter,
  ) {}

  private pickSync(): ERPAdapter {
    return this.connections.providerSync(currentTenantId()) === 'sgp' ? this.sgp : this.demo;
  }

  private async pick(): Promise<ERPAdapter> {
    const tenantId = currentTenantId();
    if (!tenantId) return this.demo;
    return (await this.connections.resolve(tenantId)).provider === 'sgp' ? this.sgp : this.demo;
  }

  get name() {
    return this.pickSync().name;
  }

  get mode() {
    return this.pickSync().mode;
  }

  async findCustomer(query: Parameters<ERPAdapter['findCustomer']>[0]) {
    return (await this.pick()).findCustomer(query);
  }
  async getCustomer(customerId: string) {
    return (await this.pick()).getCustomer(customerId);
  }
  async getContracts(customerId: string) {
    return (await this.pick()).getContracts(customerId);
  }
  async getPlans() {
    return (await this.pick()).getPlans();
  }
  async getInvoices(contractId: string) {
    return (await this.pick()).getInvoices(contractId);
  }
  async getFinancialStatus(contractId: string) {
    return (await this.pick()).getFinancialStatus(contractId);
  }
  async getSupportTickets(contractId: string) {
    return (await this.pick()).getSupportTickets(contractId);
  }
  async createSupportTicket(input: Parameters<ERPAdapter['createSupportTicket']>[0]) {
    return (await this.pick()).createSupportTicket(input);
  }
  async getServiceStatus(contractId: string) {
    return (await this.pick()).getServiceStatus(contractId);
  }

  // Opcionais: ausentes no ERP do provedor = a ferramenta responde NOT_SUPPORTED (nunca dado inventado).
  get getOpticalPower(): ERPAdapter['getOpticalPower'] {
    const a = this.pickSync();
    return a.getOpticalPower ? (contractId: string) => a.getOpticalPower!(contractId) : undefined;
  }

  get requestPromiseToPay(): ERPAdapter['requestPromiseToPay'] {
    const a = this.pickSync();
    return a.requestPromiseToPay ? (contractId: string, cpfcnpj?: string) => a.requestPromiseToPay!(contractId, cpfcnpj) : undefined;
  }
}
