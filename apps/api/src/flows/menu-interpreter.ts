import { Intent } from '@ispagent/shared';
import { MockAIProvider } from '../integrations/ai/mock-ai.provider';

/**
 * Menu do fluxo que entende texto livre. O cliente não é obrigado a responder "1": "minha net caiu" num
 * menu com "Problema na internet" escolhe essa opção. Separação à la Rasa CALM: a IA só *entende* a
 * mensagem (vira um assunto); quem decide o caminho continua sendo o fluxo publicado pelo provedor.
 */

/** Assuntos equivalentes para efeito de menu (fatura e PIX são o mesmo "financeiro" para o cliente). */
const GROUPS: Array<{ group: string; intents: Intent[] }> = [
  { group: 'financeiro', intents: ['FINANCEIRO', 'SEGUNDA_VIA', 'PAGAMENTO', 'BLOQUEIO'] },
  { group: 'rede', intents: ['SUPORTE_INTERNET', 'SEM_CONEXAO', 'INTERNET_LENTA', 'QUEDAS'] },
  { group: 'plano', intents: ['PLANO', 'UPGRADE'] },
  { group: 'comercial', intents: ['CONTRATACAO'] },
  { group: 'chamado', intents: ['CHAMADO', 'STATUS_CHAMADO'] },
  { group: 'cancelamento', intents: ['CANCELAMENTO'] },
];

export function intentGroup(intent: Intent): string | null {
  return GROUPS.find((g) => g.intents.includes(intent))?.group ?? null;
}

/** Rótulos de menu são textos curtos e escritos pelo provedor: as regras bastam (sem custo de IA). */
const labelClassifier = new MockAIProvider();

/**
 * Opção do menu que corresponde ao assunto da mensagem, ou `null` (nenhuma, ou mais de uma — ambíguo não
 * escolhe por ninguém). `messageIntents` vem do classificador do atendimento (IA do provedor, com reserva).
 */
export async function interpretMenuChoice(
  messageIntents: Intent[],
  options: Array<{ id: string; label: string }>,
): Promise<string | null> {
  const wanted = new Set(messageIntents.map(intentGroup).filter((g): g is string => g !== null));
  if (wanted.size === 0) return null;
  const hits: string[] = [];
  for (const option of options) {
    const { intents } = await labelClassifier.classifyIntents(option.label);
    if (intents.some((it) => wanted.has(intentGroup(it) ?? ''))) hits.push(option.id);
  }
  return hits.length === 1 ? hits[0] : null;
}
