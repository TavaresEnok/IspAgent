import { Injectable } from '@nestjs/common';
import { Intent } from '@ispagent/shared';
import { AIProvider, ComposeReplyInput, IntentClassification } from './ai-provider.interface';

export const KEYWORD_RULES: Array<{ intent: Intent; keywords: string[] }> = [
  { intent: 'SEM_CONEXAO', keywords: ['sem internet', 'sem conexão', 'sem conexao', 'caiu a internet', 'não conecta', 'nao conecta', 'sem sinal', 'caiu a rede', 'não está funcionando'] },
  { intent: 'INTERNET_LENTA', keywords: ['lenta', 'lentidão', 'lentidao', 'devagar', 'travando', 'ruim', 'internet ruim', 'sinal ruim', 'internet pessima', 'conexao ruim', 'velocidade baixa', 'muito lento', 'muito lenta'] },
  { intent: 'QUEDAS', keywords: ['cai toda hora', 'caindo', 'caiu de novo', 'fica caindo', 'desconectando', 'oscilando', 'oscilação', 'oscilacao', 'quedas', 'reconectando', 'instável', 'instavel'] },
  { intent: 'SEGUNDA_VIA', keywords: ['segunda via', '2 via', '2ª via', 'boleto', 'pdf', 'baixar boleto', 'baixar fatura', 'copia do boleto', 'link do boleto', 'quero o pdf', 'link pdf', 'gerar pdf', 'sem ser o link', 'pdf do boleto', 'outras solicitações', 'outras solicitacoes', 'minhas solicitações', 'minhas solicitacoes'] },
  { intent: 'PAGAMENTO', keywords: ['paguei', 'pagamento', 'comprovante', 'pix', 'chave pix', 'codigo pix', 'código pix', 'pagar', 'copia e cola', 'gere o código pix', 'gerar pix', 'eu pedi o pix', 'pedi o pix', 'qrcode', 'qr code', 'qrcod', 'cade o pix', 'cadê o pix'] },
  { intent: 'PLANO', keywords: ['meu plano', 'qual plano', 'plano contratado', 'saber meu plano', 'saber o meu plano', 'consultar plano', 'meu pacote', 'qual a velocidade do meu plano', 'velocidade do meu plano', 'valor do plano', 'valor do meu plano', 'preço do plano', 'preco do plano', 'quanto pago']  },
  { intent: 'BLOQUEIO', keywords: ['bloqueado', 'bloqueio', 'desbloquear', 'corte'] },
  { intent: 'FINANCEIRO', keywords: ['fatura', 'financeiro', 'conta', 'dívida', 'divida', 'atraso', 'débito', 'debito', 'valor'] },
  { intent: 'UPGRADE', keywords: ['upgrade', 'aumentar velocidade', 'mais velocidade'] },
  { intent: 'CONTRATACAO', keywords: ['contratar', 'nova instalação', 'nova instalacao', 'assinar'] },
  { intent: 'STATUS_CHAMADO', keywords: ['status do chamado', 'andamento do chamado', 'meu chamado', 'ordem de serviço', 'ordem de servico', 'o.s'] },
  { intent: 'CHAMADO', keywords: ['abrir chamado', 'abrir um chamado', 'abertura de chamado', 'visita técnica', 'visita tecnica'] },
  { intent: 'CANCELAMENTO', keywords: ['cancelar', 'cancelamento'] },
  // Sem "internet" solto de propósito: "fatura da internet" não é problema de rede.
  { intent: 'SUPORTE_INTERNET', keywords: ['qual meu sinal', 'meu sinal', 'testar sinal', 'qual o sinal', 'wifi', 'wi-fi', 'internet não', 'internet nao', 'problema na internet', 'problema com a internet', 'sem navegar'] },
];

