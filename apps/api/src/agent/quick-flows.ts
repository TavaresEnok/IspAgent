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

// Irritação de verdade merece reconhecimento; um pedido simples de atendente, não ("compreendo e peço
// desculpas" para quem só pediu um humano soa roteirizado).
const FRUSTRATION =
  /absurd|rid[ií]cul|palha[cç]ada|p[eé]ssim|cansad|raiva|revoltad|vergonha|descaso|porra|merda|lixo|n[aã]o aguento|toda hora|de novo|sempre (?:cai|a mesma|isso)|burro|n[aã]o (?:me )?ajuda/i;

export function isFrustrated(message: string): boolean {
  return FRUSTRATION.test(message);
}

export function humanRequestReply(customerName: string | null, message = ''): string {
  const g = greetingFor(customerName);
  return isFrustrated(message)
    ? capitalizeFirst(`${g}entendo a sua frustração, e sinto muito por isso. Já chamei um atendente da nossa equipe — ele continua com você por aqui.`)
    : capitalizeFirst(`${g}claro! Já chamei um atendente da nossa equipe — ele continua com você por aqui.`);
}

// ---- Conversa solta (risada, "ok", "obrigado", "oi", "tchau") ----
//
// Padrão "chitchat" (Rasa CALM): não é pedido de atendimento, então não consulta sistema, não gasta IA e,
// principalmente, não reinicia o atendimento repetindo a saudação — era o que fazia o bot parecer robô.

export type SmallTalk = 'laugh' | 'thanks' | 'ack' | 'greeting' | 'bye';

const SMALL_TALK: Array<{ kind: SmallTalk; re: RegExp }> = [
  { kind: 'laugh', re: /^(?:(?:k{2,}|(?:ha){2,}|(?:he){2,}|(?:rs){1,}|😂|🤣|😅|😆)\s*)+[!.]*$/iu },
  { kind: 'thanks', re: /^(?:muito\s+)?(?:obrigad[oa]|obg|brigad[oa]|valeu|vlw|agrade[cç]o)(?:\s+(?:mesmo|demais|viu|pela ajuda|pelo atendimento|de novo))?[\s!.]*$/iu },
  {
    kind: 'ack',
    re: /^(?:ok(?:ay)?|blz|beleza|certo|entendi|entendido|t[aá]\s*(?:bom|certo|ok)|tudo\s+(?:certo|bem|ok)|t[aá]\s+tudo\s+(?:certo|bem|ok)|(?:t[aá]|est[aá])\s+tudo\s+certo|show|perfeito|combinado|ah\s*t[aá]|hum+|aham|joia|👍|🙏|eita(?:\s+poxa)?|poxa|nossa)[\s!.]*$/iu,
  },
  {
    kind: 'greeting',
    re: /^(?:oi+e?|ol[aá]|bom\s+dia|boa\s+tarde|boa\s+noite|e\s*a[ií]|opa|hey|al[oô])(?:[\s,!.]+(?:tudo\s+(?:bem|bom|certo)|td\s+bem|pessoal|gente))?[\s!.?]*$/iu,
  },
  { kind: 'bye', re: /^(?:tchau|at[eé]\s+(?:mais|logo|breve|amanh[aã])|flw|falou|fui)[\s!.]*$/iu },
];

export function smallTalkKind(message: string): SmallTalk | null {
  const text = message.trim();
  if (!text || text.length > 60) return null;
  return SMALL_TALK.find((s) => s.re.test(text))?.kind ?? null;
}

// Lembrete de documento pendente (resposta a conversa solta enquanto o CPF não veio). Não é um novo
// pedido: não conta para o limite de pedidos de documento — antes, "kkk" e "tá certo" viravam pedidos de
// CPF repetidos e o cliente era transferido por "falta de documento" sem ter pedido nada.
const DOCUMENT_REMINDERS = [
  'Sem pressa — quando quiser seguir, é só me mandar o CPF ou CNPJ do titular que eu consulto para você.',
  'Combinado! Fico no aguardo do CPF ou CNPJ do titular; assim que você mandar, eu sigo.',
];

export function isDocumentReminder(text: string | null | undefined): boolean {
  return Boolean(text && DOCUMENT_REMINDERS.some((r) => text.includes(r.slice(-40))));
}

