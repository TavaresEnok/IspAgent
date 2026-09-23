import { Module } from '@nestjs/common';
import { MockAIProvider } from './mock-ai.provider';
import { AnthropicProvider } from './anthropic.provider';
import { GeminiProvider } from './gemini.provider';
import { OpenAIProvider } from './openai.provider';
import { AiConfigService } from './ai-config.service';
import { AiConfigController } from './ai-config.controller';
import { AiProviderResolverService } from './ai-provider-resolver.service';

/**
 * `AiProviderResolverService` resolve o provider ativo POR TENANT, lendo `AiProviderConfig` do banco
 * (tela "IA" do painel) — substituiu a escolha fixa no boot via `AI_PROVIDER`/env var, porque o
 * usuário pediu explicitamente para trocar de provider e colar a chave sem editar `.env` nem
 * reiniciar o container.
 */
@Module({
  controllers: [AiConfigController],
  providers: [MockAIProvider, AnthropicProvider, GeminiProvider, OpenAIProvider, AiConfigService, AiProviderResolverService],
  exports: [AiConfigService, AiProviderResolverService],
})
export class AiProviderModule {}
