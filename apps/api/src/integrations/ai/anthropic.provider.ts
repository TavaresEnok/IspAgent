import { Injectable, Logger, Optional } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { Confidence, Intent } from '@ispagent/shared';
import { AIProvider, ComposeReplyInput, IntentClassification } from './ai-provider.interface';

const VALID_INTENTS: Intent[] = [
  'SUPORTE_INTERNET', 'SEM_CONEXAO', 'INTERNET_LENTA', 'QUEDAS', 'FINANCEIRO', 'SEGUNDA_VIA',
  'PAGAMENTO', 'BLOQUEIO', 'PLANO', 'UPGRADE', 'CONTRATACAO', 'CHAMADO', 'STATUS_CHAMADO',
  'CANCELAMENTO', 'OUTRO',
];
const VALID_CONFIDENCES: Confidence[] = ['HIGH', 'MEDIUM', 'LOW'];

/**
 * Provider real (seção 6.4) — documentação oficial da Anthropic é a única validável com confiança
 * nesta sessão. Falha em runtime (chave ausente, erro de rede, resposta malformada): registra e propaga
 * — quem decide o fallback para DEMO é `AiProviderModule` (por ausência de chave), não este provider
 * silenciosamente inventando uma resposta.
 */
@Injectable()
export class AnthropicProvider implements AIProvider {
  readonly name = 'AnthropicProvider';
  readonly mode = 'LIVE' as const;
  readonly model: string;

  private readonly logger = new Logger(AnthropicProvider.name);
  private readonly client: Pick<Anthropic, 'messages'>;

  constructor(@Optional() client?: Pick<Anthropic, 'messages'>) {
    this.model = process.env.ISPAGENT_ANTHROPIC_MODEL ?? 'claude-sonnet-5';
    this.client = client ?? new Anthropic({ apiKey: process.env.ISPAGENT_ANTHROPIC_API_KEY });
  }

  async classifyIntent(message: string): Promise<IntentClassification> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 100,
        system:
          'Você classifica a mensagem de um cliente de provedor de internet em UMA destas intenções: ' +
          `${VALID_INTENTS.join(', ')}. Responda SOMENTE um JSON: {"intent": "...", "confidence": "HIGH"|"MEDIUM"|"LOW"}.`,
        messages: [{ role: 'user', content: message }],
      });

      const text = this.extractText(response);
      const parsed = JSON.parse(text) as { intent: string; confidence: string };

      const intent = VALID_INTENTS.includes(parsed.intent as Intent) ? (parsed.intent as Intent) : 'OUTRO';
      const confidence = VALID_CONFIDENCES.includes(parsed.confidence as Confidence)
        ? (parsed.confidence as Confidence)
        : 'LOW';

      return { intent, confidence };
    } catch (err) {
      this.logger.error(`classifyIntent falhou: ${err instanceof Error ? err.message : err}`);
      throw err;
    }
  }

  async composeReply(input: ComposeReplyInput): Promise<string> {
    try {
      const factsList = input.facts.map((f) => `- ${f.label}: ${String(f.value)}`).join('\n') || '(nenhum fato disponível)';

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 300,
        system:
          'Você é um agente de atendimento de um provedor de internet. Responda em português, de forma ' +
          'curta e direta, usando APENAS os fatos fornecidos abaixo. NUNCA afirme algo que não esteja na ' +
          'lista de fatos. Se a lista estiver vazia, diga que não encontrou informação suficiente e que vai ' +
          'encaminhar para um atendente humano.',
        messages: [
          {
            role: 'user',
            content: `Intenção: ${input.intent}\nCliente: ${input.customerName ?? 'não identificado'}\nStatus da ferramenta: ${input.toolStatus ?? 'OK'}\nFatos:\n${factsList}`,
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
