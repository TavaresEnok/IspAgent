import { Injectable, Logger } from '@nestjs/common';
import { AI_PROVIDER_CATALOG, AiConfigService, AiProviderName } from './ai-config.service';
import { AIProvider } from './ai-provider.interface';
import { MockAIProvider } from './mock-ai.provider';
import { AnthropicProvider } from './anthropic.provider';
import { GeminiProvider } from './gemini.provider';
import { OpenAIProvider } from './openai.provider';
import { FallbackAIProvider } from './fallback-ai.provider';

export interface AiConnectionTestResult {
  ok: boolean;
  provider: AiProviderName;
  model: string | null;
  latencyMs: number;
  /** Só quando ok: o que o provider respondeu à mensagem de teste (prova que a chamada real funcionou). */
  sample?: { intent: string; confidence: string };
  /** Só quando !ok: mensagem do erro, já sem a chave. */
  error?: string;
}

const TEST_TIMEOUT_MS = 20_000;
const TEST_MESSAGE = 'minha internet caiu desde ontem à noite';

/**
 * Resolve o `AIProvider` ativo PARA CADA TURNO, lendo a config do tenant no banco (tela "IA" do
 * painel) em vez de uma escolha fixa no boot do processo via env var — é isso que permite trocar de
 * provider e colar uma chave nova pela UI sem reiniciar o container.
 *
 * Mesma garantia de sempre (seção 6.4): nunca falha o turno por falta de credencial — sem chave
 * configurada, cai pra `MockAIProvider` (DEMO), nunca um erro pro cliente.
 */
@Injectable()
export class AiProviderResolverService {
  private readonly logger = new Logger(AiProviderResolverService.name);

  constructor(
    private readonly config: AiConfigService,
    private readonly mock: MockAIProvider,
  ) {}

  async resolve(tenantId: string): Promise<AIProvider> {
    const { provider, credential } = await this.config.getActiveWithCredential(tenantId);

    if (provider === 'mock') return this.mock;

    if (provider !== 'openai' && !credential?.apiKey) {
      this.logger.warn(`Tenant ${tenantId}: provider '${provider}' ativo sem chave salva — usando MockAIProvider.`);
      return this.mock;
    }

    const primary = this.build(provider, { apiKey: credential?.apiKey ?? undefined, model: credential?.model ?? undefined });
    return new FallbackAIProvider(primary, this.mock);
  }

  /** Monta uma instância para um provider específico com a chave/modelo dados (não toca no banco). */
  build(provider: AiProviderName, opts: { apiKey?: string; model?: string }): AIProvider {
    switch (provider) {
      case 'anthropic':
        return new AnthropicProvider(opts);
      case 'gemini':
        return new GeminiProvider(opts);
      case 'openai':
        // Sempre lança em runtime (não implementado) — o orquestrador trata isso como falha de AI
        // Provider (escala pra humano, nunca inventa) e o botão "Testar" mostra o erro.
        return new OpenAIProvider();
      default:
        return this.mock;
    }
  }

  /**
   * Botão "Testar" da tela "IA": faz UMA chamada real ao provider (classifica uma mensagem de exemplo)
   * com a chave/modelo salvos — ou com os valores digitados na tela, antes de salvar. Prova que a
   * chave, o modelo e o formato da resposta funcionam de verdade, em vez de só "salvou sem erro".
   */
  async testConnection(
    tenantId: string,
    provider: AiProviderName,
    overrides: { apiKey?: string; model?: string } = {},
  ): Promise<AiConnectionTestResult> {
    const meta = AI_PROVIDER_CATALOG.find((p) => p.value === provider);
    const saved = await this.config.getCredential(tenantId, provider);
    const apiKey = overrides.apiKey?.trim() || saved?.apiKey || undefined;
    const model = overrides.model?.trim() || saved?.model || meta?.defaultModel || undefined;

    if (meta?.needsApiKey && !apiKey) {
      return {
        ok: false,
        provider,
        model: model ?? null,
        latencyMs: 0,
        error: 'Nenhuma chave salva nem digitada para este provider.',
      };
    }

    const ai = this.build(provider, { apiKey, model });
    const startedAt = Date.now();
    let timer: NodeJS.Timeout | undefined;

    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Sem resposta em ${TEST_TIMEOUT_MS / 1000}s.`)), TEST_TIMEOUT_MS);
      });
      const result = await Promise.race([ai.classifyIntent(TEST_MESSAGE), timeout]);
      return {
        ok: true,
        provider,
        model: ai.model,
        latencyMs: Date.now() - startedAt,
        sample: { intent: result.intent, confidence: result.confidence },
      };
    } catch (err) {
      return {
        ok: false,
        provider,
        model: ai.model,
        latencyMs: Date.now() - startedAt,
        error: sanitizeError(err, apiKey),
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

/** Nunca devolve a chave numa mensagem de erro, mesmo que o SDK a inclua. */
function sanitizeError(err: unknown, apiKey?: string): string {
  let message = err instanceof Error ? err.message : String(err);
  if (apiKey) message = message.split(apiKey).join('***');
  // O SDK do Gemini anexa um JSON técnico depois da frase legível ("... [400 Bad Request] API key not
  // valid. [{"@type":...}]") — só a frase interessa a quem clica em "Testar".
  message = message.split(' [{')[0];
  return message.slice(0, 400);
}
