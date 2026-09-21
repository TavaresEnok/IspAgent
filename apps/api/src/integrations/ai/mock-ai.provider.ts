import { Injectable } from '@nestjs/common';
import { Intent } from '@ispagent/shared';
import { AIProvider, ComposeReplyInput, IntentClassification } from './ai-provider.interface';

export const KEYWORD_RULES: Array<{ intent: Intent; keywords: string[] }> = [
  { intent: 'SEM_CONEXAO', keywords: ['sem internet', 'sem conexão', 'sem conexao', 'caiu a internet', 'não conecta', 'nao conecta', 'sem sinal', 'caiu a rede'] },
  { intent: 'INTERNET_LENTA', keywords: ['lenta', 'lentidão', 'lentidao', 'devagar', 'travando', 'ruim', 'internet ruim', 'sinal ruim', 'internet pessima', 'conexao ruim'] },
  { intent: 'QUEDAS', keywords: ['cai toda hora', 'fica caindo', 'oscilando', 'quedas', 'reconectando'] },
  { intent: 'SEGUNDA_VIA', keywords: ['segunda via', '2 via', '2ª via', 'boleto'] },
  { intent: 'PAGAMENTO', keywords: ['paguei', 'pagamento', 'comprovante'] },
  { intent: 'BLOQUEIO', keywords: ['bloqueado', 'bloqueio', 'desbloquear'] },
  { intent: 'FINANCEIRO', keywords: ['fatura', 'financeiro', 'conta', 'dívida', 'divida', 'atraso'] },
  { intent: 'UPGRADE', keywords: ['upgrade', 'aumentar velocidade', 'mais velocidade'] },
  { intent: 'PLANO', keywords: ['meu plano', 'qual plano', 'plano contratado', 'saber meu plano', 'saber o meu plano', 'consultar plano', 'meu pacote'] },
  { intent: 'CONTRATACAO', keywords: ['contratar', 'nova instalação', 'nova instalacao', 'assinar'] },
  { intent: 'STATUS_CHAMADO', keywords: ['status do chamado', 'andamento do chamado', 'meu chamado'] },
  { intent: 'CHAMADO', keywords: ['abrir chamado', 'abrir um chamado', 'técnico', 'tecnico', 'visita'] },
  { intent: 'CANCELAMENTO', keywords: ['cancelar', 'cancelamento'] },
  { intent: 'SUPORTE_INTERNET', keywords: ['internet', 'wifi', 'wi-fi', 'conexão', 'conexao'] },
];

/**
 * Provider DEMO (seção 6.4): sempre disponível, nunca precisa de chave, e NUNCA se apresenta como IA
 * real — `mode` é sempre 'DEMO' e a UI mostra isso. Classificação por palavra-chave (seção 5.3 permite
 * regras, não exige LLM) e resposta gerada por template, citando só os fatos recebidos.
 */
@Injectable()
export class MockAIProvider implements AIProvider {
  readonly name = 'MockAIProvider';
  readonly mode = 'DEMO' as const;
  readonly model = 'rule-based-v1';

  async classifyIntent(message: string): Promise<IntentClassification> {
    const normalized = message.toLowerCase();
    for (const rule of KEYWORD_RULES) {
      if (rule.keywords.some((kw) => normalized.includes(kw))) {
        return { intent: rule.intent, confidence: 'MEDIUM' };
      }
    }
    return { intent: 'OUTRO', confidence: 'LOW' };
  }

  async composeReply(input: ComposeReplyInput): Promise<string> {
    const greeting = input.customerName ? `${input.customerName}, ` : '';

    if (input.cpfNotFound) {
      return `Não encontrei nenhum cadastro ativo com o documento ou código "${input.cpfNotFound}". Por favor, confira os números digitados ou informe o CPF do titular da assinatura.`;
    }
    if (input.needsCpf) {
      return 'Para que eu possa verificar a sua conexão e testar o sinal da sua internet (ou consultar faturas e contratos), por favor, digite o seu CPF ou CNPJ.';
    }

    if (input.intent === 'OUTRO' && input.facts.length === 0) {
      return 'Sou o assistente de atendimento do seu provedor de internet. Consigo ajudar com: internet lenta, caindo ou sem conexão; fatura e segunda via; o seu plano; e abrir ou acompanhar um chamado. Me conta o que você precisa?';
    }
    if (input.toolStatus === 'NOT_FOUND') {
      return `${greeting}não encontrei esse registro no sistema. Pode confirmar os dados novamente?`;
    }
    if (input.toolStatus === 'BLOCKED_BY_POLICY') {
      return `${greeting}essa ação não está disponível para autoatendimento agora — vou te encaminhar para um atendente.`;
    }
    if (input.toolStatus === 'NEEDS_CONFIRMATION') {
      return `${greeting}antes de continuar, você confirma que quer prosseguir com essa ação?`;
    }

    if (input.facts.length === 0) {
      return `${greeting}não encontrei informações suficientes para responder com certeza agora — vou te encaminhar para um atendente.`;
    }

    const network = input.followUp ? this.networkExplanation(input.facts) : this.networkReply(input.facts);
    if (network) return `${greeting}${network}`;

    const factLines = input.facts.map((f) => `- ${f.label}: ${this.formatValue(f.value)}`).join('\n');
    return `${greeting}aqui está o que encontrei:\n${factLines}`;
  }

