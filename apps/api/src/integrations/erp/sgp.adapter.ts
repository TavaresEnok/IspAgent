import { Injectable, Logger } from '@nestjs/common';
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
import { SgpClientService, SgpError } from './sgp-client.service';

function cleanDigits(value?: string | null): string {
  return (value || '').replace(/\D/g, '');
}

function cleanContractId(id: string): string {
  return id.replace(/^(sgp_|pulse_)/, '');
}

function parseSpeedFromDescription(desc?: string): number | null {
  if (!desc) return null;
  const match = desc.match(/(\d+(?:[.,]\d+)?)\s*(gigas?|gbps|gb|megas?|mbps|mb)\b/i);
  if (match) {
    const val = parseFloat(match[1].replace(',', '.'));
    if (/^g/i.test(match[2])) return Math.round(val * 1000);
    return Math.round(val);
  }
  const bare = desc.match(/(?:^|\s)(\d{2,4})\s*$/);
  if (bare) {
    const n = parseInt(bare[1], 10);
    if (n >= 10 && n <= 2000) return n;
  }
  return null;
}

@Injectable()
export class SGPAdapter implements ERPAdapter {
  readonly name = 'SGPAdapter';
  readonly mode = 'LIVE' as const;
  private readonly logger = new Logger(SGPAdapter.name);

  constructor(
    private readonly client: SgpClientService,
    private readonly db: TenantPrismaService,
  ) {}

  private getTenantId(): string {
    const tenantId = currentTenantId();
    // Sem contexto de tenant não há para quem gravar: nunca cair num tenant fixo.
    if (!tenantId) throw new SgpError('SGPAdapter requer contexto de tenant ativo.');
    return tenantId;
  }

  async findCustomer(query: { phone?: string; document?: string; contractId?: string }): Promise<SharedCustomer | null> {
    const cleanDoc = cleanDigits(query.document);
    let cleanPhone = cleanDigits(query.phone);
    if (cleanPhone.startsWith('55') && cleanPhone.length >= 12) {
      cleanPhone = cleanPhone.slice(2);
    }
    const contract = query.contractId ? cleanContractId(query.contractId) : undefined;

    if (!cleanDoc && !cleanPhone && !contract) {
      return null;
    }

    try {
      let resp: any = null;

      // 1. Tenta por documento (CPF/CNPJ)
      if (cleanDoc) {
        resp = await this.client.consultarCliente({ cpfcnpj: cleanDoc });
      }

      // 2. Se não achou e temos telefone distinto, tenta por telefone
      if ((!resp || (!resp.clientes?.length && !resp.id && !resp.nome)) && cleanPhone && cleanPhone !== cleanDoc) {
        resp = await this.client.consultarCliente({ telefone: cleanPhone });
      }

      // 3. Se não achou e temos contrato, tenta por contrato
      if ((!resp || (!resp.clientes?.length && !resp.id && !resp.nome)) && contract) {
        resp = await this.client.consultarCliente({ contrato: contract });
      }

      const raw = Array.isArray(resp)
        ? resp[0]
        : resp?.clientes && Array.isArray(resp.clientes)
          ? resp.clientes[0]
          : resp?.cliente || resp;

      if (!raw || (!raw.id && !raw.nome && !raw.cpfcnpj)) {
        return null;
      }

      return await this.syncCustomerToPrisma(raw);
    } catch (err) {
      this.logger.warn(`findCustomer falhou no SGP: ${err instanceof Error ? err.message : err}`);
      // Fallback para cliente já sincronizado no banco local
      if (cleanDoc) {
        const local = await this.db.client.customer.findFirst({ where: { document: cleanDoc } });
        if (local) return this.toSharedCustomer(local);
      }
      if (cleanPhone) {
        const local = await this.db.client.customer.findFirst({
          where: {
            OR: [
              { phones: { has: cleanPhone } },
              { phones: { has: `+55${cleanPhone}` } },
            ],
          },
        });
        if (local) return this.toSharedCustomer(local);
      }
      return null;
    }
  }

  async getCustomer(customerId: string): Promise<SharedCustomer | null> {
    const local = await this.db.client.customer.findUnique({ where: { id: customerId } });
    if (local) return this.toSharedCustomer(local);

    try {
      const resp = await this.client.consultarCliente({ contrato: cleanContractId(customerId) });
      const raw = Array.isArray(resp) ? resp[0] : resp?.clientes?.[0] || resp;
      if (!raw) return null;
      return await this.syncCustomerToPrisma(raw);
    } catch {
      return null;
    }
  }

