import { Confidence, Intent } from '@ispagent/shared';
import { IntentClassification } from './ai-provider.interface';

export const VALID_INTENTS: Intent[] = [
  'SUPORTE_INTERNET', 'SEM_CONEXAO', 'INTERNET_LENTA', 'QUEDAS', 'FINANCEIRO', 'SEGUNDA_VIA',
  'PAGAMENTO', 'BLOQUEIO', 'PLANO', 'UPGRADE', 'CONTRATACAO', 'CHAMADO', 'STATUS_CHAMADO',
  'CANCELAMENTO', 'OUTRO',
];
const VALID_CONFIDENCES: Confidence[] = ['HIGH', 'MEDIUM', 'LOW'];

export const CLASSIFY_SYSTEM_PROMPT =
  'Você classifica a mensagem de um cliente de provedor de internet em UMA destas intenções: ' +
  `${VALID_INTENTS.join(', ')}. Responda SOMENTE um JSON: {"intent": "...", "confidence": "HIGH"|"MEDIUM"|"LOW"}.`;

/**
 * Extrai o objeto JSON de uma resposta de modelo mesmo quando vem cercado de ```json ... ``` ou de texto
 * solto. Lança se não houver um objeto JSON válido.
 */
export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*|\s*```$/gi, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('Resposta do modelo sem objeto JSON.');
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

export function parseIntentClassification(text: string): IntentClassification {
  const parsed = extractJsonObject(text) as { intent?: string; confidence?: string };
  const intent = VALID_INTENTS.includes(parsed.intent as Intent) ? (parsed.intent as Intent) : 'OUTRO';
  const confidence = VALID_CONFIDENCES.includes(parsed.confidence as Confidence)
    ? (parsed.confidence as Confidence)
    : 'LOW';
  return { intent, confidence };
}
