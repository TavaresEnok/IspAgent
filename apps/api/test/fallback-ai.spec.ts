import { FallbackAIProvider } from '../src/integrations/ai/fallback-ai.provider';
import { MockAIProvider } from '../src/integrations/ai/mock-ai.provider';
import { AIProvider } from '../src/integrations/ai/ai-provider.interface';

function failingLive(): AIProvider & { calls: number } {
  const p = {
    name: 'GeminiProvider',
    mode: 'LIVE' as const,
    model: 'gemini-teste',
    calls: 0,
    async classifyIntent() {
      p.calls++;
      throw new Error('503 alta demanda');
    },
    async composeReply() {
      p.calls++;
      throw new Error('503 alta demanda');
    },
  };
  return p;
}

describe('FallbackAIProvider', () => {
  it('quando a reserva responde, o turno é registrado como reserva, não como a IA que falhou', async () => {
    const ai = new FallbackAIProvider(failingLive(), new MockAIProvider());
    expect(ai.mode).toBe('LIVE');

    await ai.classifyIntent('minha internet está lenta');

    expect(ai.mode).toBe('DEMO');
    expect(ai.model).toBe('rule-based-v1 (reserva de gemini-teste)');
  });

  it('o disjuntor vale entre turnos: depois de uma falha, o turno seguinte nem tenta a IA principal', async () => {
    const live = failingLive();
    const breaker = { openUntil: 0 };

    await new FallbackAIProvider(live, new MockAIProvider(), breaker).classifyIntent('oi');
    expect(live.calls).toBe(1);

    const nextTurn = new FallbackAIProvider(live, new MockAIProvider(), breaker);
    await nextTurn.classifyIntent('minha fatura');
    expect(live.calls).toBe(1);
    expect(nextTurn.mode).toBe('DEMO');
  });
});
