import { Injectable } from '@nestjs/common';
import { DEFAULT_TENANT_POLICY_CONFIG, PolicyDecision, RiskTier } from '@ispagent/shared';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { currentTenantId } from '../common/tenant-context';
import { getActionSpec } from './policy-actions';

/**
 * Policy Engine (seção 4): o modelo propõe, a Policy Engine decide (princípio 1.6). Nunca é o LLM quem
 * decide se uma ação executa — este serviço é chamado pelo pipeline de execução de ferramentas
 * (tool-executor.service.ts) ANTES de qualquer adapter externo ser tocado.
 */
@Injectable()
export class PolicyEngineService {
  constructor(private readonly db: TenantPrismaService) {}

  async evaluate(action: string, opts: { confirmed?: boolean } = {}): Promise<PolicyDecision> {
    const tenantId = currentTenantId();
    if (!tenantId) {
      throw new Error('[policy-engine] avaliação de policy requer contexto de tenant ativo.');
    }

    const spec = getActionSpec(action);
    const base = {
      action,
      tier: spec.tier,
      tenantId,
      evaluatedAt: new Date().toISOString(),
    };

    // Seção 5.5: ADMIN é bloqueado no MVP, sem exceção e sem depender de configuração de tenant.
    if (spec.tier === 'ADMIN') {
      return {
        ...base,
        allowed: false,
        requiresConfirmation: false,
        reason: 'Ações ADMIN estão bloqueadas no MVP (seção 5.5) — sem exceção por tenant.',
        policyVersion: 'static-admin-block',
      };
    }

    const config = await this.getConfig(tenantId);

    // Modo Somente Leitura: proíbe sumariamente qualquer mutação/criação/O.S. (tier !== READ)
    if (config.readOnlyMode && spec.tier !== 'READ') {
      return {
        ...base,
        allowed: false,
        requiresConfirmation: false,
        reason: `Modo somente leitura ativo pela policy do tenant. Nenhuma alteração, criação ou abertura de O.S. permitida.`,
        policyVersion: config.policyVersion,
      };
    }

    if (spec.configFlag && !config[spec.configFlag]) {
      return {
        ...base,
        allowed: false,
        requiresConfirmation: false,
        reason: `Ação "${action}" desabilitada pela policy do tenant (${spec.configFlag}=false).`,
        policyVersion: config.policyVersion,
      };
    }

    const requiresConfirmation = this.requiresConfirmation(action, spec.tier, config);
    if (requiresConfirmation && !opts.confirmed) {
      return {
        ...base,
        allowed: true,
        requiresConfirmation: true,
        reason: `Ação "${action}" (tier ${spec.tier}) exige confirmação explícita antes de executar.`,
        policyVersion: config.policyVersion,
      };
    }

    return {
      ...base,
      allowed: true,
      requiresConfirmation: false,
      reason: 'Permitido pela policy do tenant.',
      policyVersion: config.policyVersion,
    };
  }

  private requiresConfirmation(
    action: string,
    tier: RiskTier,
    config: Awaited<ReturnType<PolicyEngineService['getConfig']>>,
  ): boolean {
    if (tier !== 'WRITE_SENSITIVE') return false;
    if (action === 'account.unlock') return config.requiresConfirmationForUnlock;
    // Qualquer outra ação WRITE_SENSITIVE exige confirmação por padrão (seção 5.5), mesmo sem uma
    // flag dedicada — o tier já é o sinal.
    return true;
  }

  private async getConfig(tenantId: string) {
    const stored = await this.db.client.tenantPolicyConfig.findUnique({ where: { tenantId } });
    if (stored) return stored;
    // Tenant sem policy config explícita (não deveria acontecer com o seed, mas é um estado válido para
    // um tenant recém-criado): usa o default da seção 4, nunca bloqueia por ausência de configuração.
    return { tenantId, ...DEFAULT_TENANT_POLICY_CONFIG, policyVersion: 'v1', updatedAt: new Date() };
  }
}
