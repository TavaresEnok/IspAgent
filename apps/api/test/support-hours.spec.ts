import { isWithinSupportHours, parseSupportHours } from '../src/agent/support-hours';

// Datas em UTC; Brasília = UTC-3. 2026-09-23 é quarta-feira.
const at = (iso: string) => new Date(iso);

describe('horário de atendimento', () => {
  const comercial = 'Segunda a Sexta, 08h às 18h';

  it('entende o formato padrão da persona', () => {
    expect(parseSupportHours(comercial)).toEqual([{ days: [1, 2, 3, 4, 5], startMin: 480, endMin: 1080 }]);
  });

  it('dentro e fora do expediente, no fuso de Brasília', () => {
    expect(isWithinSupportHours(comercial, at('2026-09-23T13:00:00Z'))).toBe(true); // qua 10h
    expect(isWithinSupportHours(comercial, at('2026-09-23T22:30:00Z'))).toBe(false); // qua 19h30
    expect(isWithinSupportHours(comercial, at('2026-09-23T10:30:00Z'))).toBe(false); // qua 7h30
    expect(isWithinSupportHours(comercial, at('2026-09-26T13:00:00Z'))).toBe(false); // sáb 10h
  });

  it('vários trechos e formato com dois-pontos', () => {
    const text = 'Seg a Sex, 8:00 - 18:00; Sábado, 8h às 12h';
    expect(isWithinSupportHours(text, at('2026-09-26T13:00:00Z'))).toBe(true); // sáb 10h
    expect(isWithinSupportHours(text, at('2026-09-26T16:00:00Z'))).toBe(false); // sáb 13h
  });

  it('24h e todos os dias', () => {
    expect(isWithinSupportHours('Todos os dias, 24h', at('2026-09-27T06:00:00Z'))).toBe(true);
  });

  it('texto não reconhecido não afirma nada (null)', () => {
    expect(isWithinSupportHours('horário comercial')).toBeNull();
    expect(isWithinSupportHours('')).toBeNull();
  });
});
