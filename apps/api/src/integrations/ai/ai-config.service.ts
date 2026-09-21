import { BadRequestException, Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

export type AiProviderName = 'mock' | 'anthropic' | 'gemini' | 'openai';

export const AI_PROVIDER_CATALOG: Array<{
  value: AiProviderName;
  label: string;
  needsApiKey: boolean;
  defaultModel: string | null;
  modelSuggestions: string[];
}> = [
  { value: 'mock', label: 'Mock (DEMO — sem custo, sempre funciona)', needsApiKey: false, defaultModel: null, modelSuggestions: [] },
  {
    value: 'gemini',
    label: 'Google Gemini (tem free tier)',
    needsApiKey: true,
    defaultModel: 'gemini-3.5-flash-lite',
    modelSuggestions: ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite'],
  },
  {
    value: 'anthropic',
    label: 'Anthropic (Claude)',
    needsApiKey: true,
    defaultModel: 'claude-sonnet-5',
    modelSuggestions: ['claude-sonnet-5', 'claude-haiku-4-5-20251001'],
  },
  { value: 'openai', label: 'OpenAI (não implementado nesta sessão)', needsApiKey: true, defaultModel: null, modelSuggestions: [] },
];

export interface AiProviderCardView {
  provider: AiProviderName;
  label: string;
  needsApiKey: boolean;
  defaultModel: string | null;
  modelSuggestions: string[];
  hasApiKey: boolean;
  /** Só início e fim da chave (ex.: "AIza••••wXyZ") — a chave inteira nunca sai do backend. */
  maskedApiKey: string | null;
  model: string | null;
  updatedAt: string | null;
  isActive: boolean;
}

export interface AiConfigOverview {
  /** Provider escolhido pelo admin. */
  active: AiProviderName;
  /** Provider que de fato responde: se o ativo exige chave e não tem, o agente roda no Mock. */
  effective: AiProviderName;
  providers: AiProviderCardView[];
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}

function assertKnownProvider(provider: string): AiProviderName {
  const found = AI_PROVIDER_CATALOG.find((p) => p.value === provider);
  if (!found) throw new BadRequestException(`Provider desconhecido: ${provider}`);
  return found.value;
}

/**
 * Config de IA por tenant (tela "IA" do painel): a credencial de CADA provider fica salva lado a lado
 * (`AiProviderCredential`) e o admin só escolhe qual está ativo (`AiProviderConfig`) — trocar de
 * provider nunca apaga nem mistura a chave dos outros.
 */
@Injectable()
export class AiConfigService {
  constructor(private readonly db: TenantPrismaService) {}

  private async activeName(tenantId: string): Promise<AiProviderName> {
    const row = await this.db.client.aiProviderConfig.findUnique({ where: { tenantId } });
    const known = AI_PROVIDER_CATALOG.find((p) => p.value === row?.provider);
    return known?.value ?? 'mock';
  }

  /** Visão segura pra UI: nunca devolve a chave inteira, só a versão mascarada. */
  async getOverview(tenantId: string): Promise<AiConfigOverview> {
    const [active, credentials] = await Promise.all([
      this.activeName(tenantId),
      this.db.client.aiProviderCredential.findMany({ where: { tenantId } }),
    ]);

    const providers: AiProviderCardView[] = AI_PROVIDER_CATALOG.map((p) => {
      const cred = credentials.find((c) => c.provider === p.value);
      return {
        provider: p.value,
        label: p.label,
        needsApiKey: p.needsApiKey,
        defaultModel: p.defaultModel,
        modelSuggestions: p.modelSuggestions,
        hasApiKey: Boolean(cred?.apiKey),
        maskedApiKey: cred?.apiKey ? maskApiKey(cred.apiKey) : null,
        model: cred?.model ?? null,
        updatedAt: cred?.updatedAt.toISOString() ?? null,
        isActive: p.value === active,
      };
    });

    const activeCard = providers.find((p) => p.isActive)!;
    const effective: AiProviderName = activeCard.needsApiKey && !activeCard.hasApiKey ? 'mock' : active;
    return { active, effective, providers };
  }

  /** Usado pelo resolver — aqui sim precisa da chave de verdade, nunca exposta fora do backend. */
  async getActiveWithCredential(tenantId: string) {
    const provider = await this.activeName(tenantId);
    const credential = await this.getCredential(tenantId, provider);
    return { provider, credential };
  }

  async getCredential(tenantId: string, provider: AiProviderName) {
    return this.db.client.aiProviderCredential.findFirst({ where: { tenantId, provider } });
  }

  /**
   * Salva a chave/modelo de UM provider, sem ativá-lo. `apiKey` em branco mantém a chave já salva
   * daquele mesmo provider (a tela nunca reexibe o valor real); `clearApiKey` remove.
   */
  async saveCredential(
    tenantId: string,
    providerName: string,
    input: { apiKey?: string; model?: string; clearApiKey?: boolean },
  ): Promise<AiConfigOverview> {
    const provider = assertKnownProvider(providerName);
    if (provider === 'mock') {
      throw new BadRequestException('O Mock não tem chave nem modelo para configurar.');
    }

    const existing = await this.getCredential(tenantId, provider);
    const typedKey = input.apiKey?.trim();
    const apiKey = input.clearApiKey ? null : typedKey ? typedKey : (existing?.apiKey ?? null);
    const model = input.model?.trim() || null;

    await this.db.client.aiProviderCredential.upsert({
      where: { tenantId_provider: { tenantId, provider } },
      create: { tenantId, provider, apiKey, model },
      update: { apiKey, model },
    });

    return this.getOverview(tenantId);
  }

  /** Escolhe qual provider responde. Provider que exige chave só pode ser ativado com chave salva. */
  async setActive(tenantId: string, providerName: string): Promise<AiConfigOverview> {
    const provider = assertKnownProvider(providerName);
    const meta = AI_PROVIDER_CATALOG.find((p) => p.value === provider)!;

    if (meta.needsApiKey) {
      const cred = await this.getCredential(tenantId, provider);
      if (!cred?.apiKey) {
        throw new BadRequestException(`Salve a chave de ${meta.label} antes de ativá-lo.`);
      }
    }

    await this.db.client.aiProviderConfig.upsert({
      where: { tenantId },
      create: { tenantId, provider },
      update: { provider },
    });

    return this.getOverview(tenantId);
  }
}