  /** Cliente pediu explicação ("que sinal?", "como assim?") logo depois do diagnóstico. */
  private networkExplanation(facts: ComposeReplyInput['facts']): string | null {
    const status = facts.find((f) => f.label === 'Status da conexão')?.value;
    if (typeof status !== 'string') return null;
    if (facts.some((f) => f.label === 'Escopo do incidente')) {
      return 'explicando melhor: não é um problema só na sua casa — um equipamento da nossa rede que atende a sua região está com falha, e por isso várias pessoas ficaram sem conexão ao mesmo tempo. A equipe técnica já está trabalhando nisso; quando for resolvido, a sua internet volta sozinha, sem você precisar fazer nada.';
    }
    if (status === 'HEALTHY') {
      return 'explicando melhor: pelos dados que temos daqui, a fibra está chegando na sua casa com sinal bom e sem quedas. Quando é assim, o problema costuma estar dentro de casa — roteador travado, Wi-Fi fraco longe do aparelho ou muitos dispositivos ao mesmo tempo. Quer que eu abra um chamado mesmo assim?';
    }
    if (status === 'OFFLINE') {
      return 'explicando melhor: a internet chega até você por um cabo de fibra, que termina num aparelhinho perto do roteador. Neste momento esse aparelho não está conversando com a nossa rede — pode estar desligado da tomada, com o cabo solto/dobrado ou com defeito. Quer que eu abra um chamado para um técnico?';
    }
    return 'explicando melhor: a sua internet chega por um cabo de fibra óptica, que leva o sinal como luz até o aparelho da fibra na sua casa. O "sinal" é a força dessa luz chegando até você — e a sua está chegando mais fraca ou instável do que deveria, por isso a conexão cai. Isso costuma ser cabo dobrado, conector sujo ou algum problema no cabo da rua, e só um técnico resolve. Quer que eu abra um chamado para ele verificar?';
  }

  /**
   * Diagnóstico de rede em linguagem de cliente: nunca repassa valor técnico cru (dBm, índice, DEGRADED) —
   * esses continuam registrados nas Claims/auditoria para o atendente. Só usa o que veio nos facts.
   */
  private networkReply(facts: ComposeReplyInput['facts']): string | null {
    const status = facts.find((f) => f.label === 'Status da conexão')?.value;
    if (typeof status !== 'string') return null;

    const affected = facts.find((f) => f.label === 'Clientes afetados pelo mesmo incidente')?.value;
    if (facts.some((f) => f.label === 'Escopo do incidente')) {
      const others = typeof affected === 'number' && affected > 1 ? ` e em outros ${affected - 1} clientes da sua região` : ' na sua região';
      return `identificamos uma instabilidade na rede que está afetando a sua conexão${others}. Nossa equipe técnica já está atuando — não é preciso reiniciar nada nem abrir chamado. Assim que normalizar, a sua internet volta sozinha.`;
    }

    switch (status) {
      case 'HEALTHY':
        return 'verifiquei a sua conexão e ela está funcionando normalmente do nosso lado. Se ainda estiver com problema, tente reiniciar o roteador (tirar da tomada por 30 segundos). Se continuar, me avisa que eu abro um chamado.';
      case 'DEGRADED':
        return 'verifiquei a sua conexão e identifiquei instabilidade no sinal que chega até você — isso explica as quedas. Não é algo que se resolva reiniciando o roteador. Quer que eu abra um chamado para um técnico verificar?';
      case 'CRITICAL':
        return 'verifiquei a sua conexão e ela está com um problema sério no sinal. Recomendo a visita de um técnico — posso abrir o chamado agora?';
      case 'OFFLINE':
        return 'verifiquei aqui e o seu equipamento está sem sinal da nossa rede neste momento. Confira se o aparelho da fibra está ligado na tomada e se o cabo não foi dobrado ou desconectado. Se estiver tudo certo, me avisa que eu abro um chamado.';
      default:
        return null;
    }
  }

  private formatValue(value: string | number | boolean | null): string {
    if (typeof value === 'boolean') return value ? 'sim' : 'não';
    if (value === null) return 'não informado';
    return String(value);
  }
}
