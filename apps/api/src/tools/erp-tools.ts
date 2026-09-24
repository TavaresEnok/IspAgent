import { z } from 'zod';
import { ToolResult } from '@ispagent/shared';
import { ERPAdapter } from '../integrations/erp/erp-adapter.interface';
import { ToolDefinition } from './tool.types';

type Fact = ToolResult['facts'][number];

/**
 * Ferramentas reais da Fase 5 (BillingTool, SupportTool, PlanTool — seção 4), cada uma uma fábrica que
 * recebe o `ERPAdapter` ativo. Nunca chamam Prisma diretamente: tudo passa pelo adapter, que é o único
 * lugar que sabe se a fonte é o Mock (DEMO) ou um ERP real.
 */

export function createBillingTool(erp: ERPAdapter): ToolDefinition<{ contractId: string }, unknown> {
  return {
    name: 'BillingTool',
    action: 'billing.view',
    inputSchema: z.object({ contractId: z.string().min(1) }),
    adapter: erp.name,
    capability: 'financial_status',
    mode: erp.mode,
    execute: async (input) => {
      const financial = await erp.getFinancialStatus(input.contractId);
      if (!financial) {
        return { status: 'NOT_FOUND', facts: [] };
      }
      const invoices = await erp.getInvoices(input.contractId);
      const latest = invoices[0] ?? null;

      const facts: Fact[] = [
        { path: 'data.financial.hasOverdueInvoice', label: 'Fatura em atraso', value: financial.hasOverdueInvoice },
        { path: 'data.financial.isBlocked', label: 'Bloqueio financeiro', value: financial.isBlocked },
      ];
      if (latest) {
        const formattedAmount = (latest.amountCents / 100).toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        });
        const dateObj = new Date(latest.dueDate);
        const formattedDueDate = !isNaN(dateObj.getTime())
          ? dateObj.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
          : latest.dueDate;

        facts.push(
          {
            path: 'data.latestInvoice.status',
            label: 'Status da fatura',
            value: latest.status === 'PAID' ? 'Paga' : latest.status === 'OVERDUE' ? 'Vencida' : 'Em aberto',
          },
          { path: 'data.latestInvoice.dueDate', label: 'Vencimento da fatura', value: formattedDueDate },
          { path: 'data.latestInvoice.formattedAmount', label: 'Valor da fatura', value: formattedAmount },
        );

        if (latest.pdfUrl) {
          facts.push({ path: 'data.latestInvoice.pdfUrl', label: 'Link do boleto (PDF)', value: latest.pdfUrl });
        }
        if (latest.pixCode) {
          facts.push({ path: 'data.latestInvoice.pixCode', label: 'Código PIX Copia e Cola', value: latest.pixCode });
        }
        if (latest.digitableLine) {
          facts.push({ path: 'data.latestInvoice.digitableLine', label: 'Linha digitável', value: latest.digitableLine });
        }
      }

      return { status: 'OK', data: { financial, latestInvoice: latest }, facts };
    },
  };
}

export function createSupportGetTicketsTool(erp: ERPAdapter): ToolDefinition<{ contractId: string }, unknown> {
  return {
    name: 'SupportTool',
    action: 'support.get_ticket',
    inputSchema: z.object({ contractId: z.string().min(1) }),
    adapter: erp.name,
    capability: 'get_tickets',
    mode: erp.mode,
    execute: async (input) => {
      const tickets = await erp.getSupportTickets(input.contractId);
      const facts = tickets.slice(0, 5).map((t) => ({
        path: `data.tickets[${t.id}].status`,
        label: `Chamado ${t.id}`,
        value: t.status,
      }));
      return { status: 'OK', data: { tickets }, facts };
    },
  };
}

export function createSupportCreateTicketTool(
  erp: ERPAdapter,
): ToolDefinition<{ contractId: string; category: string; description: string }, unknown> {
  return {
    name: 'SupportTool',
    action: 'support.create_ticket',
    inputSchema: z.object({
      contractId: z.string().min(1),
      category: z.string().min(1),
      description: z.string().min(1).max(2000),
    }),
    adapter: erp.name,
    capability: 'create_ticket',
    mode: erp.mode,
    execute: async (input, ctx) => {
      if (!ctx.idempotencyKey) {
        // Abertura de chamado é WRITE_LOW_RISK, mas ainda assim uma escrita (princípio 1.7): nunca
        // silenciosamente segue sem chave, força o chamador a decidir uma.
        return {
          status: 'NOT_SUPPORTED',
          facts: [],
          error: { code: 'MISSING_IDEMPOTENCY_KEY', message: 'Criação de chamado exige idempotencyKey.' },
        };
      }
      const ticket = await erp.createSupportTicket({ ...input, idempotencyKey: ctx.idempotencyKey });
      return {
        status: 'OK',
        data: { ticket },
        facts: [{ path: 'data.ticket.id', label: 'Chamado criado', value: ticket.id }],
      };
    },
  };
}

