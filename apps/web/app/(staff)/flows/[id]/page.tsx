'use client';

import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useUpdateNodeInternals,
  type Connection,
  type Edge,
  type IsValidConnection,
} from '@xyflow/react';
import {
  FLOW_NODE_LABEL,
  ROLE_HIERARCHY,
  flowNodeHandles,
  validateFlow,
  type FlowDefinition,
  type FlowIssue,
  type FlowNode,
  type FlowNodeType,
  type FlowSettings,
  type Role,
} from '@ispagent/shared';
import { apiFetch, ApiError } from '@/lib/api';
import BlockNodeView from '@/components/flow/BlockNodeView';
import { Inspector } from '@/components/flow/Inspector';
import { Simulator } from '@/components/flow/Simulator';
import { BLOCK_STYLE, PALETTE, defaultBlock, fromCanvas, newId, toCanvas, type BlockNode } from '@/components/flow/model';

interface FlowRecord {
  id: string;
  name: string;
  description: string | null;
  definition: FlowDefinition;
  publishedVersion: number;
  publishedAt: string | null;
  active: boolean;
  draftChanged: boolean;
  issues: FlowIssue[];
}

const nodeTypes = { block: BlockNodeView };
const DRAG_TYPE = 'application/ispagent-block';

export default function FlowEditorPage() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  );
}

