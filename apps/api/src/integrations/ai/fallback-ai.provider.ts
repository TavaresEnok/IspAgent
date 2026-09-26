import { Logger } from '@nestjs/common';
import { Confidence, Intent } from '@ispagent/shared';
import { AIProvider, ComposeReplyInput, IntentClassification } from './ai-provider.interface';

const COOLDOWN_MS = 30_000;

/** Estado do disjuntor. Compartilhado entre turnos: cada turno cria um FallbackAIProvider novo. */
export interface CircuitBreaker {
  openUntil: number;
}

/**
 * Provider real com o Mock como reserva: se a IA externa cair (503 de alta demanda, cota, rede), aquele
 * passo do turno é feito pelas regras do Mock em vez de mandar o cliente para um atendente. Continua sem
 * inventar nada — o Mock também só usa os fatos das ferramentas.
 *
 * `mode`/`model` refletem quem respondeu: se a reserva foi usada em algum passo do turno, o registro
 * (AgentRun, auditoria, dashboard) mostra a reserva, não a IA que falhou.
 */
export class FallbackAIProvider implements AIProvider {
  private readonly logger = new Logger(FallbackAIProvider.name);
  private usedBackup = false;

  constructor(
    private readonly primary: AIProvider,
    private readonly backup: AIProvider,
    private readonly breaker: CircuitBreaker = { openUntil: 0 },
  ) {}

  get name() {
    return this.usedBackup ? this.backup.name : this.primary.name;
  }
  get mode() {
    return this.usedBackup ? this.backup.mode : this.primary.mode;
  }
  get model() {
    return this.usedBackup ? `${this.backup.model} (reserva de ${this.primary.model})` : this.primary.model;
  }

  private async attempt<T>(step: string, viaPrimary: () => Promise<T>, viaBackup: () => Promise<T>): Promise<T> {
    if (Date.now() < this.breaker.openUntil) {
      this.usedBackup = true;
      return viaBackup();
    }
    try {
      return await viaPrimary();
    } catch (err) {
      // Pausa a IA principal por 30s: sem isso, cada mensagem espera ela falhar de novo.
      this.breaker.openUntil = Date.now() + COOLDOWN_MS;
      this.logger.warn(`${this.primary.name} indisponível (${step}) — usando regras por 30s: ${String(err).slice(0, 120)}`);
      this.usedBackup = true;
      return viaBackup();
    }
  }

  classifyIntent(message: string): Promise<IntentClassification> {
    return this.attempt('classificação', () => this.primary.classifyIntent(message), () => this.backup.classifyIntent(message));
  }

  composeReply(input: ComposeReplyInput): Promise<string> {
    return this.attempt('resposta', () => this.primary.composeReply(input), () => this.backup.composeReply(input));
  }

  classifyIntents(message: string): Promise<{ intents: Intent[]; primary: Intent; confidence: Confidence }> {
    const run = async (p: AIProvider) => {
      if (p.classifyIntents) return p.classifyIntents(message);
      const c = await p.classifyIntent(message);
      return { intents: [c.intent], primary: c.intent, confidence: c.confidence };
    };
    return this.attempt('classificação', () => run(this.primary), () => run(this.backup));
  }

  // Áudio e comprovante não têm reserva: as regras não leem mídia, e inventar o conteúdo seria pior que falhar.
  get transcribeAudio(): AIProvider['transcribeAudio'] {
    return this.primary.transcribeAudio?.bind(this.primary);
  }

  get analyzeReceipt(): AIProvider['analyzeReceipt'] {
    return this.primary.analyzeReceipt?.bind(this.primary);
  }
}
