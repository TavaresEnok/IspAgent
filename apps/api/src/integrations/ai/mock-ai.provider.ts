import { Injectable } from '@nestjs/common';
import { Intent } from '@ispagent/shared';
import { AIProvider, ComposeReplyInput, IntentClassification } from './ai-provider.interface';

export const KEYWORD_RULES: Array<{ intent: Intent; keywords: string[] }> = [
  { intent: 'SEM_CONEXAO', keywords: ['sem internet', 'sem conexão', 'sem conexao', 'caiu a internet', 'não conecta', 'nao conecta', 'sem sinal', 'caiu a rede', 'não está funcionando'] },
  { intent: 'INTERNET_LENTA', keywords: ['lenta', 'lentidão', 'lentidao', 'devagar', 'travando', 'ruim', 'internet ruim', 'sinal ruim', 'internet pessima', 'conexao ruim', 'velocidade baixa', 'muito lento', 'muito lenta'] },
  { intent: 'QUEDAS', keywords: ['cai toda hora', 'fica caindo', 'oscilando', 'quedas', 'reconectando', 'instável', 'instavel'] },
  { intent: 'SEGUNDA_VIA', keywords: ['segunda via', '2 via', '2ª via', 'boleto', 'pdf', 'baixar boleto', 'baixar fatura', 'copia do boleto', 'link do boleto', 'quero o pdf', 'link pdf', 'gerar pdf', 'sem ser o link', 'pdf do boleto', 'outras solicitações', 'outras solicitacoes', 'minhas solicitações', 'minhas solicitacoes'] },
  { intent: 'PAGAMENTO', keywords: ['paguei', 'pagamento', 'comprovante', 'pix', 'chave pix', 'codigo pix', 'código pix', 'pagar', 'copia e cola', 'gere o código pix', 'gerar pix', 'eu pedi o pix', 'pedi o pix', 'qrcode', 'qr code', 'qrcod', 'cade o pix', 'cadê o pix'] },
  { intent: 'BLOQUEIO', keywords: ['bloqueado', 'bloqueio', 'desbloquear', 'corte'] },
  { intent: 'FINANCEIRO', keywords: ['fatura', 'financeiro', 'conta', 'dívida', 'divida', 'atraso', 'débito', 'debito', 'valor'] },
  { intent: 'UPGRADE', keywords: ['upgrade', 'aumentar velocidade', 'mais velocidade'] },
  { intent: 'PLANO', keywords: ['meu plano', 'qual plano', 'plano contratado', 'saber meu plano', 'saber o meu plano', 'consultar plano', 'meu pacote', 'qual a velocidade do meu plano', 'velocidade do meu plano'] },
  { intent: 'CONTRATACAO', keywords: ['contratar', 'nova instalação', 'nova instalacao', 'assinar'] },
  { intent: 'STATUS_CHAMADO', keywords: ['status do chamado', 'andamento do chamado', 'meu chamado', 'ordem de serviço', 'ordem de servico', 'o.s'] },
  { intent: 'CHAMADO', keywords: ['abrir chamado', 'abrir um chamado', 'abertura de chamado', 'visita técnica', 'visita tecnica'] },
  { intent: 'CANCELAMENTO', keywords: ['cancelar', 'cancelamento'] },
  { intent: 'SUPORTE_INTERNET', keywords: ['qual meu sinal', 'meu sinal', 'testar sinal', 'qual o sinal', 'wifi', 'wi-fi'] },
];

