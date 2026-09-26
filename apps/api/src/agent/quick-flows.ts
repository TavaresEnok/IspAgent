import { Intent } from '@ispagent/shared';

/**
 * Regras dos fluxos que o orquestrador resolve sem ferramenta (pedido de humano, menu, cancelamento,
 * interesse comercial). Funções puras: decidem o que fazer e o texto; o orquestrador só executa.
 */

// Pedido explícito de gente ou irritação clara. Palavras soltas como "pessoa" ou "operadora" não contam:
// "a pessoa da instalação não veio" e "minha operadora" são relatos, não pedidos de transferência.
const HUMAN_REQUEST =
  /\b(?:atendente|humano|operador(?!a))\b|falar com (?:algu[eé]m|uma pessoa|gente|um atendente)|cham(?:a|ar|e) (?:algu[eé]m|um atendente)|passa(?:r)? (?:pra|para) (?:algu[eé]m|um atendente)|voc[eê] n[aã]o (?:me )?ajuda|\bburro\b/i;

const SCOPE_QUESTION =
  /(?:o que voc[eê] (?:pode fazer|faz|resolve)|o que pode fazer por mim|quais (?:s[aã]o )?(?:as )?op[cç][oõ]es|\bmenu\b|\bajuda\b|quais os servi[cç]os)/i;

export function isHumanRequest(message: string): boolean {
  return HUMAN_REQUEST.test(message);
}

/** Menu só quando nenhum assunto foi reconhecido: "preciso de ajuda com a fatura" é financeiro, não menu. */
export function isScopeQuestion(message: string, intent: Intent): boolean {
  return intent === 'OUTRO' && SCOPE_QUESTION.test(message);
}

export function greetingFor(customerName: string | null): string {
  const first = customerName?.trim().split(/\s+/)[0] ?? '';
  return first ? `${first.charAt(0).toUpperCase()}${first.slice(1).toLowerCase()}, ` : '';
}

export function humanRequestReply(customerName: string | null): string {
  return `${greetingFor(customerName)}compreendo e peço desculpas. Estou transferindo o seu atendimento para um de nossos atendentes agora mesmo. Aguarde um instante que ele te responde por aqui.`;
}

export function scopeReply(customerName: string | null, companyName: string): string {
  return (
    `${greetingFor(customerName)}como assistente virtual da ${companyName}, posso te ajudar com:\n\n` +
    '• 📄 **2ª Via de Fatura e Boletos** (com PDF para download)\n' +
    '• 📱 **Código PIX e QR Code** para pagamento rápido\n' +
    '• 🌐 **Diagnóstico de Conexão e Teste de Sinal da Fibra**\n' +
    '• 📦 **Consulta do seu Plano Contratado**\n' +
    '• 👤 **Transferência para Atendente Humano**\n\n' +
    'Como posso te ajudar agora?'
  );
}

// ---- Cancelamento ----

/** Marca a pergunta de motivo: a próxima fala do cliente é a resposta, mesmo sem a palavra "cancelar". */
export const CANCELLATION_REASON_QUESTION = 'qual é o motivo principal do cancelamento';

const PRICE_REASON = /(?:caro|pre[çc]o|valor|aumentou|concorr[eê]ncia|desconto|mais barato|n[aã]o (?:consigo|d[aá] (?:pra|para)) pagar)/i;
const ANY_REASON =
  /(?:mud(?:an[çc]a|ei|ando|ar|ou)|endere[çc]o|ruim|lent[ao]|inst[aá]vel|caindo|quedas?|n[aã]o uso|viagem|vend(?:er|i)|atendimento)/i;

export type CancellationStep =
  | { kind: 'ASK_REASON'; reply: string }
  | { kind: 'TRANSFER'; priceRelated: boolean; reply: string; nextAction: string };

/**
 * Pede o motivo uma vez; com o motivo (ou depois de já ter perguntado), passa para a retenção humana.
 * Não oferece desconto: quem decide condição comercial é a equipe, não o robô.
 */
export function cancellationStep(message: string, customerName: string | null, alreadyAskedReason: boolean): CancellationStep {
  const greeting = greetingFor(customerName);
  const priceRelated = PRICE_REASON.test(message);
  if (!priceRelated && !ANY_REASON.test(message) && !alreadyAskedReason) {
    return {
      kind: 'ASK_REASON',
      reply: `${greeting}lamento que você esteja pensando em cancelar. Para eu encaminhar da melhor forma: ${CANCELLATION_REASON_QUESTION}? (Por exemplo: valor da fatura, mudança de endereço ou instabilidade na conexão.)`,
    };
  }
  return {
    kind: 'TRANSFER',
    priceRelated,
    reply: priceRelated
      ? `${greeting}entendi, obrigado por explicar. Vou passar o seu caso para a nossa equipe de retenção, que pode avaliar uma condição para você. Um atendente te responde por aqui em instantes.`
      : `${greeting}entendi, obrigado por explicar. Registrei o seu pedido e vou passar para a nossa equipe, que conclui o atendimento com você por aqui.`,
    nextAction: priceRelated
      ? 'Retenção: motivo é preço — avaliar condição comercial antes de concluir o cancelamento.'
      : 'Concluir o cancelamento (ou tratar o motivo informado, se houver solução).',
  };
}

// ---- Interesse comercial ----

export function leadReply(customerName: string | null, companyName: string, alreadyRegistered: boolean): string {
  const greeting = greetingFor(customerName);
  return alreadyRegistered
    ? `${greeting}já está anotado! Acrescentei essa informação ao seu pedido, e a equipe comercial da ${companyName} entra em contato em breve.`
    : `${greeting}ótima escolha! Registrei o seu interesse com a equipe comercial da ${companyName}. Um consultor entra em contato em breve com as ofertas disponíveis na sua região.`;
}
