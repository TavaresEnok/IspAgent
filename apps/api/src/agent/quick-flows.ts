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

// "não quero falar com atendente" / "sem atendente" é o oposto de um pedido de transferência.
const HUMAN_REFUSAL =
  /\b(?:n[aã]o|nem)\s+(?:\p{L}+\s+){0,3}(?:atendente|humano|operador(?!a)|pessoa)|\bsem\s+(?:atendente|humano)\b/iu;

export function isHumanRefusal(message: string): boolean {
  return HUMAN_REFUSAL.test(message);
}

export function isHumanRequest(message: string): boolean {
  return !isHumanRefusal(message) && HUMAN_REQUEST.test(message);
}

export function humanRefusalReply(customerName: string | null): string {
  return capitalizeFirst(`${greetingFor(customerName)}tudo bem, sigo com você por aqui mesmo. Me conta o que você precisa: fatura e 2ª via, PIX, o seu plano ou a sua conexão?`);
}

// ---- Documento (CPF/CNPJ) ----

// "para que quer meu cpf?" — o cliente merece saber o motivo antes de passar um dado pessoal.
const DOCUMENT_PURPOSE =
  /(?:pra|para|por)\s*(?:que|qu[eê]|q)\b[^?]{0,30}\b(?:cpf|cnpj|documento)|(?:cpf|cnpj|documento)\b[^?]{0,20}\bpra qu[eê]|por\s*qu[eê]\s+(?:voc[eê]\s+)?(?:precisa|quer)/i;
// "e se eu não quiser dar?", "não vou passar meu cpf", "prefiro não informar".
const DOCUMENT_REFUSAL =
  /n[aã]o\s+(?:quer(?:o|ia|er)|quiser|vou|posso|gostaria\s+de)\s+(?:d(?:ar|á|a)|passar|informar|mandar|enviar)(?![a-zà-ú])|prefiro\s+n[aã]o|n[aã]o\s+(?:vou|quero)\s+(?:te\s+)?(?:dar|passar|informar)|sem\s+(?:dar|passar|informar)\s+(?:o\s+)?(?:meu\s+)?(?:cpf|cnpj|documento)/i;

export function isDocumentPurposeQuestion(message: string): boolean {
  return DOCUMENT_PURPOSE.test(message);
}

export function isDocumentRefusal(message: string): boolean {
  return DOCUMENT_REFUSAL.test(message);
}

export function documentPurposeReply(companyName: string): string {
  return (
    `O CPF ou CNPJ do titular é como eu encontro a sua assinatura no sistema da ${companyName} e garanto que ` +
    'estou mostrando os dados da pessoa certa (fatura, plano e conexão são informações pessoais). Ele é usado só ' +
    'para localizar o seu cadastro neste atendimento. Se quiser seguir, é só digitar o número.'
  );
}

export function documentRefusalReply(): string {
  return (
    'Sem problema, você não é obrigado a informar. Só que, sem o CPF ou CNPJ do titular, eu não consigo acessar ' +
    'dados da sua conta por aqui (fatura, PIX, plano ou teste da conexão), por segurança. Posso tirar dúvidas ' +
    'gerais, e se mudar de ideia é só digitar o número.'
  );
}

// "isso não é o que pedi", "eu nem pedi boleto", "não mencionei pagamento": reclamação sobre a resposta
// anterior. A palavra "boleto" aqui NÃO é um pedido de boleto.
const COMPLAINT_ABOUT_REPLY =
  /\b(?:n[aã]o|nem)\s+(?:\p{L}+\s+){0,2}(?:pedi|mencionei|falei|solicitei|perguntei|citei)\b|n[aã]o\s+foi\s+(?:isso|isto)\s+(?:que|o\s+que)/iu;

export function isComplaintAboutReply(message: string): boolean {
  return COMPLAINT_ABOUT_REPLY.test(message);
}