  async getContracts(customerId: string): Promise<SharedContract[]> {
    const localContracts = await this.db.client.contract.findMany({
      where: { customerId },
      include: { plan: true },
    });
    if (localContracts.length > 0) {
      return localContracts.map((c) => ({
        id: c.id,
        customerId: c.customerId,
        status: c.status,
        planId: c.planId,
        planName: c.plan.name,
        address: c.address,
        installedAt: c.installedAt ? c.installedAt.toISOString() : null,
      }));
    }

    try {
      const resp = await this.client.consultarCliente({ contrato: cleanContractId(customerId) });
      const raw = Array.isArray(resp) ? resp[0] : resp?.clientes?.[0] || resp;
      if (raw) {
        await this.syncCustomerToPrisma(raw);
        const refreshed = await this.db.client.contract.findMany({
          where: { customerId },
          include: { plan: true },
        });
        return refreshed.map((c) => ({
          id: c.id,
          customerId: c.customerId,
          status: c.status,
          planId: c.planId,
          planName: c.plan.name,
          address: c.address,
          installedAt: c.installedAt ? c.installedAt.toISOString() : null,
        }));
      }
    } catch (err) {
      this.logger.warn(`Erro ao buscar contratos no SGP: ${err}`);
    }

    return [];
  }

  async getPlans(): Promise<SharedPlan[]> {
    try {
      const resp = await this.client.consultarPlanos();
      const rawPlans: any[] = resp?.planos || (Array.isArray(resp) ? resp : []);
      const plans: SharedPlan[] = [];
      const tenantId = this.getTenantId();

      for (const p of rawPlans) {
        if (/^(tv|telefonia)$/i.test(String(p.grupo ?? ''))) continue;
        // O SGP usa unidades inconsistentes em download/upload; a descrição ("VIBE 500 MEGA") é a fonte
        // confiável. Desconhecido fica 0 — nunca um valor "plausível" inventado.
        const speed = parseSpeedFromDescription(p.descricao) ?? 0;
        const symmetric = Number(p.download) > 0 && Number(p.download) === Number(p.upload);
        const upload = symmetric ? speed : 0;
        const priceCents = Math.round((Number(p.preco || p.valor) || 0) * 100);
        const planId = `sgp_plan_${p.id}`;

        await this.db.client.plan.upsert({
          where: { id: planId },
          create: {
            id: planId,
            tenantId,
            name: p.descricao || `Plano ${p.id}`,
            downloadMbps: speed,
            uploadMbps: upload,
            priceCents,
          },
          update: {
            name: p.descricao || `Plano ${p.id}`,
            downloadMbps: speed,
            uploadMbps: upload,
            priceCents,
          },
        });

        plans.push({
          id: planId,
          name: p.descricao || `Plano ${p.id}`,
          downloadMbps: speed,
          uploadMbps: upload,
          priceCents,
        });
      }

      if (plans.length > 0) return plans;
    } catch (err) {
      this.logger.warn(`Falha ao buscar planos no SGP: ${err}`);
    }

    const localPlans = await this.db.client.plan.findMany({ orderBy: { priceCents: 'asc' } });
    return localPlans.map((p) => ({
      id: p.id,
      name: p.name,
      downloadMbps: p.downloadMbps,
      uploadMbps: p.uploadMbps,
      priceCents: p.priceCents,
    }));
  }