export function createPlanViewTool(erp: ERPAdapter): ToolDefinition<{ customerId: string }, unknown> {
  return {
    name: 'PlanTool',
    action: 'plan.view',
    inputSchema: z.object({ customerId: z.string().min(1) }),
    adapter: erp.name,
    capability: 'view_plan',
    mode: erp.mode,
    execute: async (input) => {
      const [contracts, plans] = await Promise.all([erp.getContracts(input.customerId), erp.getPlans()]);
      const active = contracts.filter((c) => c.status === 'ACTIVE');
      const planById = new Map(plans.map((p) => [p.id, p]));

      const facts: Fact[] = active.flatMap((c) => {
        const contractFacts: Fact[] = [{ path: `data.contracts[${c.id}].planName`, label: 'Seu plano', value: c.planName }];
        const plan = planById.get(c.planId);
        // 0 = o ERP não informou: não vira fato (o agente não pode afirmar "R$ 0,00" nem "0 Mbps").
        if (plan && plan.priceCents > 0) {
          contractFacts.push({ path: `data.plans[${plan.id}].priceCents`, label: 'Valor mensal do plano (centavos)', value: plan.priceCents });
        }
        if (plan && plan.downloadMbps > 0) {
          contractFacts.push({ path: `data.plans[${plan.id}].downloadMbps`, label: 'Velocidade de download (Mbps)', value: plan.downloadMbps });
        }
        if (plan && plan.uploadMbps > 0) {
          contractFacts.push({ path: `data.plans[${plan.id}].uploadMbps`, label: 'Velocidade de upload (Mbps)', value: plan.uploadMbps });
        }
        return contractFacts;
      });

      return { status: 'OK', data: { contracts: active, plans }, facts };
    },
  };
}

export function createPromiseToPayTool(erp: ERPAdapter): ToolDefinition<{ contractId: string; cpfcnpj?: string }, unknown> {
  return {
    name: 'PromiseToPayTool',
    action: 'billing.unlock',
    inputSchema: z.object({ contractId: z.string().min(1), cpfcnpj: z.string().optional() }),
    adapter: erp.name,
    capability: 'promise_to_pay',
    mode: erp.mode,
    execute: async (input) => {
      if (!erp.requestPromiseToPay) {
        return { status: 'NOT_SUPPORTED', facts: [] };
      }
      const res = await erp.requestPromiseToPay(input.contractId, input.cpfcnpj);
      const facts: Fact[] = [
        { path: 'data.promiseToPay.success', label: 'Desbloqueio em confiança realizado', value: res.success },
        { path: 'data.promiseToPay.message', label: 'Mensagem de liberação', value: res.message },
      ];
      if (res.deadline) {
        facts.push({ path: 'data.promiseToPay.deadline', label: 'Data limite de liberação', value: res.deadline });
      }
      return { status: 'OK', data: res, facts };
    },
  };
}

export function createOpticalSignalTool(erp: ERPAdapter): ToolDefinition<{ contractId: string }, unknown> {
  return {
    name: 'OpticalSignalTool',
    action: 'network.diagnostic',
    inputSchema: z.object({ contractId: z.string().min(1) }),
    adapter: erp.name,
    capability: 'optical_power',
    mode: erp.mode,
    execute: async (input) => {
      if (!erp.getOpticalPower) {
        return { status: 'NOT_SUPPORTED', facts: [] };
      }
      const optical = await erp.getOpticalPower(input.contractId);
      if (!optical) {
        return { status: 'NOT_FOUND', facts: [] };
      }
      const diagText =
        optical.assessment === 'EXCELLENT' || optical.assessment === 'GOOD'
          ? 'Potência óptica excelente (-15 a -25 dBm), fibra íntegra sem atenuação'
          : optical.assessment === 'ATTENUATED'
          ? 'Atenuação óptica alta (-26 a -28 dBm) - possível dobra ou sujeira no conector'
          : 'Alarme de LOS / Rompimento de Fibra (sinal óptico ausente)';

      const facts: Fact[] = [
        { path: 'data.optical.rxPower', label: 'Potência Óptica RX da ONU', value: `${optical.rxPower} dBm` },
        { path: 'data.optical.status', label: 'Status da Porta Óptica', value: optical.status },
        { path: 'data.optical.assessment', label: 'Diagnóstico da Fibra', value: diagText },
      ];
      if (optical.txPower !== undefined) {
        facts.push({ path: 'data.optical.txPower', label: 'Potência Óptica TX', value: `${optical.txPower} dBm` });
      }
      return { status: 'OK', data: optical, facts };
    },
  };
}
