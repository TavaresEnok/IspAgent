import { cancellationStep, isHumanRequest, isScopeQuestion } from '../src/agent/quick-flows';

describe('quick-flows', () => {
  it.each([
    'quero falar com um atendente',
    'me passa para um atendente',
    'quero falar com uma pessoa',
    'atendimento humano por favor',
    'você não me ajuda em nada',
  ])('pedido de humano: "%s"', (msg) => {
    expect(isHumanRequest(msg)).toBe(true);
  });

  it.each([
    'a pessoa da instalação não veio',
    'minha operadora é a melhor da cidade',
    'reiniciar não ajuda, continua caindo',
    'minha internet está lenta',
  ])('relato, não pedido de humano: "%s"', (msg) => {
    expect(isHumanRequest(msg)).toBe(false);
  });

  it('"ajuda" com assunto reconhecido não vira menu; sem assunto, vira', () => {
    expect(isScopeQuestion('preciso de ajuda com minha fatura', 'FINANCEIRO')).toBe(false);
    expect(isScopeQuestion('preciso de ajuda', 'OUTRO')).toBe(true);
    expect(isScopeQuestion('o que você pode fazer?', 'OUTRO')).toBe(true);
  });

  it('cancelamento sem motivo pergunta o motivo; com motivo, transfere', () => {
    expect(cancellationStep('quero cancelar', null, false).kind).toBe('ASK_REASON');
    const moving = cancellationStep('quero cancelar, vou me mudar', null, false);
    expect(moving).toMatchObject({ kind: 'TRANSFER', priceRelated: false });
  });

  it('motivo de preço vai para a retenção sem prometer desconto', () => {
    const step = cancellationStep('tá muito caro', 'MARIA SILVA', true);
    expect(step).toMatchObject({ kind: 'TRANSFER', priceRelated: true });
    expect(step.reply).toMatch(/^Maria, /);
    expect(step.reply).not.toMatch(/aplique|desconto/i);
  });

  it('resposta vaga depois de perguntar o motivo não pergunta de novo', () => {
    expect(cancellationStep('sei lá, só quero cancelar', null, true).kind).toBe('TRANSFER');
  });
});