function formatCustomerFirstName(fullName: string | null | undefined): string {
  if (!fullName) return '';
  const first = fullName.trim().split(/\s+/)[0] || '';
  if (!first) return '';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
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

    const company = input.persona?.companyName?.trim() || 'Vibe Telecom';
    const assistant = input.persona?.assistantName?.trim() || 'assistente virtual';

    if (input.cpfNotFound) {
      return `Não encontrei nenhum cadastro ativo com o documento ou código "${input.cpfNotFound}". Por favor, confira os números digitados ou informe o CPF do titular da assinatura.`;
    }
    if (input.needsCpf) {
      return 'Para que eu possa verificar a sua conexão e testar o sinal da sua internet (ou consultar faturas e contratos), por favor, digite o seu CPF ou CNPJ.';
    }

    if (input.intent === 'OUTRO' && input.facts.length === 0) {
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
    const amountFact = input.facts.find((f) => f.label.includes('Valor'));
    const dueFact = input.facts.find((f) => f.label.includes('Vencimento'));
    const statusFact = input.facts.find((f) => f.label === 'Status da fatura');
    const digitableFact = input.facts.find((f) => f.label.includes('digitável'));

    // Cenário Multi-Intent: Cliente pediu suporte de rede E segunda via/PIX no mesmo turno
    if (opticalFact && (pdfFact || pixFact || amountFact)) {
      let reply = `${greeting}verifiquei a sua conexão e a fibra óptica está recebendo sinal normal da nossa rede.\n\nE sobre a sua fatura, localizei o boleto`;
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
      return `${greeting}compreendo perfeitamente e peço desculpas. Como você já reiniciou o roteador e o sinal do Wi-Fi está bom, isso indica que o problema não é com o seu equipamento interno. No momento a abertura de novos chamados está pausada para manutenção, mas se precisar emitir segunda via, gerar PIX ou consultar seu plano, estou à disposição!`;
    }

    const network = input.followUp ? this.networkExplanation(input.facts) : this.networkReply(input.facts);
    if (network) return `${greeting}${network}`;

    // Plano de internet
    const planFact = input.facts.find((f) => f.label.includes('plano') || f.label.includes('Plano'));
    if (planFact) {
      return `${greeting}o seu plano atual contratado é o **${planFact.value}**. Se precisar de 2ª via da fatura ou código PIX para pagamento, é só me pedir!`;
    }

    const factLines = input.facts.map((f) => `• **${f.label}:** ${this.formatValue(f.value)}`).join('\n');
    return `${greeting}aqui estão as informações encontradas:\n\n${factLines}`;
  }

  private networkExplanation(facts: ComposeReplyInput['facts']): string | null {
    const status = facts.find((f) => f.label === 'Status da conexão')?.value;
    if (typeof status !== 'string') return null;
    if (facts.some((f) => f.label === 'Escopo do incidente')) {
      return 'não é um problema só na sua casa — identificamos uma manutenção técnica na rede da sua região. Nossa equipe já está atuando e a conexão será normalizada automaticamente assim que os reparos forem concluídos.';
    }
    if (status === 'HEALTHY') {
      return 'pelos dados da nossa central, a fibra óptica está chegando perfeitamente na sua residência com sinal estável. Quando isso acontece, costuma ser uma oscilação momentânea do Wi-Fi ou congestionamento de aparelhos conectados.';
    }
    return 'a sua conexão de fibra óptica chega com sinal de luz até o modem. No momento estamos monitorando a estabilidade da sua linha diretamente pelo sistema.';
  }

  private networkReply(facts: ComposeReplyInput['facts']): string | null {
    const status = facts.find((f) => f.label === 'Status da conexão')?.value;
    if (typeof status !== 'string') return null;

    if (facts.some((f) => f.label === 'Escopo do incidente')) {
      return 'identificamos uma instabilidade temporária na rede da sua região. Nossa equipe técnica já está atuando para normalizar o sinal o quanto antes.';
    }

    switch (status) {
      case 'HEALTHY':
        return 'verifiquei a sua conexão e a fibra óptica está recebendo sinal normal da nossa rede. Se você notar lentidão no Wi-Fi, pode ser uma oscilação temporária de frequência.';
      case 'DEGRADED':
        return 'verifiquei a sua conexão e detectei uma oscilação no sinal óptico que chega até você.';
      case 'OFFLINE':
        return 'verifiquei aqui que o seu equipamento está sem comunicação com a central no momento. Verifique se o cabo óptico e a fonte de energia estão firmes.';
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
