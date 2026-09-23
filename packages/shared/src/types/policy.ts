import { RiskTier } from './common';

export interface PolicyDecision {
  action: string;
  tier: RiskTier;
  allowed: boolean;
  requiresConfirmation: boolean;
  reason: string;
  policyVersion: string;
  tenantId: string;
  evaluatedAt: string;
}

/** Configuração de policy por tenant (seção 4). */
export interface TenantPolicyConfig {
  policyVersion: string;
  readOnlyMode?: boolean;
  canCreateTicket: boolean;
  canAccessBilling: boolean;
  canSendInvoice: boolean;
  canPerformUnlock: boolean;
  requiresConfirmationForUnlock: boolean;
  canQueryPulseISP: boolean;
  canChangePlan: boolean;
  maxToolCallsPerTurn: number;
  maxTokensPerTurn: number;
  handoffAfterFailures: number;
  companyName?: string;
  assistantName?: string;
  tone?: string;
  customRules?: string;
  supportHours?: string;
}

export const DEFAULT_TENANT_POLICY_CONFIG: Omit<TenantPolicyConfig, 'policyVersion'> = {
  readOnlyMode: false,
  canCreateTicket: true,
  canAccessBilling: true,
  canSendInvoice: true,
  canPerformUnlock: false,
  requiresConfirmationForUnlock: true,
  canQueryPulseISP: true,
  canChangePlan: false,
  maxToolCallsPerTurn: 8,
  maxTokensPerTurn: 6000,
  handoffAfterFailures: 3,
  companyName: 'Vibe Telecom',
  assistantName: 'Assistente Virtual',
  tone: 'caloroso, educado, empático e resolutivo (2 a 4 frases)',
  supportHours: 'Segunda a Sexta, 08h às 18h',
};
