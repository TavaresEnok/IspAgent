/**
 * Contratos "espelho" de clientes REAIS do PulseISP (modo simulador do painel) usam o prefixo `pulse_` —
 * é o que separa, sem ambiguidade, o que vai para o PulseISP de verdade do que é dado DEMO do seed.
 */
export const PULSE_ID_PREFIX = 'pulse_';

export function isPulseId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith(PULSE_ID_PREFIX) && id.length > PULSE_ID_PREFIX.length;
}

export function toPulseId(pulseCustomerId: string): string {
  return `${PULSE_ID_PREFIX}${pulseCustomerId}`;
}

export function fromPulseId(id: string): string | null {
  return isPulseId(id) ? id.slice(PULSE_ID_PREFIX.length) : null;
}