export function documentReminderReply(kind: SmallTalk, lastAgentMessage?: string | null): string {
  const lead = kind === 'laugh' ? '😄 ' : kind === 'thanks' ? 'Por nada! ' : '';
  const options = DOCUMENT_REMINDERS.map((r) => `${lead}${r}`);
  return options.find((o) => o !== lastAgentMessage?.trim()) ?? options[0];
}

/**
 * O que a última fala do atendimento está esperando: o documento do titular, uma resposta concreta
 * (opção, confirmação de chamado) ou nada. Uma pergunta genérica ("Aconteceu algo?") não conta — senão
 * "kkk" depois dela deixa de ser conversa solta.
 */
export function agentIsWaitingForAnswer(lastAgentMessage: string | null | undefined): 'document' | 'answer' | null {
  if (!lastAgentMessage) return null;
  if (isDocumentReminder(lastAgentMessage) || /\b(?:cpf|cnpj)\b/i.test(lastAgentMessage)) return 'document';
  if (/digite|escolh|op[cç][aã]o|confirm|quer que eu|posso abrir|abro o chamado|responda com/i.test(lastAgentMessage)) return 'answer';
  return null;
}

/** Última saída quando o atendimento ia repetir a mesma fala: oferecer o humano em vez de girar em falso. */
export const REPEAT_BREAKER =
  'Acho que não estou conseguindo te ajudar do jeito certo por aqui. Se quiser, escreva "atendente" que eu chamo alguém da equipe — ou me conta com outras palavras o que você precisa.';

const SMALL_TALK_REPLIES: Record<Exclude<SmallTalk, 'greeting'>, string[]> = {
  laugh: ['😄 Se precisar de alguma coisa, é só me chamar por aqui.', '😄 Tô por aqui se precisar!'],
  thanks: ['Por nada! Se precisar de mais alguma coisa, é só chamar.', 'Imagina! Qualquer coisa, é só chamar por aqui.'],
  ack: ['Combinado! Qualquer coisa, é só me chamar por aqui.', 'Certo! Se precisar de algo, é só falar.'],
  bye: ['Até mais! Quando precisar, é só chamar por aqui.', 'Até logo! Estou por aqui quando precisar.'],
};

/**
 * Resposta curta e natural, nunca igual à última fala do atendimento. `firstContact` = ainda não houve
 * nenhuma resposta nesta conversa (aí a saudação apresenta a empresa e o que dá para resolver).
 */
export function smallTalkReply(
  kind: SmallTalk,
  ctx: { customerName: string | null; companyName: string; firstContact: boolean; lastAgentMessage?: string | null },
): string {
  const g = greetingFor(ctx.customerName);
  let options: string[];
  if (kind === 'greeting') {
    options = ctx.firstContact
      ? [
          `Olá! Aqui é o atendimento da ${ctx.companyName}. Posso ver a sua fatura e 2ª via, o seu plano ou ajudar com a sua internet. Me conta o que você precisa?`,
        ]
      : [`Oi${g ? `, ${g.slice(0, -2)}` : ''}! Pode falar, estou por aqui.`, 'Oi! Estou por aqui, pode falar.'];
  } else {
    options = SMALL_TALK_REPLIES[kind].map((o, i) => (i === 0 && g ? capitalizeFirst(`${g}${o.charAt(0).toLowerCase()}${o.slice(1)}`) : o));
  }
  const last = ctx.lastAgentMessage?.trim();
  return options.find((o) => o !== last) ?? options[0];
}

/**
 * O que não é assunto do atendimento e não achou nada na base, quando a IA generativa não está disponível
 * (reserva por regras). Primeira vez: apresenta o que dá para resolver. Depois: pede para reformular e
 * oferece o atendente — nunca repete a apresentação palavra por palavra.
 */
