import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  Contract as SharedContract,
  Customer as SharedCustomer,
  FinancialStatus,
  Invoice as SharedInvoice,
  Plan as SharedPlan,
  ServiceStatus,
  SupportTicket as SharedSupportTicket,
} from '@ispagent/shared';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { currentTenantId } from '../../common/tenant-context';
import { ERPAdapter } from './erp-adapter.interface';

/**
 * Adapter DEMO (seção 9): dados reais do Postgres seedado, não payloads fabricados na hora. É o único
 * ERPAdapter garantido de funcionar sem nenhuma credencial externa — sempre disponível, sempre em
 * RunMode 'DEMO'.
 */
@Injectable()
export class MockERPAdapter implements ERPAdapter {
  readonly name = 'MockERPAdapter';
  readonly mode = 'DEMO' as const;

  constructor(private readonly db: TenantPrismaService) {}

  private requireTenantId(): string {
    const tenantId = currentTenantId();
    if (!tenantId) throw new Error('[MockERPAdapter] requer contexto de tenant ativo.');
    return tenantId;
  }

  async findCustomer(query: { phone?: string; document?: string; contractId?: string }): Promise<SharedCustomer | null> {
    if (query.contractId) {
      const contract = await this.db.client.contract.findUnique({
        where: { id: query.contractId },
        include: { customer: true },
      });
      return contract ? this.toSharedCustomer(contract.customer) : null;
    }
    if (query.document) {
      const customer = await this.db.client.customer.findFirst({ where: { document: query.document } });
      return customer ? this.toSharedCustomer(customer) : null;
    }
    if (query.phone) {
      const customer = await this.db.client.customer.findFirst({ where: { phones: { has: query.phone } } });
      return customer ? this.toSharedCustomer(customer) : null;
    }
    return null;
  }

  async getCustomer(customerId: string): Promise<SharedCustomer | null> {
    const customer = await this.db.client.customer.findUnique({ where: { id: customerId } });
    return customer ? this.toSharedCustomer(customer) : null;
  }

  async getContracts(customerId: string): Promise<SharedContract[]> {
    const contracts = await this.db.client.contract.findMany({
      where: { customerId },
      include: { plan: true },
    });
    return contracts.map((c) => this.toSharedContract(c));
  }

  async getPlans(): Promise<SharedPlan[]> {
    const plans = await this.db.client.plan.findMany({ orderBy: { priceCents: 'asc' } });
    return plans.map((p) => ({
      id: p.id,
      name: p.name,
      downloadMbps: p.downloadMbps,
      uploadMbps: p.uploadMbps,
      priceCents: p.priceCents,
    }));
  }

  async getInvoices(contractId: string): Promise<SharedInvoice[]> {
    const invoices = await this.db.client.invoice.findMany({
      where: { contractId },
      orderBy: { dueDate: 'desc' },
    });
    return invoices.map((i) => ({
      id: i.id,
      contractId: i.contractId,
      referenceMonth: i.referenceMonth,
      amountCents: i.amountCents,
      status: i.status,
      dueDate: i.dueDate.toISOString(),
      paidAt: i.paidAt ? i.paidAt.toISOString() : null,
      barcodeUrl: i.barcodeUrl,
    }));
  }

  async getFinancialStatus(contractId: string): Promise<FinancialStatus | null> {
    const contract = await this.db.client.contract.findUnique({ where: { id: contractId } });
    if (!contract) return null;

    const overdue = await this.db.client.invoice.findMany({
      where: { contractId, status: 'OVERDUE' },
    });

    return {
      contractId,
      hasOverdueInvoice: overdue.length > 0,
      isBlocked: overdue.length > 0,
      overdueInvoiceIds: overdue.map((i) => i.id),
    };
  }

  async getSupportTickets(contractId: string): Promise<SharedSupportTicket[]> {
    const tickets = await this.db.client.supportTicket.findMany({
      where: { contractId },
      orderBy: { createdAt: 'desc' },
    });
    return tickets.map((t) => this.toSharedTicket(t));
  }

  async createSupportTicket(input: {
    contractId: string;
    category: string;
    description: string;
    idempotencyKey: string;
  }): Promise<SharedSupportTicket> {
    const tenantId = this.requireTenantId();

    const existing = await this.db.client.supportTicket.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: input.idempotencyKey } },
    });
    if (existing) return this.toSharedTicket(existing);

    const created = await this.db.client.supportTicket.create({
      data: {
        id: `tkt_${randomUUID()}`,
        tenantId,
        contractId: input.contractId,
        category: input.category,
        description: input.description,
        status: 'OPEN',
        idempotencyKey: input.idempotencyKey,
      },
    });
    return this.toSharedTicket(created);
  }

  async getServiceStatus(contractId: string): Promise<ServiceStatus | null> {
    const contract = await this.db.client.contract.findUnique({ where: { id: contractId } });
    if (!contract) return null;

    // Sem telemetria própria (isso é domínio do PulseISP, Fase 7): deriva de um sinal real que o
    // ERP mock efetivamente tem — o status do contrato — nunca inventa um "online" desconectado do dado.
    const online = contract.status === 'ACTIVE';
    return { contractId, online, lastSeenAt: online ? new Date().toISOString() : null };
  }

  private toSharedCustomer(c: { id: string; tenantId: string; name: string; document: string; phones: string[]; email: string | null; externalId: string | null }): SharedCustomer {
    return {
      id: c.id,
      tenantId: c.tenantId,
      name: c.name,
      document: c.document,
      phones: c.phones,
      email: c.email,
      externalId: c.externalId,
    };
  }

  private toSharedContract(c: {
    id: string;
    customerId: string;
    status: string;
    planId: string;
    plan: { name: string };
    address: string;
    installedAt: Date | null;
  }): SharedContract {
    return {
      id: c.id,
      customerId: c.customerId,
      status: c.status as SharedContract['status'],
      planId: c.planId,
      planName: c.plan.name,
      address: c.address,
      installedAt: c.installedAt ? c.installedAt.toISOString() : null,
    };
  }

  private toSharedTicket(t: {
    id: string;
    contractId: string;
    status: string;
    category: string;
    description: string;
    createdAt: Date;
    updatedAt: Date;
  }): SharedSupportTicket {
    return {
      id: t.id,
      contractId: t.contractId,
      status: t.status as SharedSupportTicket['status'],
      category: t.category,
      description: t.description,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }

  // O seed DEMO não tem telemetria de ONU (a telemetria DEMO vem do MockPulseISPAdapter): nada a afirmar.
  async getOpticalPower(_contractId: string): Promise<{ rxPower: number; txPower?: number; status: string; assessment: 'EXCELLENT' | 'GOOD' | 'ATTENUATED' | 'CRITICAL_LOS' } | null> {
    return null;
  }

  async requestPromiseToPay(contractId: string, cpfcnpj?: string): Promise<{ success: boolean; message: string; deadline?: string }> {
    const deadline = new Date(Date.now() + 48 * 3600 * 1000).toLocaleDateString('pt-BR');
    return {
      success: true,
      message: `Desbloqueio em confiança de 48 horas ativado com sucesso! Previsão de liberação: ${deadline}.`,
      deadline,
    };
  }
}
