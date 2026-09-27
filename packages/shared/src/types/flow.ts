/**
 * Fluxo de atendimento visual (construtor de fluxo do painel). O mesmo modelo e a mesma validação servem
 * o editor (para mostrar os erros enquanto a pessoa monta) e a API (que recusa publicar um fluxo inválido).
 *
 * Um fluxo é um grafo: blocos (`nodes`) ligados por conexões (`edges`). Cada saída de um bloco é um
 * "handle" com nome (ex.: o menu tem uma saída por opção; a condição tem `true`/`false`). O motor anda
 * sozinho pelos blocos até chegar num bloco que espera o cliente (menu, pergunta) ou num bloco final.
 */

export const FLOW_SCHEMA_VERSION = 1;

export type FlowNodeType =
  | 'start'
  | 'message'
  | 'menu'
  | 'ask'
  | 'identify'
  | 'lookup'
  | 'ticket'
  | 'condition'
  | 'ai'
  | 'handoff'
  | 'end';

export type FlowAskKind = 'text' | 'cpf' | 'email' | 'phone';
export type FlowLookup = 'invoice' | 'plan' | 'connection';
export type FlowDepartment = 'SUPORTE_TECNICO' | 'FINANCEIRO' | 'COMERCIAL' | 'RETENCAO';
export type FlowConditionOp = 'equals' | 'not_equals' | 'contains' | 'is_set' | 'is_empty';
export type FlowBuiltinCondition = 'business_hours' | 'identified';

export interface FlowMenuOption {
  id: string;
  label: string;
}

export interface FlowNodeData {
  start: Record<string, never>;
  message: { text: string };
  menu: { text: string; options: FlowMenuOption[] };
  ask: { text: string; variable: string; kind: FlowAskKind; invalidText?: string };
  identify: { variable: string };
  lookup: { query: FlowLookup };
  ticket: { description: string };
  condition:
    | { mode: 'builtin'; builtin: FlowBuiltinCondition }
    | { mode: 'variable'; variable: string; op: FlowConditionOp; value?: string };
  ai: { text?: string };
  handoff: { department: FlowDepartment; text?: string };
  end: { text?: string };
}

export type FlowNode = {
  [T in FlowNodeType]: { id: string; type: T; position: { x: number; y: number }; data: FlowNodeData[T] };
}[FlowNodeType];

export interface FlowEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
}

export interface FlowSettings {
  /** "Quero falar com um atendente" em qualquer ponto do fluxo transfere na hora. */
  humanRequestInterrupt: boolean;
  /** Tentativas de resposta inválida (menu/pergunta) antes de seguir pela saída de erro. */
  maxRetries: number;
}

