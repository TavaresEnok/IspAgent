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
    apiFetch<HandoffRow[]>('/handoff/queue?status=PENDING').then(setItems);
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
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-slate-900">Fila humana</h1>
      <p className="text-sm text-slate-500">
        Conversas que a IA não conseguiu resolver sozinha (identidade ambígua/não encontrada, ou não
        conseguiu atender com confiança) — seção 5.4.
      </p>

      <div className="flex flex-col gap-3">
        {items?.map((h) => (
          <div key={h.id} className="rounded border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-800">{h.summary.intent}</span>
              <span className="text-xs text-slate-400">{new Date(h.createdAt).toLocaleString('pt-BR')}</span>
            </div>
            <p className="mb-1 text-sm text-slate-600">
              <span className="font-medium">Problema relatado:</span> {h.summary.reportedProblem}
            </p>
            <p className="mb-1 text-sm text-slate-600">
              <span className="font-medium">Motivo do handoff:</span> {h.reason}
            </p>
            {h.summary.toolsConsulted.length > 0 && (
              <p className="mb-1 text-xs text-slate-500">
                Ferramentas consultadas: {h.summary.toolsConsulted.map((t) => `${t.tool} (${t.result})`).join(', ')}
              </p>
            )}
            <p className="mb-3 text-sm text-slate-600">
              <span className="font-medium">Próxima ação sugerida:</span> {h.summary.suggestedNextAction}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => assume(h.id)}
                disabled={busyId === h.id}
                className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                Assumir conversa
              </button>
              <a
                href={`/conversations/${h.conversationId}`}
                className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Ver conversa
              </a>
            </div>
          </div>
        ))}
        {items?.length === 0 && (
          <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
            Fila vazia — nenhuma conversa esperando humano agora.
          </p>
        )}
      </div>
    </div>
  );
}