export function outOfScopeReply(companyName: string, alreadyGreeted: boolean): string {
  return alreadyGreeted
    ? 'Não consegui entender bem o que você precisa. Pode me contar com outras palavras? Se preferir, escreva "atendente" que eu chamo alguém da equipe.'
    : `Olá! Aqui é o atendimento da ${companyName}. Posso te ajudar com internet lenta, caindo ou sem conexão; fatura e 2ª via; o seu plano; e abrir ou acompanhar um chamado. Me conta o que você precisa?`;
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

// ---- Pedidos que parecem outra coisa pela palavra-chave ----

// "sem cancelar o plano", "não quero cancelar": o cliente NÃO quer cancelar.
const CANCELLATION_NEGATED = /\b(?:sem|n[aã]o(?:\s+(?:quero|vou|pretendo|desejo|preciso))?)\s+cancel/i;

export function isCancellationNegated(message: string): boolean {
  return CANCELLATION_NEGATED.test(message);
}

const TITLE_TRANSFER = /titularidade|trocar?\s+(?:o\s+)?titular|mudar?\s+(?:o\s+)?titular|passar\s+(?:a\s+internet|o\s+(?:plano|contrato))\s+para\s+(?:o\s+)?meu\s+nome|transferir\s+(?:o\s+)?(?:plano|contrato|internet)\s+para/i;

export function isTitleTransfer(message: string): boolean {
  return TITLE_TRANSFER.test(message);
}

export function titleTransferReply(customerName: string | null): string {
  return capitalizeFirst(
    `${greetingFor(customerName)}a troca de titularidade é feita pela nossa equipe, que confere os documentos do titular atual e do novo. ` +
      'O seu plano continua ativo, nada é cancelado. Já passei o seu pedido para um atendente, que te explica os documentos necessários por aqui.',
  );
}

// Contestação de cobrança: o cliente diz que já pagou, foi cobrado errado ou negativado. Mandar PIX de
// novo aqui é jogar cobrança em cima de quem está reclamando dela.
const BILLING_DISPUTE =
  /negativ|serasa|\bspc\b|protest(?:o|ad[oa]|aram)|cobran[çc]a\s+indevida|cobrad[oa]\s+(?:indevidamente|errad[oa]|a\s+mais|duas\s+vezes)|cobrando\s+(?:errado|a\s+mais|duas\s+vezes)|em\s+duplicidade|paguei\s+(?:duas\s+vezes|em\s+dobro|a\s+mais)|estorno|reembolso|contest(?:ar|a[cç][aã]o)/i;

export function isBillingDispute(message: string): boolean {
  return BILLING_DISPUTE.test(message);
}

export function billingDisputeReply(customerName: string | null): string {
  return capitalizeFirst(
    `${greetingFor(customerName)}entendi, e sinto muito pelo transtorno. Contestação de cobrança precisa ser analisada pelo nosso financeiro, ` +
      'então não vou te mandar nenhuma cobrança agora. Já registrei o seu caso e passei para um atendente do financeiro, que verifica o pagamento e te responde por aqui. ' +
      'Se tiver o comprovante, pode enviar pelo clipe 📎 que ele fica anexado ao atendimento.',
  );
}

// Oferta de concorrente: sinal de cancelamento, não "interesse em contratar" (virava "Ótima escolha!").
// "Claro"/"Vivo" são palavras comuns ("claro, pode abrir"; "eu vivo aqui"): o nome só conta junto de um
// contexto de troca/oferta.
const COMPETITOR_NAME = /\b(?:claro|vivo|tim|oi(?:\s+fibra)?|starlink|net\s+virtua|brisanet|algar|sky)\b/i;
const SWITCH_CONTEXT =
  /(?:mudar|trocar|migrar|ir|passar)\s+(?:pr[ao]|para\s+a?|pela?)|ofert|oferec|proposta|vendedor|mais\s+barat|compensa|pelo\s+mesmo\s+pre[çc]o/i;

export function mentionsCompetitor(message: string): boolean {
  return /concorr[eê]n/i.test(message) || (COMPETITOR_NAME.test(message) && SWITCH_CONTEXT.test(message));
}

export function competitorReply(customerName: string | null, companyName: string): string {
  return capitalizeFirst(
    `${greetingFor(customerName)}obrigado por contar antes de decidir! Eu não comparo ofertas de outras operadoras, mas quero que você continue com a gente: ` +
      `passei o seu caso para a equipe da ${companyName}, que pode avaliar uma condição para o seu plano. Um atendente te responde por aqui.`,
  );
}
