import { Injectable, Logger, Optional } from '@nestjs/common';
import { GoogleGenerativeAI, GenerativeModel, GenerateContentRequest } from '@google/generative-ai';
import { AIProvider, ComposeReplyInput, IntentClassification } from './ai-provider.interface';
import { buildReplySystemPrompt, buildReplyUserMessage } from './reply-prompt';
import { CLASSIFY_SYSTEM_PROMPT, parseIntentClassification } from './json-extract';
import { maskPii } from './pii-mask';

// Modelos ultrarrápidos e eficientes para o atendimento (baixa latência e alta cota disponível).
const FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite'];
const TRANSIENT = /\[(429|500|503)\b|overloaded|high demand|UNAVAILABLE|RESOURCE_EXHAUSTED/i;
const QUOTA_EXHAUSTED = /quota exceeded|limit: 20|RESOURCE_EXHAUSTED|too many requests/i;

const GREETING_REGEX = /^\s*(ol[aá]|oi|bom dia|boa tarde|boa noite|opa|eai|ol[aá] tudo bem\??)\s*[!.]*\s*$/i;
const SIMPLE_CONFIRMATION = /^\s*(sim|s|pode|pode sim|quero|claro|ok|okay|beleza|blz|por favor|isso|isso mesmo|n[aã]o|nao|n|agora n[aã]o|obrigad[oa]|valeu|deixa|tudo bem)\s*[!.]*\s*$/i;
const DOCUMENT_ONLY = /^\s*(\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{4,14})\s*$/;

/**
 * Provider real alternativo (seção 6.4) — usa a API do Gemini (Google AI Studio).
 * Otimizado para baixa latência com gemini-3.5-flash-lite (<800ms) e fast-paths locais
 * para cumprimentos e identificadores numéricos sem gastar chamadas de LLM.
 */
import { KEYWORD_RULES } from './mock-ai.provider';

const LLM_TIMEOUT_MS = 3500; // Máximo de 3.5 segundos por chamada

@Injectable()
export class GeminiProvider implements AIProvider {
  readonly name = 'GeminiProvider';
  readonly mode = 'LIVE' as const;
  readonly model: string;

  private readonly logger = new Logger(GeminiProvider.name);
  private readonly clients: Array<{ model: string; client: Pick<GenerativeModel, 'generateContent'> }>;

  constructor(@Optional() opts?: { apiKey?: string; model?: string; client?: Pick<GenerativeModel, 'generateContent'> }) {
    this.model = opts?.model ?? process.env.ISPAGENT_GEMINI_MODEL ?? 'gemini-3.5-flash-lite';
    if (opts?.client) {
      this.clients = [{ model: this.model, client: opts.client }];
    } else {
      const genAI = new GoogleGenerativeAI(opts?.apiKey ?? process.env.ISPAGENT_GEMINI_API_KEY ?? '');
      const models = [this.model, ...FALLBACK_MODELS.filter((m) => m !== this.model)];
      this.clients = models.map((model) => ({ model, client: genAI.getGenerativeModel({ model }) }));
    }
  }

  private async generateWithTimeout(
    client: Pick<GenerativeModel, 'generateContent'>,
    req: GenerateContentRequest,
  ) {
    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Timeout de ${LLM_TIMEOUT_MS}ms excedido na chamada ao Gemini`));
      }, LLM_TIMEOUT_MS);
    });

    try {
      return await Promise.race([client.generateContent(req), timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async generate(req: GenerateContentRequest) {
    let lastErr: unknown;
    for (const [i, { model, client }] of this.clients.entries()) {
      for (let attempt = 0; attempt < (i === 0 ? 2 : 1); attempt++) {
        try {
          return await this.generateWithTimeout(client, req);
        } catch (err) {
          lastErr = err;
          const msg = err instanceof Error ? err.message : String(err);
          if (!TRANSIENT.test(msg) && !msg.includes('Timeout')) throw err;
          // Se for timeout de fila do Google, falha rápido para acionar o FallbackAIProvider em vez de esperar mais modelos
          if (msg.includes('Timeout')) throw err;

          this.logger.warn(`${model} indisponível/lento (${msg.slice(0, 80)}…) — tentando outro modelo.`);
          if (QUOTA_EXHAUSTED.test(msg)) {
            break;
          }
          if (attempt === 0 && i === 0) await new Promise((r) => setTimeout(r, 300));
        }
      }
    }
    throw lastErr;
  }

  async classifyIntent(message: string): Promise<IntentClassification> {
    const trimmed = message.trim();

    // 1. Fast-path: mensagens triviais de 0ms
    if (GREETING_REGEX.test(trimmed)) {
      return { intent: 'OUTRO', confidence: 'HIGH' };
    }
    if (SIMPLE_CONFIRMATION.test(trimmed)) {
      return { intent: 'OUTRO', confidence: 'MEDIUM' };
    }
    if (DOCUMENT_ONLY.test(trimmed)) {
      return { intent: 'OUTRO', confidence: 'LOW' };
    }

    // 2. Fast-path: verificar palavras-chave óbvias do provedor em 0.01ms (ex.: "meu plano", "fatura", "sem internet")
    const lower = trimmed.toLowerCase();
    for (const rule of KEYWORD_RULES) {
      if (rule.keywords.some((kw) => lower.includes(kw))) {
        return { intent: rule.intent, confidence: 'HIGH' };
      }
    }

    // 3. Somente se não houver palavra-chave clara, consulta o modelo externo com timeout estrito
    try {
      const result = await this.generate({
        contents: [{ role: 'user', parts: [{ text: maskPii(message) }] }],
        systemInstruction: { role: 'system', parts: [{ text: CLASSIFY_SYSTEM_PROMPT }] },
        generationConfig: { responseMimeType: 'application/json' },
      });

      return parseIntentClassification(result.response.text());
    } catch (err) {
      this.logger.error(`classifyIntent falhou: ${err instanceof Error ? err.message : err}`);
      throw err;
    }
  }

  async composeReply(input: ComposeReplyInput): Promise<string> {
    // Fast-path: respostas estruturadas de solicitação de identificação (0ms, sem gastar LLM)
    if (input.cpfNotFound) {
      return `Não encontrei nenhum cadastro ativo com o documento ou código "${input.cpfNotFound}". Por favor, confira os números digitados ou informe o CPF do titular da assinatura.`;
    }
    if (input.needsCpf) {
      const greeting = input.customerName ? `Olá, ${input.customerName}! ` : '';
      return `${greeting}Para que eu possa verificar as informações da sua assinatura e consultar o seu plano ou conexão, por favor, digite o seu CPF ou CNPJ.`;
    }

    try {
      const result = await this.generate({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: buildReplyUserMessage(input),
              },
            ],
          },
        ],
        systemInstruction: { role: 'system', parts: [{ text: buildReplySystemPrompt(input.providerName) }] },
        ...(input.maxOutputTokens ? { generationConfig: { maxOutputTokens: input.maxOutputTokens } } : {}),
      });

      return result.response.text().trim();
    } catch (err) {
      this.logger.error(`composeReply falhou: ${err instanceof Error ? err.message : err}`);
      throw err;
    }
  }
}
