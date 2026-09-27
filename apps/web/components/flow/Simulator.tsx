'use client';

import { useEffect, useRef, useState } from 'react';
import type { FlowDefinition, FlowIssue, FlowRunState } from '@ispagent/shared';
import { apiFetch, ApiError } from '@/lib/api';

interface SimResult {
  issues: FlowIssue[];
  replies: string[];
  outcome: 'waiting' | 'ai' | 'handoff' | 'end' | 'invalid';
  state: FlowRunState | null;
  trace: Array<{ nodeId: string; type: string; via?: string }>;
  handoff?: { departmentLabel: string };
}

type Bubble = { from: 'cliente' | 'fluxo' | 'sistema'; text: string };

const OUTCOME_TEXT: Record<string, string> = {
  ai: '🤖 A IA do ISPAgent assumiria a conversa a partir daqui.',
  end: '🏁 Fluxo encerrado. As próximas mensagens iriam para a IA.',
};

/**
 * Simulador do editor: conversa com o rascunho ATUAL (mesmo sem salvar), com dados fictícios. Mostra no
 * canvas o caminho percorrido (`onTrace`) e em qual bloco o fluxo está esperando.
 */
export function Simulator({
  definition,
  onTrace,
  onClose,
}: {
  definition: FlowDefinition;
  onTrace: (visited: string[], waitingNodeId: string | null) => void;
  onClose: () => void;
}) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [state, setState] = useState<FlowRunState | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Corpo com chaves de propósito: no Chrome atual `scrollIntoView` devolve uma Promise, e um efeito que
  // devolve algo que não é função derruba o React na limpeza ("is not a function").
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [bubbles]);

  function reset() {
    setBubbles([]);
    setState(null);
    setFinished(false);
    onTrace([], null);
  }

  async function send(message: string) {
    if (!message.trim() || busy) return;
    setBusy(true);
    setText('');
    setBubbles((b) => [...b, { from: 'cliente', text: message }]);
    try {
      const r = await apiFetch<SimResult>('/flows/simulate', {
        method: 'POST',
        body: JSON.stringify({ definition, state: finished ? undefined : (state ?? undefined), message }),
      });
      if (r.outcome === 'invalid') {
        const errors = r.issues.filter((i) => i.severity === 'error');
        setBubbles((b) => [...b, { from: 'sistema', text: `⚠️ Corrija ${errors.length} erro(s) do fluxo antes de testar.` }]);
        return;
      }
      const extra: Bubble[] = r.replies.map((t) => ({ from: 'fluxo', text: t }));
      if (r.outcome === 'handoff') extra.push({ from: 'sistema', text: `👤 Transferido para a fila humana — ${r.handoff?.departmentLabel ?? 'Suporte'}.` });
      else if (OUTCOME_TEXT[r.outcome]) extra.push({ from: 'sistema', text: OUTCOME_TEXT[r.outcome] });
      setBubbles((b) => [...b, ...extra]);
      setState(r.state);
      setFinished(r.outcome !== 'waiting');
      onTrace(
        r.trace.map((t) => t.nodeId),
        r.outcome === 'waiting' ? (r.state?.waitingNodeId ?? null) : null,
      );
    } catch (err) {
      setBubbles((b) => [...b, { from: 'sistema', text: err instanceof ApiError ? err.message : 'Falha na simulação.' }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-100">Testar fluxo</p>
          <p className="text-[10px] text-slate-500">Dados fictícios · nada é gravado</p>
        </div>
        <div className="flex gap-1">
          <button onClick={reset} className="rounded-lg px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800">
            Reiniciar
          </button>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-800" aria-label="Fechar">
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {bubbles.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-700 p-3 text-[11px] leading-relaxed text-slate-400">
            Escreva como se fosse o cliente (ex.: “oi”). O caminho percorrido acende no canvas.
            <br />
            <br />
            No simulador, qualquer CPF válido é encontrado como <b>Cliente de Teste</b>; use <code>000.000.000-00</code> para testar o
            caminho “não encontrado”.
          </div>
        )}
        {bubbles.map((b, i) => (
          <div key={i} className={`flex ${b.from === 'cliente' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                b.from === 'cliente'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white'
                  : b.from === 'fluxo'
                    ? 'border border-slate-700 bg-slate-800 text-slate-100'
                    : 'border border-amber-500/30 bg-amber-500/10 text-amber-200'
              }`}
            >
              {b.text}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
        className="flex gap-2 border-t border-slate-800 p-3"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={finished ? 'Escreva para recomeçar…' : 'Mensagem do cliente…'}
          maxLength={2000}
          className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
        />
        <button disabled={busy || !text.trim()} className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">
          {busy ? '…' : 'Enviar'}
        </button>
      </form>
    </div>
  );
}
