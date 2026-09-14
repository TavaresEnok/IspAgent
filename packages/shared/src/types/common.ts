/**
 * Contratos normativos (seção 3.4 do prompt de execução).
 * Nomes de campo podem crescer, nunca encolher nem mudar de semântica.
 */

export type RiskTier = 'READ' | 'WRITE_LOW_RISK' | 'WRITE_SENSITIVE' | 'ADMIN';

export type Assertion = 'FACT' | 'INFERENCE' | 'RECOMMENDATION' | 'UNKNOWN';

export type RunMode = 'LIVE' | 'DEMO';

export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type ToolStatus =
  | 'OK'
  | 'NOT_FOUND'
  | 'UNAUTHENTICATED'
  | 'BLOCKED_BY_POLICY'
  | 'NEEDS_CONFIRMATION'
  | 'NOT_SUPPORTED'
  | 'UPSTREAM_ERROR'
  | 'TIMEOUT';
