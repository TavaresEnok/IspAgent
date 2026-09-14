import { Assertion, Confidence, RunMode } from './common';
import { PolicyDecision } from './policy';

export interface Claim {
  text: string;
  type: Assertion;
  /** Obrigatório para FACT: referências "toolCallId#facts.path". */
  evidence: string[];
}

export type AgentOutcome =
  | 'ANSWERED'
  | 'ACTION_EXECUTED'
  | 'AWAITING_CONFIRMATION'
  | 'BLOCKED'
  | 'HANDOFF';

export interface AgentDecision {
  agentRunId: string;
  tenantId: string;
  conversationId: string;
  intent: string;
  intentConfidence: Confidence;
  identity: {
    customerId: string;
    contractId?: string;
    method: string;
    confidence: Confidence;
    resolvedAt: string;
  } | null;
  toolCalls: string[];
  policyDecisions: PolicyDecision[];
  claims: Claim[];
  outcome: AgentOutcome;
  promptVersion: string;
  model: string;
  mode: RunMode;
}

/** Intenções suportadas (seção 5.3). */
export type Intent =
  | 'SUPORTE_INTERNET'
  | 'SEM_CONEXAO'
  | 'INTERNET_LENTA'
  | 'QUEDAS'
  | 'FINANCEIRO'
  | 'SEGUNDA_VIA'
  | 'PAGAMENTO'
  | 'BLOQUEIO'
  | 'PLANO'
  | 'UPGRADE'
  | 'CONTRATACAO'
  | 'CHAMADO'
  | 'STATUS_CHAMADO'
  | 'CANCELAMENTO'
  | 'OUTRO';
