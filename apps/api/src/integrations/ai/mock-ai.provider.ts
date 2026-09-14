import { Injectable } from '@nestjs/common';
import { Intent } from '@ispagent/shared';
import { AIProvider, ComposeReplyInput, IntentClassification } from './ai-provider.interface';

const KEYWORD_RULES: Array<{ intent: Intent; keywords: string[] }> = [
  { intent: 'SEM_CONEXAO', keywords: ['sem internet', 'sem conexão', 'caiu a internet', 'não conecta', 'nao conecta'] },
  { intent: 'INTERNET_LENTA', keywords: ['lenta', 'lentidão', 'devagar', 'travando'] },
  { intent: 'QUEDAS', keywords: ['cai toda hora', 'fica caindo', 'oscilando', 'quedas', 'reconectando'] },
  { intent: 'SEGUNDA_VIA', keywords: ['segunda via', '2 via', '2ª via', 'boleto'] },
  { intent: 'PAGAMENTO', keywords: ['paguei', 'pagamento', 'comprovante'] },
  { intent: 'BLOQUEIO', keywords: ['bloqueado', 'bloqueio', 'desbloquear'] },
  { intent: 'FINANCEIRO', keywords: ['fatura', 'financeiro', 'conta', 'dívida', 'divida', 'atraso'] },
  { intent: 'UPGRADE', keywords: ['upgrade', 'aumentar velocidade', 'mais velocidade'] },
  { intent: 'PLANO', keywords: ['meu plano', 'qual plano', 'plano contratado'] },
  { intent: 'CONTRATACAO', keywords: ['contratar', 'nova instalação', 'nova instalacao', 'assinar'] },
  { intent: 'STATUS_CHAMADO', keywords: ['status do chamado', 'andamento do chamado', 'meu chamado'] },
  { intent: 'CHAMADO', keywords: ['abrir chamado', 'abrir um chamado', 'técnico', 'tecnico'] },
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

    const factLines = input.facts.map((f) => `- ${f.label}: ${this.formatValue(f.value)}`).join('\n');
    return `${greeting}aqui está o que encontrei:\n${factLines}`;
  }

  private formatValue(value: string | number | boolean | null): string {
    if (typeof value === 'boolean') return value ? 'sim' : 'não';
    if (value === null) return 'não informado';
    return String(value);
  }
}
