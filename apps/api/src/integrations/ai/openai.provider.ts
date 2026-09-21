import { Injectable } from '@nestjs/common';
import { AIProvider, ComposeReplyInput, IntentClassification } from './ai-provider.interface';

/**
 * Estruturado, não implementado nesta sessão (DECISIONS.md, 2026-09-14: só uma chave real seria
 * validada, e a Anthropic é o caminho testável aqui). Nunca deve ser selecionado por
 * `AiProviderModule` a menos que alguém complete a implementação — chamar qualquer método aqui é
 * sempre um erro explícito, nunca um resultado fabricado.
 */
@Injectable()
export class OpenAIProvider implements AIProvider {
  readonly name = 'OpenAIProvider';
  readonly mode = 'LIVE' as const;
  readonly model = process.env.ISPAGENT_OPENAI_MODEL ?? 'not-configured';

  async classifyIntent(): Promise<IntentClassification> {
    throw new Error('[OpenAIProvider] não implementado nesta sessão — use ISPAGENT_AI_PROVIDER=anthropic ou mock.');
  }

  async composeReply(_input: ComposeReplyInput): Promise<string> {
    throw new Error('[OpenAIProvider] não implementado nesta sessão — use ISPAGENT_AI_PROVIDER=anthropic ou mock.');
  }
}
