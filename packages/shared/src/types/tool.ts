import { RunMode, ToolStatus } from './common';

export interface ToolResult<T = unknown> {
  toolCallId: string;
  tool: string;
  status: ToolStatus;
  source: { adapter: string; mode: RunMode; latencyMs: number; capability: string };
  data?: T;
  /** Fatos citáveis. O agente só pode afirmar o que existir aqui. */
  facts: Array<{ path: string; label: string; value: string | number | boolean | null }>;
  error?: { code: string; message: string };
  idempotencyKey?: string;
}

/** Nomes das ferramentas mínimas exigidas pela seção 4. */
export type ToolName =
  | 'CustomerTool'
  | 'ERPTool'
  | 'BillingTool'
  | 'SupportTool'
  | 'PlanTool'
  | 'NetworkDiagnosticTool'
  | 'KnowledgeTool'
  | 'PulseISPTool'
  | 'HumanHandoffTool';
