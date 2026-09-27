import { FlowDefinition, FlowRunState, starterFlow, validateFlow, flowHasErrors } from '@ispagent/shared';
import { FlowEngine, FlowRuntime, matchMenuOption, parseAnswer } from '../src/flows/flow-engine';

/** Mundo falso: CPF 111.111.111-02 existe (Bruno), o resto não. */
function fakeRuntime(overrides: Partial<FlowRuntime> = {}) {
  let name: string | null = null;
  const calls: string[] = [];
  const rt: FlowRuntime = {
    companyName: 'Vibe Telecom',
    customerName: () => name,
    isIdentified: () => name !== null,
    identify: async (doc) => {
      calls.push(`identify:${doc}`);
      if (doc === '11111111102') {
        name = 'BRUNO ALMEIDA LIMA';
        return 'identified';
      }
      return 'not_found';
    },
    lookup: async (q) => {
      calls.push(`lookup:${q}`);
      return { status: 'ok', reply: `resultado ${q}` };
    },
    openTicket: async (d) => {
      calls.push(`ticket:${d}`);
      return { status: 'ok', reply: 'Chamado aberto.' };
    },
    isBusinessHours: () => true,
    isHumanRequest: (t) => /atendente/i.test(t),
    ...overrides,
  };
  return { rt, calls };
}

async function run(def: FlowDefinition, messages: string[], rt: FlowRuntime) {
  const engine = new FlowEngine(def, 'flow-1', 1);
  let state: FlowRunState | null = null;
  const turns = [];
  for (const m of messages) {
    const r = await engine.step(state, m, rt);
    turns.push(r);
    state = r.state;
  }
  return turns;
}

describe('construtor de fluxo — validação', () => {
  it('o fluxo inicial vem válido (pode publicar direto)', () => {
    const issues = validateFlow(starterFlow());
    expect(flowHasErrors(issues)).toBe(false);
  });

  it('menu com opção sem ligação, texto vazio e laço sem espera são erros', () => {
    const def = starterFlow();
    def.edges = def.edges.filter((e) => e.sourceHandle !== 'op_outro');
    const msg = def.nodes.find((n) => n.id === 'boas_vindas')!;
    (msg.data as { text: string }).text = '  ';
    def.nodes.push({ id: 'a', type: 'message', position: { x: 0, y: 0 }, data: { text: 'a' } });
    def.nodes.push({ id: 'b', type: 'message', position: { x: 0, y: 0 }, data: { text: 'b' } });
    def.edges.push({ id: 'x1', source: 'a', sourceHandle: 'next', target: 'b' }, { id: 'x2', source: 'b', sourceHandle: 'next', target: 'a' });
    const messages = validateFlow(def).filter((i) => i.severity === 'error').map((i) => i.message);
    expect(messages.some((m) => m.includes('Outro assunto'))).toBe(true);
    expect(messages.some((m) => m.includes('texto está vazio'))).toBe(true);
    expect(messages.some((m) => m.includes('laço'))).toBe(true);
  });

  it('saída ligada a dois blocos e conexão voltando para o Início são erros', () => {
    const def = starterFlow();
    def.edges.push({ id: 'dup', source: 'boas_vindas', sourceHandle: 'next', target: 'pede_cpf' });
    def.edges.push({ id: 'back', source: 'fim_fatura', sourceHandle: 'next', target: 'inicio' });
    const messages = validateFlow(def).map((i) => i.message);
    expect(messages.some((m) => m.includes('ligada a dois blocos'))).toBe(true);
    expect(messages.some((m) => m.includes('voltar para o Início') || m.includes('não existe'))).toBe(true);
  });
});

