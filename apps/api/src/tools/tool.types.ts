import { ZodType } from 'zod';
import { RunMode, ToolResult, ToolStatus } from '@ispagent/shared';

export interface ToolExecuteOutcome<TOutput> {
  status: Extract<ToolStatus, 'OK' | 'NOT_FOUND' | 'NOT_SUPPORTED'>;
  data?: TOutput;
  facts: ToolResult['facts'];
  error?: { code: string; message: string };
}

/**
 * Definição estática de uma ferramenta (seção 4). `execute` nunca é chamado pelo agente diretamente —
 * só pelo `ToolExecutorService`, depois de validação de schema e da Policy Engine terem passado.
 */
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  /** Chave usada pela Policy Engine (policy-actions.ts) para decidir tier/permissão. */
  action: string;
  inputSchema: ZodType<TInput>;
  adapter: string;
  capability: string;
  mode: RunMode;
  execute: (
    input: TInput,
    ctx: { tenantId: string; idempotencyKey?: string },
  ) => Promise<ToolExecuteOutcome<TOutput>>;
}

export interface ToolRunOptions {
  agentRunId: string;
  idempotencyKey?: string;
  confirmed?: boolean;
  timeoutMs?: number;
}
