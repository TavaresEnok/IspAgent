import { Claim, ToolResult } from '@ispagent/shared';
import { ClaimValidatorService, ClaimInvariantViolationError } from '../src/agent/claim-validator.service';

/**
 * Invariante executável da seção 3.4: FACT sem evidência válida é erro de runtime, não é opcional e não
 * é só prompt. Teste unitário puro — sem banco, sem tenant, exatamente o que a seção exige que exista.
 */
describe('ClaimValidatorService (invariante FACT/evidence — seção 3.4)', () => {
  let validator: ClaimValidatorService;

  const toolResult: ToolResult = {
    toolCallId: 'call-1',
    tool: 'BillingTool',
    status: 'OK',
    source: { adapter: 'MockERPAdapter', mode: 'DEMO', latencyMs: 5, capability: 'financial_status' },
    facts: [{ path: 'data.financial.hasOverdueInvoice', label: 'Fatura em atraso', value: true }],
  };

  beforeEach(() => {
    validator = new ClaimValidatorService();
  });

  it('aceita um Claim FACT com evidência que resolve para um facts.path real', () => {
    const claims: Claim[] = [
      { text: 'O cliente tem fatura em atraso.', type: 'FACT', evidence: ['call-1#data.financial.hasOverdueInvoice'] },
    ];
    expect(() => validator.assertValid(claims, [toolResult])).not.toThrow();
  });

  it('rejeita um Claim FACT sem evidência', () => {
    const claims: Claim[] = [{ text: 'O cliente tem fatura em atraso.', type: 'FACT', evidence: [] }];
    expect(() => validator.assertValid(claims, [toolResult])).toThrow(ClaimInvariantViolationError);
  });

  it('rejeita um Claim FACT cuja evidência aponta para um toolCallId inexistente', () => {
    const claims: Claim[] = [
      { text: 'O cliente tem fatura em atraso.', type: 'FACT', evidence: ['call-inexistente#data.financial.hasOverdueInvoice'] },
    ];
    expect(() => validator.assertValid(claims, [toolResult])).toThrow(ClaimInvariantViolationError);
  });

  it('rejeita um Claim FACT cuja evidência aponta para um facts.path que não existe naquele ToolResult', () => {
    const claims: Claim[] = [
      { text: 'O cliente está sem sinal óptico.', type: 'FACT', evidence: ['call-1#data.optical.rxDbm'] },
    ];
    expect(() => validator.assertValid(claims, [toolResult])).toThrow(ClaimInvariantViolationError);
  });

  it('INFERENCE, RECOMMENDATION e UNKNOWN nunca precisam de evidência', () => {
    const claims: Claim[] = [
      { text: 'Provavelmente é um problema de roteador.', type: 'INFERENCE', evidence: [] },
      { text: 'Recomendo reiniciar o equipamento.', type: 'RECOMMENDATION', evidence: [] },
      { text: 'Não sei o motivo da lentidão.', type: 'UNKNOWN', evidence: [] },
    ];
    expect(() => validator.assertValid(claims, [toolResult])).not.toThrow();
  });

  it('isValid() devolve false em vez de lançar, para quem preferir checar sem try/catch', () => {
    const claims: Claim[] = [{ text: 'x', type: 'FACT', evidence: [] }];
    expect(validator.isValid(claims, [toolResult])).toBe(false);
    expect(validator.isValid([], [toolResult])).toBe(true);
  });

  it('um único Claim inválido entre vários derruba a validação inteira (fail-closed)', () => {
    const claims: Claim[] = [
      { text: 'Fato real.', type: 'FACT', evidence: ['call-1#data.financial.hasOverdueInvoice'] },
      { text: 'Fato inventado.', type: 'FACT', evidence: [] },
    ];
    expect(() => validator.assertValid(claims, [toolResult])).toThrow(ClaimInvariantViolationError);
  });
});