/** "não sou o Alberto" com o nome do cadastro vinculado: a conversa está presa ao cliente errado. */
export function deniesIdentity(message: string, customerName: string | null): boolean {
  const first = customerName?.trim().split(/\s+/)[0];
  if (!first) return false;
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const m = /\bn[aã]o\s+sou\s+(?:o\s+|a\s+|eu\s+(?:o\s+|a\s+)?)?(\p{L}+)/iu.exec(message);
  return Boolean(m && norm(m[1]) === norm(first));
}

export function identifiedReply(customerName: string | null, switched: boolean): string {
  const greeting = greetingFor(customerName).replace(/, $/, '');
  const opening = switched
    ? `Pronto${greeting ? `, ${greeting}` : ''}! Troquei para o cadastro desse documento e desconsiderei o anterior.`
    : `Pronto${greeting ? `, ${greeting}` : ''}! Localizei o seu cadastro.`;
  return `${opening} Como posso te ajudar: fatura e 2ª via, PIX, o seu plano ou a sua conexão?`;
}

export function identityDeniedReply(): string {
  return 'Peço desculpas pela confusão! Desvinculei aquele cadastro desta conversa. Me informe, por favor, o CPF ou CNPJ do titular da sua assinatura para eu localizar o cadastro certo.';
}

/** Menu só quando nenhum assunto foi reconhecido: "preciso de ajuda com a fatura" é financeiro, não menu. */
export function isScopeQuestion(message: string, intent: Intent): boolean {
  return intent === 'OUTRO' && SCOPE_QUESTION.test(message);
}

/** Sem nome do cliente a frase começa direto no verbo ("tudo bem, ..."): primeira letra maiúscula. */
export function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function greetingFor(customerName: string | null): string {
  const first = customerName?.trim().split(/\s+/)[0] ?? '';
  return first ? `${first.charAt(0).toUpperCase()}${first.slice(1).toLowerCase()}, ` : '';
}

export function humanRequestReply(customerName: string | null): string {
  return capitalizeFirst(`${greetingFor(customerName)}compreendo e peço desculpas. Estou transferindo o seu atendimento para um de nossos atendentes agora mesmo. Aguarde um instante que ele te responde por aqui.`);
}

export function scopeReply(customerName: string | null, companyName: string): string {
  return (
    capitalizeFirst(`${greetingFor(customerName)}como assistente virtual da ${companyName}, posso te ajudar com:\n\n`) +
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
      reply: capitalizeFirst(`${greeting}lamento que você esteja pensando em cancelar. Para eu encaminhar da melhor forma: ${CANCELLATION_REASON_QUESTION}? (Por exemplo: valor da fatura, mudança de endereço ou instabilidade na conexão.)`),
    };
  }
  return {
    kind: 'TRANSFER',
    priceRelated,
    reply: priceRelated
      ? capitalizeFirst(`${greeting}entendi, obrigado por explicar. Vou passar o seu caso para a nossa equipe de retenção, que pode avaliar uma condição para você. Um atendente te responde por aqui em instantes.`)
      : capitalizeFirst(`${greeting}entendi, obrigado por explicar. Registrei o seu pedido e vou passar para a nossa equipe, que conclui o atendimento com você por aqui.`),
    nextAction: priceRelated
      ? 'Retenção: motivo é preço — avaliar condição comercial antes de concluir o cancelamento.'
      : 'Concluir o cancelamento (ou tratar o motivo informado, se houver solução).',
  };
}

// ---- Interesse comercial ----

export function leadReply(customerName: string | null, companyName: string, alreadyRegistered: boolean): string {
  const greeting = greetingFor(customerName);
  return alreadyRegistered
    ? capitalizeFirst(`${greeting}já está anotado! Acrescentei essa informação ao seu pedido, e a equipe comercial da ${companyName} entra em contato em breve.`)
    : capitalizeFirst(`${greeting}ótima escolha! Registrei o seu interesse com a equipe comercial da ${companyName}. Um consultor entra em contato em breve com as ofertas disponíveis na sua região.`);
}