describe('construtor de fluxo — motor', () => {
  it('menu → CPF → identifica → fatura → fim', async () => {
    const { rt, calls } = fakeRuntime();
    const [t1, t2, t3] = await run(starterFlow(), ['oi', '1', '111.111.111-02'], rt);
    expect(t1.replies[0]).toContain('Vibe Telecom');
    expect(t1.replies[1]).toContain('1. 2ª via da fatura');
    expect(t1.outcome).toBe('waiting');
    expect(t2.replies[0]).toContain('CPF');
    expect(t3.replies).toEqual(['resultado invoice', 'Posso ajudar em mais alguma coisa? É só escrever.']);
    expect(t3.outcome).toBe('end');
    expect(calls).toEqual(['identify:11111111102', 'lookup:invoice']);
  });

  it('CPF que não existe segue pela saída "não encontrado" (transferência para o financeiro)', async () => {
    const { rt } = fakeRuntime();
    const turns = await run(starterFlow(), ['oi', '2ª via', '999.999.999-99'], rt);
    const last = turns[2];
    expect(last.outcome).toBe('handoff');
    expect(last.handoff?.department).toBe('FINANCEIRO');
  });

  it('resposta inválida pede de novo; esgotadas as tentativas sem saída ligada, transfere', async () => {
    const { rt } = fakeRuntime();
    const turns = await run(starterFlow(), ['oi', 'banana', 'laranja', 'uva'], rt);
    expect(turns[1].replies[0]).toContain('Não entendi');
    expect(turns[1].outcome).toBe('waiting');
    expect(turns[2].outcome).toBe('waiting');
    expect(turns[3].outcome).toBe('handoff');
  });

  it('"quero um atendente" no meio do fluxo transfere na hora', async () => {
    const { rt } = fakeRuntime();
    const turns = await run(starterFlow(), ['oi', 'quero falar com um atendente'], rt);
    expect(turns[1].outcome).toBe('handoff');
    expect(turns[1].state.status).toBe('done');
  });

  it('bloco "Passar para a IA" encerra a condução do fluxo', async () => {
    const { rt } = fakeRuntime();
    const turns = await run(starterFlow(), ['oi', '3'], rt);
    expect(turns[1].outcome).toBe('ai');
    expect(turns[1].state.status).toBe('ai');
    expect(turns[1].replies).toEqual(['Claro! Me conta o que você precisa.']);
  });

  it('identificação bloqueada (tentativas esgotadas) transfere sem consultar nada', async () => {
    const { rt, calls } = fakeRuntime({ identify: async () => 'locked' });
    const turns = await run(starterFlow(), ['oi', '1', '111.111.111-02'], rt);
    expect(turns[2].outcome).toBe('handoff');
    expect(calls.some((c) => c.startsWith('lookup'))).toBe(false);
  });

  it('variáveis nos textos: {{primeiro_nome}} vem do cadastro, variável inexistente some', async () => {
    const def = starterFlow();
    const fim = def.nodes.find((n) => n.id === 'fim_fatura')!;
    (fim.data as { text: string }).text = 'Obrigado, {{primeiro_nome}}! {{naoexiste}}';
    const { rt } = fakeRuntime();
    const turns = await run(def, ['oi', '1', '11111111102'], rt);
    expect(turns[2].replies[1]).toBe('Obrigado, Bruno!');
  });

  it('versão nova sem o bloco em espera recomeça do Início em vez de travar', async () => {
    const { rt } = fakeRuntime();
    const engine = new FlowEngine(starterFlow(), 'flow-1', 2);
    const r = await engine.step(
      { flowId: 'flow-1', version: 1, waitingNodeId: 'bloco_removido', vars: {}, retries: 0, status: 'running' },
      'oi',
      rt,
    );
    expect(r.state.version).toBe(2);
    expect(r.replies[1]).toContain('Como posso te ajudar?');
  });

  it('entende número, emoji de número, texto da opção e parte dele', () => {
    const opts = [
      { id: 'a', label: '2ª via da fatura' },
      { id: 'b', label: 'Problema na internet' },
    ];
    expect(matchMenuOption('2', opts)).toBe('b');
    expect(matchMenuOption('2️⃣', opts)).toBe('b');
    expect(matchMenuOption('opção 1', opts)).toBe('a');
    expect(matchMenuOption('problema na internet', opts)).toBe('b');
    expect(matchMenuOption('fatura', opts)).toBe('a');
    expect(matchMenuOption('9', opts)).toBeNull();
    expect(matchMenuOption('oi', opts)).toBeNull();
  });

  it('valida as respostas das perguntas', () => {
    expect(parseAnswer('cpf', '041.039.184-03')).toBe('04103918403');
    expect(parseAnswer('cpf', '123')).toBeNull();
    expect(parseAnswer('email', 'Joao@Exemplo.com')).toBe('joao@exemplo.com');
    expect(parseAnswer('email', 'joao@')).toBeNull();
    expect(parseAnswer('phone', '(81) 99999-0000')).toBe('81999990000');
    expect(parseAnswer('text', '   ')).toBeNull();
  });
});
