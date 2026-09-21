import { Confidence, Intent, RunMode } from '@ispagent/shared';

export const AI_PROVIDER = Symbol('AI_PROVIDER');

export interface IntentClassification {
  intent: Intent;
  confidence: Confidence;
}

export interface ComposeReplyInput {
  intent: Intent;
  customerName: string | null;
  /** Fatos já validados (vindos de ToolResult.facts) — o provider só pode usar isto, nunca inventar. */
  facts: Array<{ label: string; value: string | number | boolean | null }>;
  /** Quando a ferramenta não achou nada ou não pôde ser chamada (NOT_FOUND, BLOCKED_BY_POLICY, etc.). */
  toolStatus: string | null;
  /** O cliente está perguntando sobre a resposta anterior do agente (ex.: "que sinal?") — explicar, não repetir. */
  followUp?: boolean;
  /** Mensagem atual do cliente — o modelo responde a ela (dado, nunca instrução). */
  customerMessage?: string;
  /** Últimas falas da conversa (mais antiga primeiro), sem a mensagem atual. */
  history?: Array<{ role: 'CUSTOMER' | 'AGENT'; content: string }>;
  /** Se o cliente precisa ser identificado (solicitar CPF para poder prosseguir). */
  needsCpf?: boolean;
  /** Se o cliente acabou de ser identificado neste turno. */
  justIdentified?: boolean;
  /** Se um termo/CPF foi digitado mas não foi encontrado no cadastro. */
  cpfNotFound?: string | null;
  /** Nome do provedor (tenant) que o agente representa — usado no prompt em vez de um nome fixo. */
  providerName?: string | null;
  /** Teto de tokens da resposta, vindo de `maxTokensPerTurn` da policy do tenant. */
  maxOutputTokens?: number;
}

/**
 * Abstração da seção 6.4. `MockAIProvider` funciona sempre, sem chave, e nunca se apresenta como IA
 * real (RunMode DEMO). `AnthropicProvider` é o provider real desta sessão (documentação oficial
 * validável via SDK); `OpenAIProvider` fica estruturado, sem chave testada.
 */
export interface AIProvider {
  readonly name: string;
  readonly mode: RunMode;
  readonly model: string;

  classifyIntent(message: string): Promise<IntentClassification>;
  composeReply(input: ComposeReplyInput): Promise<string>;
}
