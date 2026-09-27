import {
  FlowDefinition,
  FlowDepartment,
  FlowEdge,
  FlowNode,
  FlowRunState,
  renderFlowText,
} from '@ispagent/shared';
import { normalizeDocument } from '../identity/identity-resolution.service';

/**
 * O que o motor precisa do "mundo" para executar um fluxo. No atendimento real é o orquestrador (SGP,
 * identificação por documento com limite de tentativas, chamados); no simulador do painel são dados
 * fictícios. O motor em si não toca banco nem ERP — só decide o caminho e o texto.
 */
export interface FlowRuntime {
  companyName: string;
  customerName(): string | null;
  isIdentified(): boolean;
  identify(document: string): Promise<'identified' | 'not_found' | 'locked'>;
  /** `reply` já vem pronto a partir dos fatos da consulta (nunca texto inventado). */
  lookup(query: 'invoice' | 'plan' | 'connection'): Promise<{ status: 'ok'; reply: string } | { status: 'not_found' | 'error' }>;
  openTicket(description: string): Promise<{ status: 'ok'; reply: string } | { status: 'error' }>;
  /** `null` = o provedor não configurou horário (a condição segue pelo "sim"). */
  isBusinessHours(): boolean | null;
  isHumanRequest(text: string): boolean;
}

export interface FlowStepResult {
  replies: string[];
  state: FlowRunState;
  /** `waiting` = parou num menu/pergunta; `ai` = a IA segue daqui; `handoff` = foi para um humano; `end` = terminou. */
  outcome: 'waiting' | 'ai' | 'handoff' | 'end';
  handoff?: { department: FlowDepartment; reason: string };
  /** Caminho percorrido neste turno (auditoria e simulador). */
  trace: Array<{ nodeId: string; type: FlowNode['type']; via?: string }>;
}

/** Proteção contra fluxo mal formado que escapou da validação: nunca gira mais que isso por mensagem. */
const MAX_STEPS_PER_TURN = 60;

const GAP_HANDOFF_TEXT = 'Vou te passar para um atendente, que continua o seu atendimento por aqui.';
const HUMAN_REQUEST_TEXT = 'Certo! Vou te passar para um atendente, que continua o atendimento por aqui.';
const LOCKED_TEXT =
  'Não consegui confirmar a sua identidade por aqui com segurança. Vou te passar para um atendente, que continua o atendimento.';