export interface FlowDefinition {
  schemaVersion: number;
  startNodeId: string;
  settings: FlowSettings;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

/** Estado do fluxo numa conversa (guardado na conversa entre uma mensagem e outra). */
export interface FlowRunState {
  flowId: string;
  version: number;
  /** Bloco que está esperando a resposta do cliente; `null` antes de começar. */
  waitingNodeId: string | null;
  vars: Record<string, string>;
  retries: number;
  /** `running` = o fluxo conduz; `ai` = passou para a IA; `done` = terminou. */
  status: 'running' | 'ai' | 'done';
}

// ---------------------------------------------------------------------------------------------------------
// Metadados dos blocos (rótulos e saídas) — usados pelo editor e pela validação.

export const FLOW_NODE_LABEL: Record<FlowNodeType, string> = {
  start: 'Início',
  message: 'Mensagem',
  menu: 'Menu de opções',
  ask: 'Pergunta',
  identify: 'Identificar cliente',
  lookup: 'Consultar SGP',
  ticket: 'Abrir chamado',
  condition: 'Condição',
  ai: 'Passar para a IA',
  handoff: 'Transferir para humano',
  end: 'Fim',
};

export const FLOW_LOOKUP_LABEL: Record<FlowLookup, string> = {
  invoice: 'Fatura (2ª via + PIX)',
  plan: 'Plano contratado',
  connection: 'Diagnóstico da conexão',
};

export const FLOW_DEPARTMENT_LABEL: Record<FlowDepartment, string> = {
  SUPORTE_TECNICO: 'Suporte técnico',
  FINANCEIRO: 'Financeiro',
  COMERCIAL: 'Comercial',
  RETENCAO: 'Retenção',
};

export const FLOW_HANDLE_LABEL: Record<string, string> = {
  next: 'depois',
  fallback: 'não entendeu',
  invalid: 'inválida',
  found: 'encontrado',
  not_found: 'não encontrado',
  ok: 'ok',
  error: 'falhou',
  true: 'sim',
  false: 'não',
};

/** Blocos que param e esperam a próxima mensagem do cliente. */
export const FLOW_WAITING_TYPES: FlowNodeType[] = ['menu', 'ask'];
/** Blocos que encerram a condução do fluxo. */
export const FLOW_TERMINAL_TYPES: FlowNodeType[] = ['ai', 'handoff', 'end'];

/** Saídas de um bloco, na ordem em que o editor as desenha. */
export function flowNodeHandles(node: FlowNode): string[] {
  switch (node.type) {
    case 'start':
    case 'message':
      return ['next'];
    case 'menu':
      return [...node.data.options.map((o) => o.id), 'fallback'];
    case 'ask':
      return ['next', 'invalid'];
    case 'identify':
      return ['found', 'not_found'];
    case 'lookup':
      return ['ok', 'not_found', 'error'];
    case 'ticket':
      return ['ok', 'error'];
    case 'condition':
      return ['true', 'false'];
    default:
      return [];
  }
}

/**
 * Saídas que PRECISAM estar ligadas. As demais são opcionais: sem ligação, o motor tenta de novo (menu e
 * pergunta) ou transfere para um atendente (falhas de consulta) — nunca deixa o cliente sem resposta.
 */
export function flowRequiredHandles(node: FlowNode): string[] {
  switch (node.type) {
    case 'start':
    case 'message':
      return ['next'];
    case 'menu':
      return node.data.options.map((o) => o.id);
    case 'ask':
      return ['next'];
    case 'identify':
      return ['found'];
    case 'lookup':
    case 'ticket':
      return ['ok'];
    case 'condition':
      return ['true', 'false'];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------------------------------------
// Validação

export interface FlowIssue {
  severity: 'error' | 'warning';
  message: string;
  nodeId?: string;
}

export const FLOW_LIMITS = {
  maxNodes: 200,
  maxEdges: 400,
  maxText: 1000,
  maxOptions: 10,
  maxOptionLabel: 40,
} as const;

const VARIABLE_RE = /^[a-z_][a-z0-9_]{0,30}$/;
/** Variáveis que o motor preenche sozinho — não podem ser o destino de uma pergunta. */
export const FLOW_BUILTIN_VARS = ['nome', 'primeiro_nome', 'empresa'] as const;

function nodeName(node: FlowNode): string {
  return FLOW_NODE_LABEL[node.type] ?? node.type;
}

export function validateFlow(def: FlowDefinition): FlowIssue[] {
  const issues: FlowIssue[] = [];
  const err = (message: string, nodeId?: string) => issues.push({ severity: 'error', message, nodeId });
  const warn = (message: string, nodeId?: string) => issues.push({ severity: 'warning', message, nodeId });

  if (!def || !Array.isArray(def.nodes) || !Array.isArray(def.edges)) {
    err('Estrutura do fluxo inválida.');
    return issues;
  }
  if (def.nodes.length > FLOW_LIMITS.maxNodes) err(`O fluxo passa do limite de ${FLOW_LIMITS.maxNodes} blocos.`);
  if (def.edges.length > FLOW_LIMITS.maxEdges) err(`O fluxo passa do limite de ${FLOW_LIMITS.maxEdges} conexões.`);

  const byId = new Map<string, FlowNode>();
  for (const node of def.nodes) {
    if (byId.has(node.id)) err('Há dois blocos com o mesmo identificador.', node.id);
    byId.set(node.id, node);
  }

  const starts = def.nodes.filter((n) => n.type === 'start');
  if (starts.length !== 1) err('O fluxo precisa de exatamente um bloco de Início.');
  if (!byId.has(def.startNodeId) || byId.get(def.startNodeId)?.type !== 'start') {
    err('O bloco de Início do fluxo não foi encontrado.');
  }

  const askedVars = new Set<string>();
  const text = (value: unknown, label: string, nodeId: string, required: boolean) => {
    const s = typeof value === 'string' ? value.trim() : '';
    if (required && !s) err(`${label}: o texto está vazio.`, nodeId);
    if (s.length > FLOW_LIMITS.maxText) err(`${label}: o texto passa de ${FLOW_LIMITS.maxText} caracteres.`, nodeId);
  };

  for (const node of def.nodes) {
    const name = nodeName(node);
    switch (node.type) {
      case 'message':
        text(node.data.text, name, node.id, true);
        break;
      case 'menu': {
        text(node.data.text, name, node.id, true);
        const opts = node.data.options ?? [];
        if (opts.length < 2) err(`${name}: coloque pelo menos 2 opções.`, node.id);
        if (opts.length > FLOW_LIMITS.maxOptions) err(`${name}: no máximo ${FLOW_LIMITS.maxOptions} opções.`, node.id);
        const labels = new Set<string>();
        for (const o of opts) {
          const label = (o.label ?? '').trim();
          if (!label) err(`${name}: há uma opção sem texto.`, node.id);
          if (label.length > FLOW_LIMITS.maxOptionLabel) err(`${name}: a opção "${label.slice(0, 20)}…" é longa demais.`, node.id);
          if (labels.has(label.toLowerCase())) err(`${name}: a opção "${label}" está repetida.`, node.id);
          labels.add(label.toLowerCase());
          if (['fallback', 'next'].includes(o.id)) err(`${name}: identificador de opção reservado.`, node.id);
        }
        break;
      }
      case 'ask':
        text(node.data.text, name, node.id, true);
        if (!VARIABLE_RE.test(node.data.variable ?? '')) {
          err(`${name}: o nome da variável deve ter só letras minúsculas, números e "_".`, node.id);
        } else if ((FLOW_BUILTIN_VARS as readonly string[]).includes(node.data.variable)) {
          err(`${name}: "${node.data.variable}" é preenchida automaticamente; use outro nome.`, node.id);
        }
        askedVars.add(node.data.variable);
        break;
      case 'ticket':
        text(node.data.description, name, node.id, true);
        break;
      case 'condition':
        if (node.data.mode === 'variable') {
          if (!VARIABLE_RE.test(node.data.variable ?? '')) err(`${name}: escolha a variável a comparar.`, node.id);
          if (['equals', 'not_equals', 'contains'].includes(node.data.op) && !(node.data.value ?? '').trim()) {
            err(`${name}: informe o valor da comparação.`, node.id);
          }
        }
        break;
      case 'ai':
      case 'end':
        text(node.data.text, name, node.id, false);
        break;
      case 'handoff':
        text(node.data.text, name, node.id, false);
        if (!FLOW_DEPARTMENT_LABEL[node.data.department]) err(`${name}: escolha o setor.`, node.id);
        break;
    }
  }

  for (const node of def.nodes) {
    if (node.type === 'identify' && !askedVars.has(node.data.variable)) {
      warn(`${nodeName(node)}: nenhuma pergunta preenche a variável "${node.data.variable}".`, node.id);
    }
  }

  // Conexões
  const outgoing = new Map<string, Map<string, string>>();
  for (const edge of def.edges) {
    const source = byId.get(edge.source);
    if (!source || !byId.has(edge.target)) {
      err('Há uma conexão ligada a um bloco que não existe.');
      continue;
    }
    if (!flowNodeHandles(source).includes(edge.sourceHandle)) {
      err(`${nodeName(source)}: há uma conexão saindo de uma saída que não existe.`, source.id);
      continue;
    }
    if (edge.target === def.startNodeId) err('Nenhuma conexão pode voltar para o Início.', source.id);
    const handles = outgoing.get(edge.source) ?? new Map<string, string>();
    if (handles.has(edge.sourceHandle)) {
      err(`${nodeName(source)}: a saída "${FLOW_HANDLE_LABEL[edge.sourceHandle] ?? edge.sourceHandle}" está ligada a dois blocos.`, source.id);
    }
    handles.set(edge.sourceHandle, edge.target);
    outgoing.set(edge.source, handles);
  }

  for (const node of def.nodes) {
    const handles = outgoing.get(node.id);
    for (const h of flowRequiredHandles(node)) {
      if (!handles?.has(h)) {
        const label =
          node.type === 'menu' ? `a opção "${node.data.options.find((o) => o.id === h)?.label ?? h}"` : `a saída "${FLOW_HANDLE_LABEL[h] ?? h}"`;
        err(`${nodeName(node)}: ligue ${label} a outro bloco.`, node.id);
      }
    }
  }

  // Alcançabilidade a partir do Início
  const reachable = new Set<string>();
  const stack = byId.has(def.startNodeId) ? [def.startNodeId] : [];
  while (stack.length) {
    const id = stack.pop() as string;
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const target of outgoing.get(id)?.values() ?? []) stack.push(target);
  }
  for (const node of def.nodes) {
    if (!reachable.has(node.id)) warn(`${nodeName(node)}: este bloco nunca é alcançado a partir do Início.`, node.id);
  }

  // Laço sem nenhum bloco que espere o cliente = o motor giraria para sempre.
  const color = new Map<string, 0 | 1 | 2>();
  const loopAt = (id: string): string | null => {
    color.set(id, 1);
    const node = byId.get(id);
    if (node && !FLOW_WAITING_TYPES.includes(node.type)) {
      for (const target of outgoing.get(id)?.values() ?? []) {
        const targetNode = byId.get(target);
        if (!targetNode || FLOW_WAITING_TYPES.includes(targetNode.type)) continue;
        const c = color.get(target) ?? 0;
        if (c === 1) return target;
        if (c === 0) {
          const found = loopAt(target);
          if (found) return found;
        }
      }
    }
    color.set(id, 2);
    return null;
  };
  for (const node of def.nodes) {
    if ((color.get(node.id) ?? 0) === 0) {
      const at = loopAt(node.id);
      if (at) {
        err('Há um laço sem nenhum Menu ou Pergunta: o fluxo giraria sem parar.', at);
        break;
      }
    }
  }

  return issues;
}

export function flowHasErrors(issues: FlowIssue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}

/** `{{variavel}}` → valor; variável inexistente vira texto vazio (nunca o nome cru para o cliente). */
export function renderFlowText(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/g, (_m, key: string) => vars[key] ?? '').replace(/[ \t]{2,}/g, ' ').trim();
}

/** Fluxo inicial de um fluxo novo: saudação → menu → caminhos típicos de provedor. */
export function starterFlow(): FlowDefinition {
  const n = (id: string, type: FlowNodeType, x: number, y: number, data: unknown) =>
    ({ id, type, position: { x, y }, data }) as FlowNode;
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    startNodeId: 'inicio',
    settings: { humanRequestInterrupt: true, maxRetries: 2 },
    nodes: [
      n('inicio', 'start', 0, 180, {}),
      n('boas_vindas', 'message', 310, 180, { text: 'Olá! Você está falando com o atendimento da {{empresa}}.' }),
      n('menu', 'menu', 620, 150, {
        text: 'Como posso te ajudar?',
        options: [
          { id: 'op_fatura', label: '2ª via da fatura' },
          { id: 'op_conexao', label: 'Problema na internet' },
          { id: 'op_outro', label: 'Outro assunto' },
        ],
      }),
      n('pede_cpf', 'ask', 950, 0, {
        text: 'Para localizar a sua conta, me informe o CPF ou CNPJ do titular.',
        variable: 'cpf',
        kind: 'cpf',
        invalidText: 'Não consegui ler esse documento. Digite só os números do CPF ou CNPJ.',
      }),
      n('identifica', 'identify', 1260, 0, { variable: 'cpf' }),
      n('fatura', 'lookup', 1570, -60, { query: 'invoice' }),
      n('fim_fatura', 'end', 1880, -60, { text: 'Posso ajudar em mais alguma coisa? É só escrever.' }),
      n('nao_achou', 'handoff', 1570, 130, {
        department: 'FINANCEIRO',
        text: 'Não encontrei o seu cadastro. Vou te passar para um atendente.',
      }),
      n('ia_conexao', 'ai', 950, 250, { text: 'Me conta o que está acontecendo com a sua internet.' }),
      n('ia_outro', 'ai', 950, 400, { text: 'Claro! Me conta o que você precisa.' }),
    ],
    edges: [
      { id: 'e1', source: 'inicio', sourceHandle: 'next', target: 'boas_vindas' },
      { id: 'e2', source: 'boas_vindas', sourceHandle: 'next', target: 'menu' },
      { id: 'e3', source: 'menu', sourceHandle: 'op_fatura', target: 'pede_cpf' },
      { id: 'e4', source: 'menu', sourceHandle: 'op_conexao', target: 'ia_conexao' },
      { id: 'e5', source: 'menu', sourceHandle: 'op_outro', target: 'ia_outro' },
      { id: 'e6', source: 'pede_cpf', sourceHandle: 'next', target: 'identifica' },
      { id: 'e7', source: 'identifica', sourceHandle: 'found', target: 'fatura' },
      { id: 'e8', source: 'identifica', sourceHandle: 'not_found', target: 'nao_achou' },
      { id: 'e9', source: 'fatura', sourceHandle: 'ok', target: 'fim_fatura' },
    ],
  };
}
