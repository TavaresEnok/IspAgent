import { Injectable, Logger, Optional } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AIProvider, ComposeReplyInput, IntentClassification } from './ai-provider.interface';
import { buildReplySystemPrompt, buildReplyUserMessage } from './reply-prompt';
import { CLASSIFY_SYSTEM_PROMPT, parseIntentClassification } from './json-extract';
import { maskPii } from './pii-mask';

// Uma chamada lenta não pode segurar o turno do cliente por minutos (o padrão do SDK é 10 min).
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_RETRIES = 1;
const MAX_REPLY_TOKENS = 400;

/**
 * Provider real (seção 6.4) — documentação oficial da Anthropic é a única validável com confiança
 * nesta sessão. Falha em runtime (chave ausente, erro de rede, resposta malformada): registra e propaga
 * — quem decide o fallback para DEMO é quem resolve o provider (`AiProviderResolverService`, por
 * ausência de chave), não este provider silenciosamente inventando uma resposta.
 *
 * `opts.apiKey`/`opts.model` (quando passados) sobrescrevem as env vars — é assim que o
 * `AiProviderResolverService` monta uma instância com a chave configurada pela tela "IA" do painel
 * (banco), em vez de depender de `ISPAGENT_ANTHROPIC_API_KEY` fixado no boot do processo.
 */
@Injectable()
export class AnthropicProvider implements AIProvider {
  readonly name = 'AnthropicProvider';
  readonly mode = 'LIVE' as const;
  readonly model: string;

  private readonly logger = new Logger(AnthropicProvider.name);
  private readonly client: Pick<Anthropic, 'messages'>;

  constructor(@Optional() opts?: { apiKey?: string; model?: string; client?: Pick<Anthropic, 'messages'> }) {
    this.model = opts?.model ?? process.env.ISPAGENT_ANTHROPIC_MODEL ?? 'claude-sonnet-5';
    this.client = opts?.client ?? new Anthropic({
        apiKey: opts?.apiKey ?? process.env.ISPAGENT_ANTHROPIC_API_KEY,
        timeout: REQUEST_TIMEOUT_MS,
        maxRetries: MAX_RETRIES,
      });
  }

  async classifyIntent(message: string): Promise<IntentClassification> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 100,
        system: CLASSIFY_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: maskPii(message) }],
      });

      return parseIntentClassification(this.extractText(response));
    } catch (err) {
      this.logger.error(`classifyIntent falhou: ${err instanceof Error ? err.message : err}`);
      throw err;
    }
  }

  async composeReply(input: ComposeReplyInput): Promise<string> {
    try {

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: Math.min(MAX_REPLY_TOKENS, input.maxOutputTokens ?? MAX_REPLY_TOKENS),
        system: buildReplySystemPrompt(input.providerName),
        messages: [
          {
            role: 'user',
            content: buildReplyUserMessage(input),
          },
        ],
      });

      return this.extractText(response);
    } catch (err) {
      this.logger.error(`composeReply falhou: ${err instanceof Error ? err.message : err}`);
      throw err;
    }
  }

  private extractText(response: Anthropic.Message): string {
    const block = response.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') {
      throw new Error('Resposta da Anthropic sem bloco de texto.');
    }
    return block.text.trim();
  }
}
