import { Module } from '@nestjs/common';
import { AI_PROVIDER } from './ai-provider.interface';
import { MockAIProvider } from './mock-ai.provider';
import { AnthropicProvider } from './anthropic.provider';
import { OpenAIProvider } from './openai.provider';

/**
 * Seleciona o AIProvider ativo. Sem `ISPAGENT_ANTHROPIC_API_KEY`, cai para `MockAIProvider` sempre —
 * nunca falha o boot por falta de credencial de IA (seção 6.4).
 */
@Module({
  providers: [
    MockAIProvider,
    AnthropicProvider,
    OpenAIProvider,
    {
      provide: AI_PROVIDER,
      useFactory: (mock: MockAIProvider, anthropic: AnthropicProvider, openai: OpenAIProvider) => {
        const configured = process.env.ISPAGENT_AI_PROVIDER ?? 'anthropic';
        const hasAnthropicKey = Boolean(process.env.ISPAGENT_ANTHROPIC_API_KEY);

        if (configured === 'openai') return openai;
        if (configured === 'anthropic' && hasAnthropicKey) return anthropic;
        return mock;
      },
      inject: [MockAIProvider, AnthropicProvider, OpenAIProvider],
    },
  ],
  exports: [AI_PROVIDER],
})
export class AiProviderModule {}
