import type { Edge, Node } from '@xyflow/react';
import {
  FLOW_SCHEMA_VERSION,
  type FlowDefinition,
  type FlowNode,
  type FlowNodeType,
  type FlowSettings,
} from '@ispagent/shared';

/** Dados que cada bloco carrega no canvas. */
export type BlockData = {
  flow: FlowNode;
  /** Erros de validação neste bloco (borda vermelha). */
  errors: string[];
  warnings: string[];
  /** O simulador passou por aqui no último turno. */
  visited: boolean;
  /** Bloco em que o simulador está esperando o cliente. */
  waiting: boolean;
  readOnly: boolean;
};
export type BlockNode = Node<BlockData, 'block'>;

export const BLOCK_STYLE: Record<FlowNodeType, { icon: string; accent: string; ring: string; chip: string }> = {
  start: { icon: '🚀', accent: 'from-emerald-500/30', ring: 'border-emerald-500/60', chip: 'bg-emerald-500/15 text-emerald-300' },
  message: { icon: '💬', accent: 'from-sky-500/30', ring: 'border-sky-500/50', chip: 'bg-sky-500/15 text-sky-300' },
  menu: { icon: '📋', accent: 'from-violet-500/30', ring: 'border-violet-500/50', chip: 'bg-violet-500/15 text-violet-300' },
  ask: { icon: '❓', accent: 'from-amber-500/30', ring: 'border-amber-500/50', chip: 'bg-amber-500/15 text-amber-300' },
  identify: { icon: '🪪', accent: 'from-cyan-500/30', ring: 'border-cyan-500/50', chip: 'bg-cyan-500/15 text-cyan-300' },
  lookup: { icon: '🔎', accent: 'from-blue-500/30', ring: 'border-blue-500/50', chip: 'bg-blue-500/15 text-blue-300' },
  ticket: { icon: '🛠️', accent: 'from-orange-500/30', ring: 'border-orange-500/50', chip: 'bg-orange-500/15 text-orange-300' },
  condition: { icon: '🔀', accent: 'from-pink-500/30', ring: 'border-pink-500/50', chip: 'bg-pink-500/15 text-pink-300' },
  ai: { icon: '🤖', accent: 'from-fuchsia-500/30', ring: 'border-fuchsia-500/50', chip: 'bg-fuchsia-500/15 text-fuchsia-300' },
  handoff: { icon: '👤', accent: 'from-rose-500/30', ring: 'border-rose-500/50', chip: 'bg-rose-500/15 text-rose-300' },
  end: { icon: '🏁', accent: 'from-slate-500/30', ring: 'border-slate-500/50', chip: 'bg-slate-500/15 text-slate-300' },
};

/** O que aparece na paleta, em ordem, com uma linha explicando cada bloco. */
export const PALETTE: Array<{ type: FlowNodeType; hint: string; group: string }> = [
  { type: 'message', hint: 'Envia um texto', group: 'Conversa' },
  { type: 'menu', hint: 'Opções numeradas; uma saída por opção', group: 'Conversa' },
  { type: 'ask', hint: 'Pergunta e guarda a resposta numa variável', group: 'Conversa' },
  { type: 'condition', hint: 'Divide o caminho (sim / não)', group: 'Conversa' },
  { type: 'identify', hint: 'Localiza o cliente pelo CPF/CNPJ', group: 'Provedor' },
  { type: 'lookup', hint: 'Fatura, plano ou conexão no SGP', group: 'Provedor' },
  { type: 'ticket', hint: 'Abre chamado técnico', group: 'Provedor' },
  { type: 'ai', hint: 'A IA do ISPAgent segue a conversa', group: 'Encerrar' },
  { type: 'handoff', hint: 'Fila humana no setor escolhido', group: 'Encerrar' },
  { type: 'end', hint: 'Termina o fluxo', group: 'Encerrar' },
];

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Configuração inicial de um bloco novo arrastado da paleta. */
export function defaultBlock(type: FlowNodeType, position: { x: number; y: number }): FlowNode {
  const id = newId(type);
  const data: Record<FlowNodeType, unknown> = {
    start: {},
    message: { text: 'Escreva a mensagem aqui.' },
    menu: {
      text: 'Escolha uma opção:',
      options: [
        { id: newId('op'), label: 'Opção 1' },
        { id: newId('op'), label: 'Opção 2' },
      ],
    },
    ask: { text: 'Qual é o seu CPF ou CNPJ?', variable: 'cpf', kind: 'cpf' },
    identify: { variable: 'cpf' },
    lookup: { query: 'invoice' },
    ticket: { description: 'Cliente relatou problema pelo fluxo.' },
    condition: { mode: 'builtin', builtin: 'business_hours' },
    ai: { text: 'Me conta o que você precisa.' },
    handoff: { department: 'SUPORTE_TECNICO', text: 'Vou te passar para um atendente.' },
    end: { text: 'Obrigado pelo contato!' },
  };
  return { id, type, position, data: data[type] } as FlowNode;
}

export function toCanvas(def: FlowDefinition, readOnly: boolean): { nodes: BlockNode[]; edges: Edge[] } {
  return {
    nodes: def.nodes.map((n) => ({
      id: n.id,
      type: 'block',
      position: n.position,
      deletable: !readOnly && n.type !== 'start',
      draggable: !readOnly,
      data: { flow: n, errors: [], warnings: [], visited: false, waiting: false, readOnly },
    })),
    edges: def.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle })),
  };
}

export function fromCanvas(nodes: BlockNode[], edges: Edge[], startNodeId: string, settings: FlowSettings): FlowDefinition {
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    startNodeId,
    settings,
    nodes: nodes.map((n) => ({ ...n.data.flow, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) } }) as FlowNode),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? 'next' })),
  };
}

/** Frase curta que o bloco mostra no canvas. */
export function blockPreview(n: FlowNode): string {
  switch (n.type) {
    case 'start':
      return 'Primeira mensagem do cliente';
    case 'message':
    case 'menu':
    case 'ask':
      return n.data.text;
    case 'identify':
      return `Documento em {{${n.data.variable}}}`;
    case 'lookup':
      return { invoice: '2ª via da fatura + PIX', plan: 'Plano contratado', connection: 'Diagnóstico da conexão' }[n.data.query];
    case 'ticket':
      return n.data.description;
    case 'condition':
      return n.data.mode === 'builtin'
        ? n.data.builtin === 'business_hours'
          ? 'Dentro do horário de atendimento?'
          : 'Cliente já identificado?'
        : `{{${n.data.variable}}} ${{ equals: '=', not_equals: '≠', contains: 'contém', is_set: 'preenchida', is_empty: 'vazia' }[n.data.op]} ${n.data.value ?? ''}`;
    case 'ai':
    case 'end':
      return n.data.text || '—';
    case 'handoff':
      return n.data.text || 'Transfere para um atendente';
  }
}