function Editor() {
  const { id } = useParams<{ id: string }>();
  const { screenToFlowPosition, setCenter, getNode } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const wrapper = useRef<HTMLDivElement>(null);

  const [record, setRecord] = useState<FlowRecord | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<BlockNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [settings, setSettings] = useState<FlowSettings>({ humanRequestInterrupt: true, maxRetries: 2 });
  const [startNodeId, setStartNodeId] = useState('');
  const [name, setName] = useState('');
  const [saved, setSaved] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [simOpen, setSimOpen] = useState(false);
  const [visited, setVisited] = useState<string[]>([]);
  const [waitingId, setWaitingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const readOnly = role ? (ROLE_HIERARCHY[role] ?? 0) < ROLE_HIERARCHY.TENANT_ADMIN : true;

  const load = useCallback(
    (r: FlowRecord, ro: boolean) => {
      const canvas = toCanvas(r.definition, ro);
      setRecord(r);
      setNodes(canvas.nodes);
      setEdges(canvas.edges);
      setSettings(r.definition.settings);
      setStartNodeId(r.definition.startNodeId);
      setName(r.name);
      setSaved(JSON.stringify({ name: r.name, def: fromCanvas(canvas.nodes, canvas.edges, r.definition.startNodeId, r.definition.settings) }));
    },
    [setNodes, setEdges],
  );

  useEffect(() => {
    Promise.all([apiFetch<{ role: Role }>('/auth/me'), apiFetch<FlowRecord>(`/flows/${id}`)])
      .then(([me, r]) => {
        const ro = (ROLE_HIERARCHY[me.role] ?? 0) < ROLE_HIERARCHY.TENANT_ADMIN;
        setRole(me.role);
        load(r, ro);
      })
      .catch((e) => setNotice({ kind: 'error', text: e instanceof ApiError ? e.message : 'Falha ao carregar o fluxo.' }));
  }, [id, load]);

  const definition = useMemo(() => fromCanvas(nodes, edges, startNodeId, settings), [nodes, edges, startNodeId, settings]);
  const issues = useMemo(() => (record ? validateFlow(definition) : []), [definition, record]);
  const errors = issues.filter((i) => i.severity === 'error');
  const dirty = record ? JSON.stringify({ name, def: definition }) !== saved : false;

  // Os blocos mostram os próprios erros e o caminho do simulador.
  const viewNodes = useMemo(() => {
    const byNode = new Map<string, { errors: string[]; warnings: string[] }>();
    for (const i of issues) {
      if (!i.nodeId) continue;
      const entry = byNode.get(i.nodeId) ?? { errors: [], warnings: [] };
      (i.severity === 'error' ? entry.errors : entry.warnings).push(i.message);
      byNode.set(i.nodeId, entry);
    }
    const seen = new Set(visited);
    return nodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        readOnly,
        errors: byNode.get(n.id)?.errors ?? [],
        warnings: byNode.get(n.id)?.warnings ?? [],
        visited: seen.has(n.id),
        waiting: waitingId === n.id,
      },
    }));
  }, [nodes, issues, visited, waitingId, readOnly]);

  const viewEdges = useMemo(() => {
    const seen = new Set(visited);
    return edges.map((e) => {
      const hot = seen.has(e.source) && (seen.has(e.target) || e.target === waitingId);
      return {
        ...e,
        animated: hot,
        style: { stroke: hot ? '#34d399' : '#64748b', strokeWidth: hot ? 2.5 : 1.5 },
      };
    });
  }, [edges, visited, waitingId]);

  // Abre focado no começo do fluxo, num zoom legível (o minimapa mostra o resto).
  const initialFocus = useMemo(() => {
    if (!record) return [];
    const def = record.definition;
    const ids = [def.startNodeId];
    for (let i = 0; i < ids.length && ids.length < 4; i++) {
      for (const e of def.edges) if (e.source === ids[i] && !ids.includes(e.target) && ids.length < 4) ids.push(e.target);
    }
    return ids.map((nodeId) => ({ id: nodeId }));
  }, [record]);

  const selected = nodes.find((n) => n.id === selectedId)?.data.flow ?? null;
  const vars = useMemo(() => {
    const asked = definition.nodes.flatMap((n) => (n.type === 'ask' && n.data.variable ? [n.data.variable] : []));
    return [...new Set(['primeiro_nome', 'nome', 'empresa', ...asked])];
  }, [definition]);

  // ---- edição ----------------------------------------------------------------------------------------

  const updateBlock = useCallback(
    (next: FlowNode) => {
      setNodes((ns) => ns.map((n) => (n.id === next.id ? { ...n, data: { ...n.data, flow: next } } : n)));
      // Saídas que deixaram de existir (opção removida) levam a conexão junto.
      const handles = new Set(flowNodeHandles(next));
      setEdges((es) => es.filter((e) => e.source !== next.id || handles.has(e.sourceHandle ?? '')));
      requestAnimationFrame(() => updateNodeInternals(next.id));
    },
    [setNodes, setEdges, updateNodeInternals],
  );

  const addBlock = useCallback(
    (type: FlowNodeType, position?: { x: number; y: number }) => {
      if (readOnly) return;
      let pos = position;
      if (!pos) {
        const rect = wrapper.current?.getBoundingClientRect();
        pos = screenToFlowPosition({ x: (rect?.left ?? 0) + (rect?.width ?? 800) / 2, y: (rect?.top ?? 0) + (rect?.height ?? 600) / 2 });
      }
      const block = defaultBlock(type, { x: pos.x - 128, y: pos.y - 40 });
      setNodes((ns) => [...ns, ...toCanvas({ ...definition, nodes: [block], edges: [] }, false).nodes]);
      setSelectedId(block.id);
    },
    [readOnly, screenToFlowPosition, setNodes, definition],
  );

  const removeBlock = useCallback(
    (nodeId: string) => {
      if (nodeId === startNodeId) return;
      setNodes((ns) => ns.filter((n) => n.id !== nodeId));
      setEdges((es) => es.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setSelectedId(null);
    },
    [startNodeId, setNodes, setEdges],
  );

  const duplicateBlock = useCallback(
    (node: FlowNode) => {
      const copy = JSON.parse(JSON.stringify(node)) as FlowNode;
      copy.id = newId(node.type);
      copy.position = { x: node.position.x + 40, y: node.position.y + 60 };
      if (copy.type === 'menu') copy.data.options = copy.data.options.map((o) => ({ ...o, id: newId('op') }));
      setNodes((ns) => [...ns, ...toCanvas({ ...definition, nodes: [copy], edges: [] }, false).nodes]);
      setSelectedId(copy.id);
    },
    [setNodes, definition],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (readOnly || !c.source || !c.target || !c.sourceHandle) return;
      // Cada saída leva a um único bloco: ligar de novo substitui a conexão anterior.
      setEdges((es) => [
        ...es.filter((e) => !(e.source === c.source && e.sourceHandle === c.sourceHandle)),
        { id: newId('e'), source: c.source, target: c.target, sourceHandle: c.sourceHandle },
      ]);
    },
    [readOnly, setEdges],
  );

  const isValidConnection: IsValidConnection = useCallback(
    (c) => c.source !== c.target && c.target !== startNodeId,
    [startNodeId],
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData(DRAG_TYPE) as FlowNodeType;
      if (type) addBlock(type, screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    },
    [addBlock, screenToFlowPosition],
  );

  const focusNode = useCallback(
    (nodeId: string) => {
      const n = getNode(nodeId);
      if (!n) return;
      setSelectedId(nodeId);
      void setCenter(n.position.x + 128, n.position.y + 60, { zoom: 1.1, duration: 400 });
    },
    [getNode, setCenter],
  );

  // ---- salvar / publicar / ativar ---------------------------------------------------------------------

  const save = useCallback(async (): Promise<FlowRecord | null> => {
    if (readOnly || !record) return null;
    setBusy('save');
    setNotice(null);
    try {
      const r = await apiFetch<FlowRecord>(`/flows/${record.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: name.trim() || record.name, definition }),
      });
      setRecord(r);
      setSaved(JSON.stringify({ name: r.name, def: definition }));
      setNotice({ kind: 'ok', text: 'Rascunho salvo.' });
      return r;
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof ApiError ? e.message : 'Falha ao salvar.' });
      return null;
    } finally {
      setBusy(null);
    }
  }, [readOnly, record, name, definition]);

  async function publish() {
    if (!record) return;
    if (dirty && !(await save())) return;
    setBusy('publish');
    try {
      const r = await apiFetch<FlowRecord>(`/flows/${record.id}/publish`, { method: 'POST' });
      setRecord(r);
      setNotice({
        kind: 'ok',
        text: r.active
          ? `Versão ${r.publishedVersion} publicada — já está atendendo os clientes.`
          : `Versão ${r.publishedVersion} publicada. Ative o fluxo para ele atender os clientes.`,
      });
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof ApiError ? e.message : 'Falha ao publicar.' });
    } finally {
      setBusy(null);
    }
  }

  async function toggleActive() {
    if (!record) return;
    const next = !record.active;
    if (
      next &&
      !confirm('Ativar este fluxo? A partir de agora ele conduz as NOVAS conversas de todos os canais (o fluxo ativo anterior é desativado).')
    ) {
      return;
    }
    setBusy('active');
    try {
      const r = await apiFetch<FlowRecord>(`/flows/${record.id}/active`, { method: 'POST', body: JSON.stringify({ active: next }) });
      setRecord(r);
      setNotice({ kind: 'ok', text: next ? 'Fluxo ativado.' : 'Fluxo desativado — a IA volta a atender sozinha.' });
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof ApiError ? e.message : 'Falha ao ativar.' });
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onLeave);
    };
  }, [save, dirty]);

  if (!record) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-slate-400">
        {notice?.text ?? 'Carregando fluxo…'}
      </div>
    );
  }

  const groups = [...new Set(PALETTE.map((p) => p.group))];

  return (
    <div className="flex h-screen flex-col">
      {/* Barra superior */}
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-900/80 px-4 py-2.5">
        <Link href="/flows" className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-100">
          ← Fluxos
        </Link>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={readOnly}
          maxLength={80}
          className="min-w-[180px] rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-slate-100 hover:border-slate-700 focus:border-cyan-500 focus:outline-none"
        />
        {record.active && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">● Ativo</span>}
        {record.publishedVersion > 0 ? (
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">Publicado v{record.publishedVersion}</span>
        ) : (
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">Nunca publicado</span>
        )}
        {(dirty || (record.draftChanged && record.publishedVersion > 0)) && !readOnly && (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-300">
            {dirty ? 'Alterações não salvas' : 'Rascunho diferente do publicado'}
          </span>
        )}
        {readOnly && <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">Somente leitura</span>}

        <div className="flex-1" />

        <button
          onClick={() => setSelectedId(null)}
          className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${
            errors.length ? 'bg-red-500/15 text-red-300' : 'bg-emerald-500/10 text-emerald-300'
          }`}
        >
          {errors.length ? `${errors.length} erro(s)` : '✓ Sem erros'}
        </button>
        <button
          onClick={() => setSimOpen((v) => !v)}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-800"
        >
          ▶ Testar
        </button>
        {!readOnly && (
          <>
            <button
              onClick={() => void save()}
              disabled={busy !== null || !dirty}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-800 disabled:opacity-40"
              title="Ctrl+S"
            >
              {busy === 'save' ? 'Salvando…' : 'Salvar'}
            </button>
            <button
              onClick={() => void publish()}
              disabled={busy !== null || errors.length > 0}
              title={errors.length ? 'Corrija os erros para publicar' : 'O atendimento passa a usar esta versão'}
              className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              {busy === 'publish' ? 'Publicando…' : 'Publicar'}
            </button>
            <button
              onClick={() => void toggleActive()}
              disabled={busy !== null || (!record.active && record.publishedVersion === 0)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${
                record.active ? 'border border-red-500/40 text-red-300 hover:bg-red-500/10' : 'bg-emerald-600 text-white'
              }`}
            >
              {record.active ? 'Desativar' : 'Ativar'}
            </button>
          </>
        )}
      </header>

      {notice && (
        <div
          className={`flex items-center justify-between px-4 py-1.5 text-xs ${
            notice.kind === 'ok' ? 'bg-emerald-500/10 text-emerald-200' : 'bg-red-500/10 text-red-200'
          }`}
        >
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="px-2 text-slate-400 hover:text-slate-100">
            ✕
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Paleta */}
        {!readOnly && (
          <aside className="w-56 shrink-0 overflow-y-auto border-r border-slate-800 bg-slate-900/60 p-3">
            {groups.map((g) => (
              <div key={g} className="mb-4">
                <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{g}</p>
                <div className="flex flex-col gap-1.5">
                  {PALETTE.filter((p) => p.group === g).map((p) => (
                    <button
                      key={p.type}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(DRAG_TYPE, p.type);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={() => addBlock(p.type)}
                      className="flex cursor-grab items-start gap-2 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-2 text-left hover:border-cyan-500/40 active:cursor-grabbing"
                    >
                      <span className={`rounded-md px-1 text-sm ${BLOCK_STYLE[p.type].chip}`}>{BLOCK_STYLE[p.type].icon}</span>
                      <span>
                        <span className="block text-[11px] font-semibold text-slate-100">{FLOW_NODE_LABEL[p.type]}</span>
                        <span className="block text-[10px] leading-snug text-slate-500">{p.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <p className="px-1 text-[10px] leading-relaxed text-slate-600">
              Arraste para o canvas ou clique. Ligue as saídas (●) à entrada de outro bloco. Delete apaga o que estiver selecionado.
            </p>
          </aside>
        )}

        {/* Canvas */}
        <div ref={wrapper} className="relative min-w-0 flex-1" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          <ReactFlow
            nodes={viewNodes}
            edges={viewEdges}
            nodeTypes={nodeTypes}
            onNodesChange={readOnly ? undefined : onNodesChange}
            onEdgesChange={readOnly ? undefined : onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onPaneClick={() => setSelectedId(null)}
            onNodesDelete={(ns) => ns.some((n) => n.id === selectedId) && setSelectedId(null)}
            nodesConnectable={!readOnly}
            deleteKeyCode={readOnly ? null : ['Delete', 'Backspace']}
            colorMode="dark"
            fitView
            fitViewOptions={{ nodes: initialFocus, padding: 0.25, maxZoom: 1 }}
            minZoom={0.2}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#334155" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeColor="#0891b2" maskColor="rgba(2,6,23,0.7)" className="!bg-slate-900" />
          </ReactFlow>
        </div>

        {/* Painel direito: simulador, propriedades do bloco ou visão geral */}
        <aside className={`${simOpen ? 'w-96' : 'w-80'} shrink-0 overflow-y-auto border-l border-slate-800 bg-slate-900/60`}>
          {simOpen ? (
            <Simulator
              definition={definition}
              onTrace={(v, w) => {
                setVisited(v);
                setWaitingId(w);
              }}
              onClose={() => {
                setSimOpen(false);
                setVisited([]);
                setWaitingId(null);
              }}
            />
          ) : selected ? (
            <div className="p-4">
              <Inspector
                node={selected}
                vars={vars}
                readOnly={readOnly}
                onChange={updateBlock}
                onDelete={() => removeBlock(selected.id)}
                onDuplicate={() => duplicateBlock(selected)}
                onRemoveOption={(optionId) =>
                  selected.type === 'menu' &&
                  updateBlock({ ...selected, data: { ...selected.data, options: selected.data.options.filter((o) => o.id !== optionId) } })
                }
              />
              {issues.filter((i) => i.nodeId === selected.id).length > 0 && (
                <ul className="mt-4 space-y-1.5">
                  {issues
                    .filter((i) => i.nodeId === selected.id)
                    .map((i, k) => (
                      <li
                        key={k}
                        className={`rounded-lg px-2.5 py-1.5 text-[11px] ${
                          i.severity === 'error' ? 'bg-red-500/10 text-red-300' : 'bg-amber-500/10 text-amber-300'
                        }`}
                      >
                        {i.message}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-5 p-4">
              <section>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Configurações do fluxo</p>
                <label className="flex items-start gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={settings.humanRequestInterrupt}
                    disabled={readOnly}
                    onChange={(e) => setSettings({ ...settings, humanRequestInterrupt: e.target.checked })}
                    className="mt-0.5"
                  />
                  <span>“Quero falar com um atendente” em qualquer ponto transfere na hora.</span>
                </label>
                <label className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-300">
                  <span>Tentativas antes de desistir de uma resposta inválida</span>
                  <input
                    type="number"
                    min={0}
                    max={5}
                    value={settings.maxRetries}
                    disabled={readOnly}
                    onChange={(e) => setSettings({ ...settings, maxRetries: Math.min(5, Math.max(0, Number(e.target.value) || 0)) })}
                    className="w-14 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
                  />
                </label>
              </section>

              <section>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Verificação ({issues.length})</p>
                {issues.length === 0 ? (
                  <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">Tudo certo — o fluxo pode ser publicado.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {issues.map((i, k) => (
                      <li key={k}>
                        <button
                          onClick={() => i.nodeId && focusNode(i.nodeId)}
                          className={`w-full rounded-lg px-2.5 py-1.5 text-left text-[11px] ${
                            i.severity === 'error' ? 'bg-red-500/10 text-red-300 hover:bg-red-500/20' : 'bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                          }`}
                        >
                          {i.message}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-lg border border-slate-800 p-3 text-[11px] leading-relaxed text-slate-400">
                <p className="mb-1 font-semibold text-slate-300">Como funciona</p>
                Salvar guarda um rascunho. <b>Publicar</b> cria uma versão; o fluxo <b>ativo</b> usa sempre a última versão publicada e conduz
                as conversas novas até passar para a IA, transferir ou terminar.
              </section>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