  async getInvoices(contractId: string): Promise<SharedInvoice[]> {
    const rawContract = cleanContractId(contractId);
    try {
      const resp = await this.client.listarTitulos({ contrato: rawContract });
      const rawTitulos: any[] = resp?.titulos || resp?.itens || (Array.isArray(resp) ? resp : []);
      const invoices: SharedInvoice[] = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (const t of rawTitulos) {
        const id = String(t.id || t.id_titulo || randomUUID());
        const dueDateStr = t.dataVencimento || t.vencimento || t.data_vencimento;
        const dueDate = dueDateStr ? new Date(dueDateStr) : new Date();
        const paidAtStr = t.dataPagamento || t.pagamento || t.data_pagamento;
        const paidAt = paidAtStr ? new Date(paidAtStr).toISOString() : null;

        let status: 'PAID' | 'OPEN' | 'OVERDUE' = 'OPEN';
        const stLower = String(t.status || '').toLowerCase();
        if (stLower.includes('pago') || stLower.includes('liquid')) {
          status = 'PAID';
        } else if (dueDate < today) {
          status = 'OVERDUE';
        }

        const amountCents = Math.round((Number(t.valorCorrigido || t.valor || t.valor_aberto) || 0) * 100);
        const refMonth = t.mes_referencia || (dueDateStr ? dueDateStr.slice(0, 7) : '2026-09');

        let pixCode = t.codigoPix || t.pix_copia_cola || t.codigopix || null;
        let pdfUrl = t.link || t.link_pdf || t.link_cobranca || null;
        let digitableLine = t.linhaDigitavel || t.linha_digitavel || t.linhadigitavel || null;

        if (status !== 'PAID' && (!pixCode || !pdfUrl)) {
          try {
            const segVia = await this.client.segundaViaFatura(rawContract, id);
            const linkObj = segVia?.links?.[0];
            if (linkObj) {
              if (!pixCode && linkObj.codigopix) pixCode = linkObj.codigopix;
              if (!pdfUrl && linkObj.link) pdfUrl = linkObj.link;
              if (!digitableLine && linkObj.linhadigitavel) digitableLine = linkObj.linhadigitavel;
            }
          } catch {
            // Continua sem quebrar se o SGP falhar
          }
        }

        const barcode = pdfUrl || digitableLine || pixCode || t.codigo_barras || null;

        invoices.push({
          id,
          contractId,
          referenceMonth: refMonth,
          amountCents,
          status,
          dueDate: dueDate.toISOString(),
          paidAt,
          barcodeUrl: barcode,
          pixCode,
          pdfUrl,
          digitableLine,
        });
      }

      // Ordenar: abertas e vencidas primeiro; depois por vencimento
      invoices.sort((a, b) => {
        if (a.status !== 'PAID' && b.status === 'PAID') return -1;
        if (a.status === 'PAID' && b.status !== 'PAID') return 1;
        return new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime();
      });
      return invoices;
    } catch (err) {
      this.logger.warn(`Erro ao consultar faturas no SGP para o contrato ${contractId}: ${err}`);
      const local = await this.db.client.invoice.findMany({
        where: { contractId },
        orderBy: { dueDate: 'desc' },
      });
      return local.map((i) => ({
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
  }

  async getFinancialStatus(contractId: string): Promise<FinancialStatus | null> {
    const invoices = await this.getInvoices(contractId);
    const overdue = invoices.filter((i) => i.status === 'OVERDUE');

    let isBlocked = false;
    const contract = await this.db.client.contract.findUnique({ where: { id: contractId } });
    if (contract?.status === 'SUSPENDED') {
      isBlocked = true;
    }

    return {
      contractId,
      hasOverdueInvoice: overdue.length > 0,
      isBlocked,
      overdueInvoiceIds: overdue.map((i) => i.id),
    };
  }

  async getSupportTickets(contractId: string): Promise<SharedSupportTicket[]> {
    const rawContract = cleanContractId(contractId);
    try {
      const resp = await this.client.listarOcorrencias({ contrato: rawContract });
      const rawList: any[] = resp?.ocorrencias || resp?.itens || (Array.isArray(resp) ? resp : []);
      const tickets: SharedSupportTicket[] = [];

      for (const o of rawList) {
        const id = String(o.id || o.id_ocorrencia || randomUUID());
        const stLower = String(o.status || '').toLowerCase();
        let status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' = 'OPEN';
        if (stLower.includes('encerr') || stLower.includes('fech')) {
          status = 'CLOSED';
        } else if (stLower.includes('execu') || stLower.includes('andam')) {
          status = 'IN_PROGRESS';
        } else if (stLower.includes('resolv')) {
          status = 'RESOLVED';
        }

        const createdAt = o.data_cadastro ? new Date(o.data_cadastro).toISOString() : new Date().toISOString();
        const updatedAt = o.data_finalizacao || o.data_alteracao ? new Date(o.data_finalizacao || o.data_alteracao).toISOString() : createdAt;

        tickets.push({
          id,
          contractId,
          status,
          category: o.tipo || o.motivo || 'SUPORTE_TECNICO',
          description: o.conteudo || o.descricao || 'Atendimento técnico',
          createdAt,
          updatedAt,
        });
      }

      return tickets;
    } catch (err) {
      this.logger.warn(`Erro ao buscar chamados no SGP: ${err}`);
      const local = await this.db.client.supportTicket.findMany({
        where: { contractId },
        orderBy: { createdAt: 'desc' },
      });
      return local.map((t) => ({
        id: t.id,
        contractId: t.contractId,
        status: t.status,
        category: t.category,
        description: t.description,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      }));
    }
  }

  async createSupportTicket(input: {
    contractId: string;
    category: string;
    description: string;
    idempotencyKey: string;
  }): Promise<SharedSupportTicket> {
    const rawContract = cleanContractId(input.contractId);
    try {
      const resp = await this.client.criarChamado({
        contrato: rawContract,
        conteudo: `[ISPAgent IA] ${input.category}: ${input.description}`,
      });

      const ticketId = String(resp?.id || resp?.os_id || resp?.ocorrencia || randomUUID());
      const now = new Date().toISOString();

      return {
        id: ticketId,
        contractId: input.contractId,
        status: 'OPEN',
        category: input.category,
        description: input.description,
        createdAt: now,
        updatedAt: now,
      };
    } catch (err) {
      this.logger.error(`Erro ao abrir chamado no SGP: ${err}`);
      throw new SgpError(`Falha ao abrir chamado no SGP: ${err instanceof Error ? err.message : err}`);
    }
  }

  async getServiceStatus(contractId: string): Promise<ServiceStatus | null> {
    const rawContract = cleanContractId(contractId);
    try {
      const resp = await this.client.consultarCliente({ contrato: rawContract });
      const raw = Array.isArray(resp) ? resp[0] : resp?.clientes?.[0] || resp;
      if (!raw) return null;

      const services: any[] = raw.servicos || (raw.contratos ? raw.contratos.flatMap((c: any) => c.servicos || []) : []);
      const internet = services.find((s) => String(s.tipo || '').toLowerCase().includes('internet')) || services[0];

      const online = Boolean(internet?.conectado || raw.conectado || raw.radius?.online);
      const lastSeenAt = internet?.ultima_desconexao || internet?.ultimo_login || new Date().toISOString();

      return {
        contractId,
        online,
        lastSeenAt: new Date(lastSeenAt).toISOString(),
      };
    } catch (err) {
      // Sem resposta do SGP o status é DESCONHECIDO — nunca "online" por padrão.
      this.logger.warn(`Erro ao consultar status de serviço no SGP: ${err}`);
      return null;
    }
  }

  async getOpticalPower(contractId: string): Promise<{ rxPower: number; txPower?: number; status: string; assessment: 'EXCELLENT' | 'GOOD' | 'ATTENUATED' | 'CRITICAL_LOS' } | null> {
    const rawContract = cleanContractId(contractId);
    try {
      const resp = await this.client.consultarSinalOnu(rawContract);
      const raw = Array.isArray(resp) ? resp[0] : resp?.onu || resp?.onus?.[0] || resp;
      if (raw && (raw.signal?.rx_power !== undefined || raw.rx_power !== undefined)) {
        const rx = parseFloat(raw.signal?.rx_power ?? raw.rx_power);
        const tx = raw.signal?.tx_power ?? raw.tx_power ? parseFloat(raw.signal?.tx_power ?? raw.tx_power) : undefined;
        let assessment: 'EXCELLENT' | 'GOOD' | 'ATTENUATED' | 'CRITICAL_LOS' = 'GOOD';
        if (rx >= -22 && rx <= -14) assessment = 'EXCELLENT';
        else if (rx >= -25 && rx < -22) assessment = 'GOOD';
        else if (rx >= -27.9 && rx < -25) assessment = 'ATTENUATED';
        else assessment = 'CRITICAL_LOS';

        return {
          rxPower: rx,
          txPower: tx,
          status: raw.signal?.status || (assessment === 'CRITICAL_LOS' ? 'LOS_ALARM' : 'NORMAL'),
          assessment,
        };
      }
    } catch (err) {
      this.logger.warn(`getOpticalPower falhou no SGP para contrato ${contractId}: ${err}`);
    }

    // Sem leitura real da ONU não há sinal a informar (a ferramenta devolve NOT_FOUND).
    return null;
  }

  async requestPromiseToPay(contractId: string, cpfcnpj?: string): Promise<{ success: boolean; message: string; deadline?: string }> {
    const rawContract = cleanContractId(contractId);
    try {
      const resp = await this.client.liberarPromessa(rawContract, cpfcnpj ? cleanDigits(cpfcnpj) : undefined);
      if (resp && (resp.sucesso === true || resp.status === 'ok' || resp.liberado === true)) {
        return {
          success: true,
          message: resp.msg || resp.mensagem || 'Liberação em confiança concedida.',
          deadline: resp.data_promessa || undefined,
        };
      }
      return {
        success: false,
        message: resp?.msg || resp?.mensagem || 'Contrato não elegível para liberação em promessa no momento.',
      };
    } catch (err) {
      // Falha na chamada = NÃO liberado. Dizer ao cliente que foi desbloqueado sem ter sido é pior que
      // encaminhar para um atendente.
      this.logger.warn(`requestPromiseToPay falhou no SGP: ${err}`);
      return {
        success: false,
        message: 'Não consegui confirmar a liberação em confiança no sistema agora — um atendente vai verificar.',
      };
    }
  }

  private async syncCustomerToPrisma(raw: any): Promise<SharedCustomer> {
    const tenantId = this.getTenantId();
    const customerId = `sgp_${raw.id || raw.cliente_id || randomUUID()}`;
    const name = raw.nome || raw.razaosocial || 'Cliente SGP';
    const document = cleanDigits(raw.cpfcnpj || raw.cpf || raw.cnpj);

    const phones: string[] = [];
    if (raw.telefone) phones.push(raw.telefone);
    if (raw.celular) phones.push(raw.celular);
    if (raw.contatos?.celulares) phones.push(...raw.contatos.celulares);
    if (raw.contatos?.telefones) phones.push(...raw.contatos.telefones);
    const uniquePhones = Array.from(new Set(phones.map((p) => cleanDigits(p)).filter((p) => p.length >= 8)));

    const email = raw.email || raw.contatos?.emails?.[0] || null;

    await this.db.client.customer.upsert({
      where: { id: customerId },
      create: {
        id: customerId,
        tenantId,
        name,
        document: document || '(documento não informado)',
        phones: uniquePhones,
        email,
        externalId: String(raw.id || ''),
      },
      update: {
        name,
        phones: uniquePhones,
        email,
        externalId: String(raw.id || ''),
      },
    });

    const rawContracts: any[] = raw.contratos || [{ id: raw.contrato || raw.id, status: raw.status, plano: raw.plano }];
    for (const ct of rawContracts) {
      const contractId = `sgp_${ct.id}`;
      const planName =
        ct.servicos?.[0]?.plano?.descricao ||
        ct.plano?.descricao ||
        ct.plano?.nome ||
        ct.plano_nome ||
        'Plano Fibra';
      const planId = `sgp_plan_${ct.plano?.id || 'padrao'}`;

      await this.db.client.plan.upsert({
        where: { id: planId },
        create: {
          id: planId,
          tenantId,
          name: planName,
          downloadMbps: parseSpeedFromDescription(planName) ?? 0,
          uploadMbps: 0,
          // Preço real vem de getPlans() (consultaplano); aqui só o que o contrato trouxer.
          priceCents: Math.round((Number(ct.servicos?.[0]?.plano?.preco ?? ct.plano?.preco ?? ct.plano?.valor) || 0) * 100),
        },
        update: {
          name: planName,
        },
      });

      const st = String(ct.status || '').toLowerCase();
      const status = st.includes('suspens') || st.includes('bloq') ? 'SUSPENDED' : st.includes('cancel') ? 'CANCELLED' : 'ACTIVE';
      const address = ct.endereco ? `${ct.endereco.logradouro || ''}, ${ct.endereco.numero || ''}` : ct.logradouro || 'Endereço cadastrado';

      await this.db.client.contract.upsert({
        where: { id: contractId },
        create: {
          id: contractId,
          tenantId,
          customerId,
          planId,
          status,
          address,
        },
        update: {
          status,
          planId,
          address,
        },
      });
    }

    return {
      id: customerId,
      tenantId,
      name,
      document: document || '(documento não informado)',
      phones: uniquePhones,
      email,
      externalId: String(raw.id || ''),
    };
  }

  private toSharedCustomer(c: any): SharedCustomer {
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
}
