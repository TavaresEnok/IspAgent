import { z } from 'zod';
import { ToolDefinition } from '../../src/tools/tool.types';

/**
 * Ferramentas fictícias só para exercitar o pipeline (schema → policy → confirmação → execução →
 * auditoria → idempotência) isoladamente da Fase 5 (ERP real). Cada fábrica devolve uma definição nova
 * com `execute` espiada (`jest.fn`), para que os testes possam afirmar "a ferramenta NÃO foi chamada"
 * quando a policy bloqueia (evidência de P0.6) ou "foi chamada exatamente uma vez" (idempotência).
 */

export function makeLookupTool() {
  const execute = jest.fn(async (input: { id: string }) => ({
    status: 'OK' as const,
    data: { id: input.id, name: `Cliente ${input.id}` },
    facts: [{ path: 'data.name', label: 'Nome', value: `Cliente ${input.id}` }],
  }));

  const def: ToolDefinition<{ id: string }, { id: string; name: string }> = {
    name: 'TestLookupTool',
    action: 'customer.lookup',
    inputSchema: z.object({ id: z.string().min(1) }),
    adapter: 'test-fixture',
    capability: 'lookup',
    mode: 'DEMO',
    execute,
  };

  return { def, execute };
}

export function makeCreateTicketTool() {
  const execute = jest.fn(async (input: { description: string }) => ({
    status: 'OK' as const,
    data: { ticketId: 'tkt_fixture_1' },
    facts: [{ path: 'data.ticketId', label: 'Chamado', value: 'tkt_fixture_1' }],
  }));

  const def: ToolDefinition<{ description: string }, { ticketId: string }> = {
    name: 'TestCreateTicketTool',
    action: 'support.create_ticket',
    inputSchema: z.object({ description: z.string().min(1) }),
    adapter: 'test-fixture',
    capability: 'create_ticket',
    mode: 'DEMO',
    execute,
  };

  return { def, execute };
}

export function makeUnlockTool() {
  const execute = jest.fn(async (input: { contractId: string }) => ({
    status: 'OK' as const,
    data: { unlocked: true, contractId: input.contractId },
    facts: [{ path: 'data.unlocked', label: 'Desbloqueado', value: true }],
  }));

  const def: ToolDefinition<{ contractId: string }, { unlocked: boolean; contractId: string }> = {
    name: 'TestUnlockTool',
    action: 'account.unlock',
    inputSchema: z.object({ contractId: z.string().min(1) }),
    adapter: 'test-fixture',
    capability: 'unlock',
    mode: 'DEMO',
    execute,
  };

  return { def, execute };
}