function formatCustomerFirstName(fullName: string | null | undefined): string {
  if (!fullName) return '';
  const first = fullName.trim().split(/\s+/)[0] || '';
  if (!first) return '';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function formatCents(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

/**
 * Provider DEMO / Fallback: regras de palavras-chave e templates acolhedores e humanizados.
 */
@Injectable()
export class MockAIProvider implements AIProvider {
  readonly name = 'MockAIProvider';
  readonly mode = 'DEMO' as const;
  readonly model = 'rule-based-v1';

  async classifyIntent(message: string): Promise<IntentClassification> {
    const res = await this.classifyIntents(message);
    return { intent: res.primary, confidence: res.confidence };
  }

  async classifyIntents(message: string): Promise<{ intents: Intent[]; primary: Intent; confidence: import('@ispagent/shared').Confidence }> {
    const normalized = message.toLowerCase();
    const matched: Intent[] = [];
    for (const rule of KEYWORD_RULES) {
      if (rule.keywords.some((kw) => normalized.includes(kw))) {
        if (!matched.includes(rule.intent)) {
          matched.push(rule.intent);
        }
      }
    }
    // SUPORTE_INTERNET é o fallback genérico ("internet", "conexão"): não conta como segundo assunto.
    const specific = matched.filter((i) => i !== 'SUPORTE_INTERNET');
    if (specific.length > 0) {
      return { intents: specific, primary: specific[0], confidence: 'MEDIUM' };
    }
    if (matched.length > 0) {
      return { intents: matched, primary: matched[0], confidence: 'MEDIUM' };
    }
    return { intents: ['OUTRO'], primary: 'OUTRO', confidence: 'LOW' };
  }

  async composeReply(input: ComposeReplyInput): Promise<string> {
    const firstName = formatCustomerFirstName(input.customerName);
    const greeting = firstName ? `${firstName}, ` : '';
    const msgLower = (input.customerMessage ?? '').toLowerCase();
    const alreadyRebooted = /(?:j[aá]\s*(?:reiniciei|desliguei|fiz|tirei|resetei|tudo)|mentirosa|essa porra|de novo)/i.test(msgLower);

    const company = input.persona?.companyName?.trim() || input.providerName?.trim() || 'seu provedor de internet';
    const canTicket = Boolean(input.persona?.canCreateTicket);
    const assistant = input.persona?.assistantName?.trim() || 'assistente virtual';

    if (input.cpfNotFound) {
      return `Não encontrei nenhum cadastro ativo com o documento ou código "${input.cpfNotFound}". Por favor, confira os números digitados ou informe o CPF do titular da assinatura.`;
    }
    if (input.needsCpf) {
      return 'Para que eu possa verificar a sua conexão e testar o sinal da sua internet (ou consultar faturas e contratos), por favor, digite o seu CPF ou CNPJ.';
    }

    if (input.intent === 'OUTRO' && input.facts.length === 0) {
      // Conversa em andamento com cliente identificado: sem novo "Olá, sou o assistente".
      if (firstName) {
        return `${greeting}estou por aqui com o seu cadastro aberto. Posso te ajudar com fatura e 2ª via, código PIX, o seu plano ou a sua conexão — é só me dizer o que precisa.`;
      }
      return `Olá! Sou o ${assistant} da ${company}. Consigo te ajudar com faturas, 2ª via em PDF, código PIX para pagamento, consulta de plano e diagnóstico de conexão. Como posso te ajudar agora?`;
    }
    if (input.toolStatus === 'NOT_FOUND') {
      return `${greeting}não encontrei esse registro no sistema. Pode confirmar os dados novamente?`;
    }
    if (input.toolStatus === 'BLOCKED_BY_POLICY') {
      return `${greeting}essa operação está desativada no momento pela política de atendimento. O autoatendimento está liberado para consultas e emissão de segunda via/PIX. Posso te ajudar com isso?`;
    }
    if (input.toolStatus === 'NEEDS_CONFIRMATION') {
      return `${greeting}antes de continuar, você confirma que quer prosseguir com essa ação?`;
    }

    if (input.facts.length === 0) {
      return `${greeting}não encontrei informações suficientes no momento. Como posso te auxiliar com seus boletos, PIX ou plano?`;
    }

    // Resposta rica e formatada para Faturas / Boletos / PIX
    const opticalFact = input.facts.find((f) => f.label.includes('óptica') || f.label.includes('fibra') || f.label.includes('sinal') || f.label === 'Sinal óptico na ONT');
    const pdfFact = input.facts.find((f) => f.label.includes('PDF'));
    const pixFact = input.facts.find((f) => f.label.includes('PIX'));
    const amountFact = input.facts.find((f) => f.label === 'Valor da fatura');
    const dueFact = input.facts.find((f) => f.label.includes('Vencimento'));
    const statusFact = input.facts.find((f) => f.label === 'Status da fatura');
    const digitableFact = input.facts.find((f) => f.label.includes('digitável'));

    // Cenário Multi-Intent: Cliente pediu suporte de rede E segunda via/PIX no mesmo turno
    if (opticalFact && (pdfFact || pixFact || amountFact)) {
      const networkText = this.networkReply(input.facts, canTicket) ?? 'verifiquei as informações da sua conexão.';
      let reply = `${greeting}${networkText}\n\nE sobre a sua fatura, localizei o boleto`;
      if (amountFact?.value) reply += ` no valor de **${amountFact.value}**`;
      if (dueFact?.value) reply += ` com vencimento em **${dueFact.value}**`;
      if (statusFact?.value) reply += ` (${statusFact.value})`;
      reply += '.\n\n';

      if (pixFact?.value) {
        reply += `📱 **Código PIX Copia e Cola:**\n\`${pixFact.value}\`\n\n`;
      }
      if (pdfFact?.value) {
        reply += `📄 **Link do Boleto (PDF):**\n${pdfFact.value}\n\n`;
      }
      if (digitableFact?.value) {
        reply += `🔢 **Linha Digitável:**\n\`${digitableFact.value}\`\n\n`;
      }
      reply += 'Você pode pagar diretamente pelo aplicativo do seu banco usando o PIX ou o boleto acima.';
      return reply;
    }

    if (pdfFact || pixFact || amountFact) {
      let reply = `${greeting}localizei a sua fatura`;
      if (amountFact?.value) reply += ` no valor de **${amountFact.value}**`;
      if (dueFact?.value) reply += ` com vencimento em **${dueFact.value}**`;
      if (statusFact?.value) reply += ` (${statusFact.value})`;
      reply += '.\n\n';

      if (pixFact?.value) {
        reply += `📱 **Código PIX Copia e Cola:**\n\`${pixFact.value}\`\n\n`;
      }
      if (pdfFact?.value) {
        reply += `📄 **Link do Boleto (PDF):**\n${pdfFact.value}\n\n`;
      }
      if (digitableFact?.value) {
        reply += `🔢 **Linha Digitável:**\n\`${digitableFact.value}\`\n\n`;
      }
      reply += 'Você pode pagar diretamente pelo aplicativo do seu banco usando o PIX ou o boleto acima.';
      return reply;
    }

    // Se o cliente já avisou que reiniciou ou está irritado com repetição
    if (alreadyRebooted) {
      const next = canTicket
        ? 'Posso abrir um chamado para a equipe técnica verificar de perto — quer que eu siga com isso?'
        : 'Vou deixar registrado para a nossa equipe; se preferir, posso te passar para um atendente humano.';
      return `${greeting}compreendo perfeitamente e peço desculpas pelo transtorno. Como você já fez o procedimento no seu equipamento, não vou pedir para repetir. ${next}`;
    }

    const network = input.followUp ? this.networkExplanation(input.facts, canTicket) : this.networkReply(input.facts, canTicket);
    if (network) return `${greeting}${network}`;

    // Base de conhecimento: a orientação do artigo mais relevante (não só o título).
    const kbGuidance = input.facts.find((f) => f.label === 'Orientação da base de conhecimento');
    if (kbGuidance && typeof kbGuidance.value === 'string') {
      return `${greeting}${kbGuidance.value}`;
    }

    // Plano de internet (nome + valor/velocidade quando o ERP fornece)
    const planFact = input.facts.find((f) => f.label === 'Seu plano');
    if (planFact) {
      const price = input.facts.find((f) => f.label === 'Valor mensal do plano (centavos)');
      const down = input.facts.find((f) => f.label === 'Velocidade de download (Mbps)');
      let reply = `${greeting}o seu plano atual é o **${planFact.value}**`;
      if (typeof down?.value === 'number' && down.value > 0) reply += `, com **${down.value} Mbps** de download`;
      if (typeof price?.value === 'number' && price.value > 0) reply += `, no valor mensal de **${formatCents(price.value)}**`;
      return `${reply}. Se precisar de 2ª via da fatura ou código PIX, é só me pedir!`;
    }

    const factLines = input.facts.map((f) => this.formatFactLine(f)).join('\n');
    return `${greeting}aqui estão as informações encontradas:\n\n${factLines}`;
  }

  /** Labels com sufixo `(centavos)`/`(Mbps)` viram texto em R$/Mbps; o resto usa o valor cru. */
  private formatFactLine(fact: ComposeReplyInput['facts'][number]): string {
    const centavos = /^(.*) \(centavos\)$/.exec(fact.label);
    if (centavos && typeof fact.value === 'number') return `• **${centavos[1]}:** ${formatCents(fact.value)}`;
    const mbps = /^(.*) \(Mbps\)$/.exec(fact.label);
    if (mbps && typeof fact.value === 'number') return `• **${mbps[1]}:** ${fact.value} Mbps`;
    return `• **${fact.label}:** ${this.formatValue(fact.value)}`;
  }

  /** Cliente pediu explicação ("que sinal?", "como assim?") logo depois do diagnóstico. */
  private networkExplanation(facts: ComposeReplyInput['facts'], canTicket = false): string | null {
    const status = facts.find((f) => f.label === 'Status da conexão')?.value;
    if (typeof status !== 'string') return null;
    if (facts.some((f) => f.label === 'Escopo do incidente')) {
      return 'não é um problema só na sua casa — identificamos uma manutenção técnica na rede da sua região. Nossa equipe já está atuando e a conexão será normalizada automaticamente assim que os reparos forem concluídos.';
    }
    if (status === 'HEALTHY') {
      return 'pelos dados da nossa central, a fibra óptica está chegando perfeitamente na sua residência com sinal estável. Quando isso acontece, costuma ser uma oscilação momentânea do Wi-Fi ou congestionamento de aparelhos conectados.';
    }
    if (status === 'OFFLINE') {
      return 'o seu aparelho da fibra (o que fica perto do roteador) não está conversando com a nossa rede agora — pode estar desligado da tomada, com o cabo solto/dobrado ou com defeito.' + (canTicket ? ' Quer que eu abra um chamado para um técnico?' : '');
    }
    return 'a internet chega por um cabo de fibra que leva o sinal como luz até a sua casa — e essa luz está chegando mais fraca ou instável do que deveria. Isso não se resolve reiniciando o roteador; costuma ser cabo dobrado, conector sujo ou problema no cabo da rua.' + (canTicket ? ' Quer que eu abra um chamado para um técnico verificar?' : '');
  }

  private networkReply(facts: ComposeReplyInput['facts'], canTicket = false): string | null {
    const status = facts.find((f) => f.label === 'Status da conexão')?.value;
    if (typeof status !== 'string') return null;

    if (facts.some((f) => f.label === 'Escopo do incidente')) {
      return 'identificamos uma instabilidade temporária na rede da sua região. Nossa equipe técnica já está atuando para normalizar o sinal o quanto antes.';
    }

    switch (status) {
      case 'HEALTHY':
        return 'verifiquei a sua conexão e a fibra óptica está recebendo sinal normal da nossa rede. Se você notar lentidão no Wi-Fi, pode ser uma oscilação temporária de frequência.';
      case 'DEGRADED':
        return 'verifiquei a sua conexão e detectei uma oscilação no sinal da fibra que chega até você — isso explica as quedas e não se resolve reiniciando o roteador.' + (canTicket ? ' Quer que eu abra um chamado para um técnico verificar?' : '');
      case 'CRITICAL':
        return 'verifiquei a sua conexão e o sinal que chega até você está bem abaixo do ideal, o que explica as quedas.' + (canTicket ? ' Quer que eu abra um chamado técnico para verificarmos?' : ' Vou precisar que a nossa equipe técnica verifique.');
      case 'OFFLINE':
        return 'verifiquei aqui que o seu equipamento está sem comunicação com a central no momento. Verifique se o cabo óptico e a fonte de energia estão firmes.' + (canTicket ? ' Se estiver tudo certo, quer que eu abra um chamado técnico?' : '');
      default:
        return 'verifiquei as informações da sua conexão.';
    }
  }

  private formatValue(value: string | number | boolean | null): string {
    if (typeof value === 'boolean') return value ? 'sim' : 'não';
    if (value === null) return 'não informado';
    return String(value);
  }
}
