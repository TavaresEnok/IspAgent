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
        facts.push(
          { path: 'data.latestInvoice.status', label: 'Status da última fatura', value: latest.status },
          { path: 'data.latestInvoice.dueDate', label: 'Vencimento da última fatura', value: latest.dueDate },
          { path: 'data.latestInvoice.amountCents', label: 'Valor da última fatura (centavos)', value: latest.amountCents },
        );
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
      const contracts = await erp.getContracts(input.customerId);
      const active = contracts.filter((c) => c.status === 'ACTIVE');
      const facts = active.map((c) => ({
        path: `data.contracts[${c.id}].planName`,
        label: `Plano do contrato ${c.id}`,
        value: c.planName,
      }));
      return { status: 'OK', data: { contracts: active }, facts };
    },
  };
}
