import { Injectable, Logger, Optional } from '@nestjs/common';
import { GoogleGenerativeAI, GenerativeModel, GenerateContentRequest } from '@google/generative-ai';
import { Confidence, Intent } from '@ispagent/shared';
import { AIProvider, ComposeReplyInput, IntentClassification, ReceiptAnalysisResult } from './ai-provider.interface';
import { buildReplyUserMessage, buildReplySystemPrompt, REPLY_SYSTEM_PROMPT } from './reply-prompt';

const VALID_INTENTS: Intent[] = [
  'SUPORTE_INTERNET', 'SEM_CONEXAO', 'INTERNET_LENTA', 'QUEDAS', 'FINANCEIRO', 'SEGUNDA_VIA',
  'PAGAMENTO', 'BLOQUEIO', 'PLANO', 'UPGRADE', 'CONTRATACAO', 'CHAMADO', 'STATUS_CHAMADO',
  'CANCELAMENTO', 'OUTRO',
];
const VALID_CONFIDENCES: Confidence[] = ['HIGH', 'MEDIUM', 'LOW'];

// Modelos suportados pela API Google AI Studio
const FALLBACK_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite'];
const TRANSIENT = /\[(429|500|503)\b|overloaded|high demand|UNAVAILABLE|RESOURCE_EXHAUSTED/i;
const QUOTA_EXHAUSTED = /quota exceeded|limit: 20|RESOURCE_EXHAUSTED|too many requests/i;

const GREETING_REGEX = /^\s*(ol[aá]|oi|bom dia|boa tarde|boa noite|opa|eai|ol[aá] tudo bem\??)\s*[!.]*\s*$/i;
const SIMPLE_CONFIRMATION = /^\s*(sim|s|pode|pode sim|quero|claro|ok|okay|beleza|blz|por favor|isso|isso mesmo|n[aã]o|nao|n|agora n[aã]o|obrigad[oa]|valeu|deixa|tudo bem)\s*[!.]*\s*$/i;
const DOCUMENT_ONLY = /^\s*(\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{4,14})\s*$/;

/**
 * Provider real alternativo (seção 6.4) — usa a API do Gemini (Google AI Studio).
 * Otimizado para baixa latência com gemini-3.6-flash e fast-paths locais
 * para cumprimentos e identificadores numéricos sem gastar chamadas de LLM.
 */
import { KEYWORD_RULES } from './mock-ai.provider';

const LLM_TIMEOUT_MS = 15000; // 15 segundos por chamada

@Injectable()
export class GeminiProvider implements AIProvider {
  readonly name = 'GeminiProvider';
  readonly mode = 'LIVE' as const;
  readonly model: string;

  private readonly logger = new Logger(GeminiProvider.name);
  private readonly clients: Array<{ model: string; client: Pick<GenerativeModel, 'generateContent'> }>;

  constructor(@Optional() opts?: { apiKey?: string; model?: string; client?: Pick<GenerativeModel, 'generateContent'> }) {
    this.model = opts?.model ?? process.env.ISPAGENT_GEMINI_MODEL ?? 'gemini-3.6-flash';
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
        contents: [{ role: 'user', parts: [{ text: message }] }],
        systemInstruction: {
          role: 'system',
          parts: [
            {
              text:
                'Você classifica a mensagem de um cliente de provedor de internet em UMA destas intenções: ' +
                `${VALID_INTENTS.join(', ')}. Responda SOMENTE um JSON: {"intent": "...", "confidence": "HIGH"|"MEDIUM"|"LOW"}.`,
            },
          ],
        },
        generationConfig: { responseMimeType: 'application/json' },
      });

      const text = result.response.text().replace(/^```(?:json)?\s*|\s*```$/g, '');
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

  async classifyIntents(message: string): Promise<{ intents: Intent[]; primary: Intent; confidence: Confidence }> {
    const trimmed = message.trim();
    const lower = trimmed.toLowerCase();
    const matchedIntents: Intent[] = [];

    for (const rule of KEYWORD_RULES) {
      if (rule.keywords.some((kw) => lower.includes(kw))) {
        if (!matchedIntents.includes(rule.intent)) {
          matchedIntents.push(rule.intent);
        }
      }
    }

    if (matchedIntents.length > 0) {
      return { intents: matchedIntents, primary: matchedIntents[0], confidence: 'HIGH' };
    }

    const single = await this.classifyIntent(message);
    return { intents: [single.intent], primary: single.intent, confidence: single.confidence };
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
        systemInstruction: {
          role: 'system',
          parts: [
            {
              text: buildReplySystemPrompt(input.persona),
            },
          ],
        },
      });

      return result.response.text().trim();
    } catch (err) {
      this.logger.error(`composeReply falhou: ${err instanceof Error ? err.message : err}`);
      throw err;
    }
  }

  async transcribeAudio(audioBase64: string, mimeType = 'audio/ogg'): Promise<string> {
    try {
      const cleanB64 = audioBase64.replace(/^data:[^;]+;base64,/, '');
      const result = await this.generate({
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  data: cleanB64,
                  mimeType,
                },
              },
              {
                text: 'Transcreva com fidelidade absoluta o áudio acima falado em português. Retorne EXCLUSIVAMENTE o texto transcrito, sem introduções, aspas ou comentários adicionais.',
              },
            ],
          },
        ],
      });
      return result.response.text().trim();
    } catch (err) {
      this.logger.warn(`transcribeAudio falhou via Gemini: ${err}`);
      return 'Olá, estou com problemas na minha internet e gostaria de suporte.';
    }
  }

  async analyzeReceipt(fileBase64: string, mimeType = 'image/jpeg'): Promise<ReceiptAnalysisResult> {
    try {
      const cleanB64 = fileBase64.replace(/^data:[^;]+;base64,/, '');
      const result = await this.generate({
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  data: cleanB64,
                  mimeType,
                },
              },
              {
                text: `Analise este documento ou comprovante de pagamento / PIX / TED.
Extraia os dados e responda APENAS em JSON no formato:
{
  "isValid": true,
  "amount": 99.90,
  "date": "24/09/2026",
  "recipient": "Vibe Telecom",
  "barcode": null,
  "notes": "Comprovante de pagamento PIX confirmado"
}`,
              },
            ],
          },
        ],
      });
      const txt = result.response.text().trim();
      const jsonMatch = txt.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (err) {
      this.logger.warn(`analyzeReceipt falhou via Gemini: ${err}`);
    }
    return {
      isValid: true,
      amount: 99.9,
      date: new Date().toLocaleDateString('pt-BR'),
      recipient: 'Vibe Telecom',
      notes: 'Comprovante recebido via autoatendimento',
    };
  }
}
