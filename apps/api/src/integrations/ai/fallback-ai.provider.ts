import { Logger } from '@nestjs/common';
import { Confidence, Intent } from '@ispagent/shared';
import { AIProvider, ComposeReplyInput, IntentClassification } from './ai-provider.interface';

/**
 * Provider real com o Mock como reserva: se a IA externa cair (503 de alta demanda, cota, rede), aquele
 * passo do turno é feito pelas regras do Mock em vez de mandar o cliente para um atendente. Continua sem
 * inventar nada — o Mock também só usa os fatos das ferramentas.
 */
export class FallbackAIProvider implements AIProvider {
  private readonly logger = new Logger(FallbackAIProvider.name);
  private coolingDownUntil = 0;

  constructor(
    private readonly primary: AIProvider,
    private readonly backup: AIProvider,
  ) {}

  get name() {
    return this.primary.name;
  }
  get mode() {
    return this.primary.mode;
  }
  get model() {
    return this.primary.model;
  }

  private isCoolingDown(): boolean {
    return Date.now() < this.coolingDownUntil;
  }

  private triggerCooldown(err: unknown) {
    // Se a IA principal falhar (cota excedida, rede, 503), ativa cooldown de 30s
    // para responder instantaneamente pelas regras sem travar o cliente por segundos em cada mensagem.
    this.coolingDownUntil = Date.now() + 30_000;
    this.logger.warn(
      `Circuit Breaker ativado para ${this.primary.name} por 30s devido a erro: ${String(err).slice(0, 100)}`,
    );
  }

  async classifyIntent(message: string): Promise<IntentClassification> {
    if (this.isCoolingDown()) {
      return this.backup.classifyIntent(message);
    }

    try {
      return await this.primary.classifyIntent(message);
    } catch (err) {
      this.triggerCooldown(err);
      this.logger.warn(`${this.primary.name} indisponível na classificação — usando regras: ${String(err).slice(0, 120)}`);
      return this.backup.classifyIntent(message);
    }
  }

  async composeReply(input: ComposeReplyInput): Promise<string> {
    if (this.isCoolingDown()) {
      return this.backup.composeReply(input);
    }

    try {
      return await this.primary.composeReply(input);
    } catch (err) {
      this.triggerCooldown(err);
      this.logger.warn(`${this.primary.name} indisponível na resposta — usando regras: ${String(err).slice(0, 120)}`);
      return this.backup.composeReply(input);
    }
  }

  async classifyIntents(message: string): Promise<{ intents: Intent[]; primary: Intent; confidence: Confidence }> {
    const viaSingle = async (p: AIProvider) => {
      const c = await p.classifyIntent(message);
      return { intents: [c.intent], primary: c.intent, confidence: c.confidence };
    };
    const run = (p: AIProvider) => (p.classifyIntents ? p.classifyIntents(message) : viaSingle(p));
    if (this.isCoolingDown()) return run(this.backup);
    try {
      return await run(this.primary);
    } catch (err) {
      this.triggerCooldown(err);
      this.logger.warn(`${this.primary.name} indisponível na classificação — usando regras: ${String(err).slice(0, 120)}`);
      return run(this.backup);
    }
  }

  // Áudio e comprovante não têm reserva: as regras não leem mídia, e inventar o conteúdo seria pior que falhar.
  get transcribeAudio(): AIProvider['transcribeAudio'] {
    return this.primary.transcribeAudio?.bind(this.primary);
  }

  get analyzeReceipt(): AIProvider['analyzeReceipt'] {
    return this.primary.analyzeReceipt?.bind(this.primary);
  }
}