function strip(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "2", "2️⃣", "opção 2", o texto da opção ou parte dele. */
export function matchMenuOption(input: string, options: Array<{ id: string; label: string }>): string | null {
  const keycap = input.replace(/([0-9])️?⃣/g, '$1');
  const norm = strip(keycap);
  const num = /^(?:op(?:cao)?\s*)?(\d{1,2})$/.exec(norm);
  if (num) {
    const idx = Number(num[1]) - 1;
    return options[idx]?.id ?? null;
  }
  if (!norm) return null;
  const exact = options.find((o) => strip(o.label) === norm);
  if (exact) return exact.id;
  if (norm.length >= 3) {
    const partial = options.filter((o) => {
      const label = strip(o.label);
      return label.includes(norm) || norm.includes(label);
    });
    if (partial.length === 1) return partial[0].id;
  }
  return null;
}

/** Valida e normaliza a resposta de uma Pergunta; `null` = inválida. */
export function parseAnswer(kind: 'text' | 'cpf' | 'email' | 'phone', input: string): string | null {
  const value = input.trim();
  switch (kind) {
    case 'cpf':
      return normalizeDocument(value);
    case 'email':
      return /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(value) ? value.toLowerCase() : null;
    case 'phone': {
      const digits = value.replace(/\D/g, '');
      return digits.length >= 10 && digits.length <= 13 ? digits : null;
    }
    default:
      return value.length > 0 && value.length <= 500 ? value : null;
  }
}

function menuText(node: Extract<FlowNode, { type: 'menu' }>, vars: Record<string, string>): string {
  const opts = node.data.options.map((o, i) => `${i + 1}. ${o.label}`).join('\n');
  return `${renderFlowText(node.data.text, vars)}\n\n${opts}`;
}

export class FlowEngine {
  private readonly nodes: Map<string, FlowNode>;
  private readonly edges: Map<string, FlowEdge>;

  constructor(
    private readonly def: FlowDefinition,
    private readonly flowId: string,
    private readonly version: number,
  ) {
    this.nodes = new Map(def.nodes.map((n) => [n.id, n]));
    this.edges = new Map(def.edges.map((e) => [`${e.source}:${e.sourceHandle}`, e]));
  }

  /** Um turno: a mensagem do cliente entra, o motor anda até precisar dele de novo (ou terminar). */
  async step(previous: FlowRunState | null, input: string, rt: FlowRuntime): Promise<FlowStepResult> {
    const state: FlowRunState =
      previous && previous.flowId === this.flowId
        ? { ...previous, vars: { ...previous.vars } }
        : { flowId: this.flowId, version: this.version, waitingNodeId: null, vars: {}, retries: 0, status: 'running' };
    state.version = this.version;
    const result: FlowStepResult = { replies: [], state, outcome: 'waiting', trace: [] };
    this.refreshBuiltins(state, rt);

    let current: string | null;
    const waiting = state.waitingNodeId ? this.nodes.get(state.waitingNodeId) : undefined;

    if (!waiting) {
      // Primeira mensagem (ou o bloco de espera sumiu numa versão nova): começa do Início.
      current = this.def.startNodeId;
    } else {
      if (this.def.settings.humanRequestInterrupt && rt.isHumanRequest(input)) {
        return this.handoff(result, 'SUPORTE_TECNICO', HUMAN_REQUEST_TEXT, 'Cliente pediu atendimento humano durante o fluxo.');
      }
      const answered = this.answer(waiting, input, result);
      if (answered === 'retry') return result;
      current = answered;
    }

    for (let steps = 0; current; steps++) {
      if (steps >= MAX_STEPS_PER_TURN) {
        return this.handoff(result, 'SUPORTE_TECNICO', GAP_HANDOFF_TEXT, 'Fluxo excedeu o limite de passos (possível laço).');
      }
      const node = this.nodes.get(current);
      if (!node) return this.handoff(result, 'SUPORTE_TECNICO', GAP_HANDOFF_TEXT, 'Fluxo aponta para um bloco inexistente.');
      result.trace.push({ nodeId: node.id, type: node.type });
      const next = await this.run(node, result, rt);
      if (next === 'stop') return result;
      current = next;
    }
    return result;
  }

  /** Resposta do cliente a um bloco em espera: devolve o próximo bloco, ou `retry` (já respondeu de novo). */
  private answer(node: FlowNode, input: string, result: FlowStepResult): string | null | 'retry' {
    const { state } = result;
    if (node.type === 'menu') {
      const option = matchMenuOption(input, node.data.options);
      if (option) {
        state.retries = 0;
        result.trace.push({ nodeId: node.id, type: node.type, via: option });
        return this.follow(node, option, result);
      }
      return this.retryOrExit(node, 'fallback', result, () => `Não entendi. Responda com o número de uma das opções:\n\n${menuText(node, state.vars)}`);
    }
    if (node.type === 'ask') {
      const value = parseAnswer(node.data.kind, input);
      if (value !== null) {
        state.vars[node.data.variable] = value;
        state.retries = 0;
        result.trace.push({ nodeId: node.id, type: node.type, via: 'next' });
        return this.follow(node, 'next', result);
      }
      return this.retryOrExit(node, 'invalid', result, () =>
        renderFlowText(node.data.invalidText || 'Não entendi a resposta. Pode tentar de novo?', state.vars),
      );
    }
    return this.follow(node, 'next', result);
  }

  private retryOrExit(node: FlowNode, exit: string, result: FlowStepResult, again: () => string): string | null | 'retry' {
    const { state } = result;
    state.retries += 1;
    if (state.retries <= this.def.settings.maxRetries) {
      result.replies.push(again());
      state.waitingNodeId = node.id;
      result.outcome = 'waiting';
      return 'retry';
    }
    state.retries = 0;
    result.trace.push({ nodeId: node.id, type: node.type, via: exit });
    if (this.edges.has(`${node.id}:${exit}`)) return this.follow(node, exit, result);
    this.handoff(result, 'SUPORTE_TECNICO', GAP_HANDOFF_TEXT, 'Cliente não respondeu de forma válida no fluxo após as tentativas.');
    return 'retry';
  }

  /** Executa um bloco. Devolve o próximo bloco, `null` (fim silencioso) ou `stop` (turno encerrado). */
  private async run(node: FlowNode, result: FlowStepResult, rt: FlowRuntime): Promise<string | null | 'stop'> {
    const { state } = result;
    const vars = state.vars;
    switch (node.type) {
      case 'start':
        return this.follow(node, 'next', result);
      case 'message':
        result.replies.push(renderFlowText(node.data.text, vars));
        return this.follow(node, 'next', result);
      case 'menu':
        result.replies.push(menuText(node, vars));
        return this.wait(node, result);
      case 'ask':
        result.replies.push(renderFlowText(node.data.text, vars));
        return this.wait(node, result);
      case 'identify': {
        if (rt.isIdentified()) return this.follow(node, 'found', result);
        const document = vars[node.data.variable] ?? '';
        const outcome = document ? await rt.identify(document) : 'not_found';
        if (outcome === 'locked') {
          this.handoff(result, 'SUPORTE_TECNICO', LOCKED_TEXT, 'Identidade não confirmada: limite de tentativas de documento no fluxo.');
          return 'stop';
        }
        this.refreshBuiltins(state, rt);
        return this.follow(node, outcome === 'identified' ? 'found' : 'not_found', result);
      }
      case 'lookup': {
        if (!rt.isIdentified()) return this.follow(node, 'not_found', result);
        const res = await rt.lookup(node.data.query);
        if (res.status === 'ok') result.replies.push(res.reply);
        return this.follow(node, res.status, result);
      }
      case 'ticket': {
        if (!rt.isIdentified()) return this.follow(node, 'error', result);
        const res = await rt.openTicket(renderFlowText(node.data.description, vars));
        if (res.status === 'ok') result.replies.push(res.reply);
        return this.follow(node, res.status, result);
      }
      case 'condition':
        return this.follow(node, this.evaluate(node, vars, rt) ? 'true' : 'false', result);
      case 'ai':
        if (node.data.text?.trim()) result.replies.push(renderFlowText(node.data.text, vars));
        state.status = 'ai';
        state.waitingNodeId = null;
        result.outcome = 'ai';
        return 'stop';
      case 'handoff':
        this.handoff(
          result,
          node.data.department,
          renderFlowText(node.data.text?.trim() || GAP_HANDOFF_TEXT, vars),
          'Encaminhado pelo fluxo de atendimento.',
        );
        return 'stop';
      case 'end':
        if (node.data.text?.trim()) result.replies.push(renderFlowText(node.data.text, vars));
        state.status = 'done';
        state.waitingNodeId = null;
        result.outcome = 'end';
        return 'stop';
    }
  }

  private evaluate(node: Extract<FlowNode, { type: 'condition' }>, vars: Record<string, string>, rt: FlowRuntime): boolean {
    const data = node.data;
    if (data.mode === 'builtin') {
      return data.builtin === 'identified' ? rt.isIdentified() : rt.isBusinessHours() !== false;
    }
    const actual = strip(vars[data.variable] ?? '');
    const expected = strip(data.value ?? '');
    switch (data.op) {
      case 'equals':
        return actual === expected;
      case 'not_equals':
        return actual !== expected;
      case 'contains':
        return expected.length > 0 && actual.includes(expected);
      case 'is_set':
        return actual.length > 0;
      case 'is_empty':
        return actual.length === 0;
    }
  }

  /** Segue a saída; saída opcional sem ligação = transferência (o cliente nunca fica sem resposta). */
  private follow(node: FlowNode, handle: string, result: FlowStepResult): string | null {
    const edge = this.edges.get(`${node.id}:${handle}`);
    if (edge) return edge.target;
    this.handoff(result, 'SUPORTE_TECNICO', GAP_HANDOFF_TEXT, `Fluxo sem continuação na saída "${handle}" do bloco ${node.id}.`);
    return null;
  }

  private wait(node: FlowNode, result: FlowStepResult): 'stop' {
    result.state.waitingNodeId = node.id;
    result.state.retries = 0;
    result.outcome = 'waiting';
    return 'stop';
  }

  private handoff(result: FlowStepResult, department: FlowDepartment, text: string, reason: string): FlowStepResult {
    if (result.outcome !== 'handoff') result.replies.push(text);
    result.state.status = 'done';
    result.state.waitingNodeId = null;
    result.outcome = 'handoff';
    result.handoff = { department, reason };
    return result;
  }

  private refreshBuiltins(state: FlowRunState, rt: FlowRuntime) {
    const name = rt.customerName()?.trim() ?? '';
    const first = name.split(/\s+/)[0] ?? '';
    state.vars.empresa = rt.companyName;
    state.vars.nome = name;
    state.vars.primeiro_nome = first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : '';
  }
}
