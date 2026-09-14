import { Injectable } from '@nestjs/common';
import { Claim, ToolResult } from '@ispagent/shared';

export class ClaimInvariantViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClaimInvariantViolationError';
  }
}

/**
 * Implementação concreta do invariante da seção 3.4: ao persistir um `AgentDecision`, todo `Claim` com
 * `type === 'FACT'` e `evidence` vazio, ou com evidência que não resolve para um `facts.path` de um
 * `ToolResult` daquele run, é um ERRO — nunca um "quase certo". Isso NÃO é enforcement por prompt; é
 * código que roda sempre, testado isoladamente aqui (test/claims.spec.ts) e usado pelo
 * AgentOrchestratorService antes de qualquer AgentRun ser marcado como respondido.
 */
@Injectable()
export class ClaimValidatorService {
  assertValid(claims: Claim[], toolResults: ToolResult[]): void {
    const factIndex = this.buildFactIndex(toolResults);

    for (const claim of claims) {
      if (claim.type !== 'FACT') continue;

      if (!claim.evidence || claim.evidence.length === 0) {
        throw new ClaimInvariantViolationError(
          `Claim FACT sem evidência: "${claim.text}". Toda afirmação de fato precisa citar de onde veio ` +
            `(toolCallId#facts.path) — sem isso, vira HANDOFF, nunca uma afirmação não rastreável.`,
        );
      }

      for (const ref of claim.evidence) {
        if (!factIndex.has(ref)) {
          throw new ClaimInvariantViolationError(
            `Claim FACT com evidência que não resolve: "${claim.text}" cita "${ref}", que não existe em ` +
              `nenhum ToolResult deste run. Fato citado precisa ter vindo de uma ferramenta executada agora.`,
          );
        }
      }
    }
  }

  /** true/false em vez de lançar — usado quando o chamador quer decidir o que fazer com a violação. */
  isValid(claims: Claim[], toolResults: ToolResult[]): boolean {
    try {
      this.assertValid(claims, toolResults);
      return true;
    } catch {
      return false;
    }
  }

  private buildFactIndex(toolResults: ToolResult[]): Set<string> {
    const index = new Set<string>();
    for (const result of toolResults) {
      for (const fact of result.facts) {
        index.add(`${result.toolCallId}#${fact.path}`);
      }
    }
    return index;
  }
}
