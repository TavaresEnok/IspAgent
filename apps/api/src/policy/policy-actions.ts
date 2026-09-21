import { RiskTier } from '@ispagent/shared';

/**
 * Catálogo de ações conhecidas pela Policy Engine, com seu tier e (quando aplicável) a flag de
 * `TenantPolicyConfig` que a habilita. Ações não listadas aqui são tratadas como `READ`/permitidas por
 * padrão — a lista cresce conforme novas ferramentas (Fase 5+) entram em operação.
 */
export interface PolicyActionSpec {
  tier: RiskTier;
  /** Nome do campo em TenantPolicyConfig que precisa ser `true`. Ausente = sem flag dedicada (default permitido). */
  configFlag?: 'canCreateTicket' | 'canAccessBilling' | 'canSendInvoice' | 'canPerformUnlock' | 'canQueryPulseISP' | 'canChangePlan';
}

export const POLICY_ACTIONS: Record<string, PolicyActionSpec> = {
  'customer.lookup': { tier: 'READ' },
  'billing.view': { tier: 'READ', configFlag: 'canAccessBilling' },
  'billing.send_invoice': { tier: 'WRITE_LOW_RISK', configFlag: 'canSendInvoice' },
  'support.create_ticket': { tier: 'WRITE_LOW_RISK', configFlag: 'canCreateTicket' },
  'support.get_ticket': { tier: 'READ' },
  'plan.view': { tier: 'READ' },
  'plan.change': { tier: 'WRITE_SENSITIVE', configFlag: 'canChangePlan' },
  'account.unlock': { tier: 'WRITE_SENSITIVE', configFlag: 'canPerformUnlock' },
  'network.diagnostic': { tier: 'READ' },
  'pulseisp.query': { tier: 'READ', configFlag: 'canQueryPulseISP' },
  'knowledge.search': { tier: 'READ' },
  'handoff.create': { tier: 'WRITE_LOW_RISK' },
  // Fora de escopo do MVP (seção 5.5 e 14) — registradas aqui só para a Policy Engine bloquear de
  // forma estática caso um agente algum dia tente propor algo assim; nenhuma ferramenta real as chama.
  'network.provision_vlan': { tier: 'ADMIN' },
  'network.configure_olt': { tier: 'ADMIN' },
};

export function getActionSpec(action: string): PolicyActionSpec {
  return POLICY_ACTIONS[action] ?? { tier: 'READ' };
}
