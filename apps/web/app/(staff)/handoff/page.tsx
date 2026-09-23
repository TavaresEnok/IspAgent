'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface HandoffRow {
  id: string;
  conversationId: string;
  reason: string;
  status: string;
  summary: {
    intent: string;
    reportedProblem: string;
    suggestedNextAction: string;
    toolsConsulted: Array<{ tool: string; result: string }>;
  };
  createdAt: string;
}

export default function HandoffQueuePage() {
  const [items, setItems] = useState<HandoffRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    apiFetch<HandoffRow[]>('/handoff/queue?status=PENDING')
      .then(setItems)
      .catch(() => setItems([]));
  }

  useEffect(load, []);

  async function assume(id: string) {
    setBusyId(id);
    try {
      await apiFetch(`/handoff/${id}/assume`, { method: 'POST' });
      load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">Fila de Atendimento Humano (Handoff)</h1>
        <p className="mt-0.5 text-xs text-slate-400">
          Casos que exigem validação de atendente (solicitações complexas, negociações ou pedidos de humano).
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {items?.map((h) => (
          <div key={h.id} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 backdrop-blur-md">
            <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-orange-500/10 border border-orange-500/30 px-2.5 py-0.5 text-xs font-semibold text-orange-400">
                  {h.summary.intent}
                </span>
                <span className="text-xs text-slate-400">Motivo: {h.reason}</span>
              </div>
              <span className="text-xs text-slate-500">{new Date(h.createdAt).toLocaleString('pt-BR')}</span>
            </div>

            <div className="space-y-1.5 text-xs">
              <p className="text-slate-300">
                <strong className="text-slate-400">Problema relatado:</strong> {h.summary.reportedProblem}
              </p>
              {h.summary.toolsConsulted.length > 0 && (
                <p className="text-slate-400 font-mono text-[11px]">
                  Tools consultadas: {h.summary.toolsConsulted.map((t) => `${t.tool} (${t.result})`).join(', ')}
                </p>
              )}
              <p className="text-cyan-300">
                <strong className="text-slate-400">Próxima ação sugerida:</strong> {h.summary.suggestedNextAction}
              </p>
            </div>

            <div className="mt-4 flex items-center gap-2 pt-3 border-t border-slate-800/80">
              <button
                onClick={() => assume(h.id)}
                disabled={busyId === h.id}
                className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50 transition"
              >
                {busyId === h.id ? 'Assumindo...' : 'Assumir Conversa'}
              </button>
              <a
                href={`/conversations/${h.conversationId}`}
                className="rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-700 transition"
              >
                Ver Histórico Completo
              </a>
            </div>
          </div>
        ))}

        {items?.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center">
            <span className="text-3xl mb-2">🎉</span>
            <h3 className="text-sm font-bold text-white">Fila vazia</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              Não há clientes aguardando atendimento humano no momento. A IA da Vibe Telecom está resolvendo as solicitações.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
