import { AIProvider } from '../../src/integrations/ai/ai-provider.interface';
import { AiProviderResolverService } from '../../src/integrations/ai/ai-provider-resolver.service';

/**
 * `AgentOrchestratorService` recebe um `AiProviderResolverService` (resolve o provider por turno, a
 * partir do banco) em vez de um `AIProvider` fixo injetado no boot. Testes que querem um provider
 * fixo e conhecido (MockAIProvider, um double de falha, etc.) usam isto em vez de bater no banco.
 */
export function fixedAiResolver(ai: AIProvider): AiProviderResolverService {
  return { resolve: async () => ai } as unknown as AiProviderResolverService;
}
