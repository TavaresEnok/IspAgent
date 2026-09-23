'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';

interface Message {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

interface ToolCall {
  id: string;
  tool: string;
  status: string;
  source: { adapter: string; mode: string; latencyMs: number; capability: string };
  createdAt: string;
}

interface AgentRun {
  id: string;
  intent: string;
  intentConfidence: string;
  outcome: string | null;
  model: string;
  mode: string;
  policyDecisions: Array<{ action: string; tier: string; allowed: boolean; requiresConfirmation: boolean; reason: string }>;
  claims: Array<{ text: string; type: string; evidence: string[] }>;
  toolCalls: ToolCall[];
  createdAt: string;
}

interface ConversationDetail {
  id: string;
  status: string;
  channel: string;
  channelUserId: string;
  customer: { id: string; name: string; document: string } | null;
  messages: Message[];
  agentRuns: AgentRun[];
  handoffs: Array<{ id: string; status: string; reason: string; createdAt: string }>;
}

const OUTCOME_STYLES: Record<string, string> = {
  ANSWERED: 'bg-emerald-100 text-emerald-800',
  ACTION_EXECUTED: 'bg-blue-100 text-blue-800',
  AWAITING_CONFIRMATION: 'bg-amber-100 text-amber-800',
  BLOCKED: 'bg-red-100 text-red-800',
  HANDOFF: 'bg-orange-100 text-orange-800',
};

export default function ConversationDetailPage() {
  const params = useParams<{ id: string }>();
  const [conv, setConv] = useState<ConversationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const [copilot, setCopilot] = useState<{ suggestion: string; handoffReason: string } | null>(null);

  useEffect(() => {
    if (conv?.status === 'HUMAN_ACTIVE' || conv?.status === 'HANDOFF_PENDING') {
      apiFetch<{ suggestion: string; handoffReason: string }>(`/conversations/${params.id}/copilot-suggestion`)
        .then(setCopilot)
        .catch(() => null);
    }
  }, [conv?.status, params.id]);

  function load() {
    apiFetch<ConversationDetail>(`/conversations/${params.id}`).then(setConv).catch((e) => setError(e.message));
  }

  useEffect(load, [params.id]);

  async function sendReply() {
    if (!reply.trim() || sending) return;
    setSending(true);
    try {
      await apiFetch(`/conversations/${params.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: reply }),
      });
      setReply('');
      load();
    } finally {
      setSending(false);
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!conv) return <p className="text-sm text-slate-500">Carregando...</p>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">
          {conv.customer?.name ?? 'Cliente não identificado'}
        </h1>
        <p className="text-xs text-slate-500">
          {conv.channel} · {conv.channelUserId} · status {conv.status}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-medium text-slate-700">Mensagens</h2>
          <div className="flex flex-col gap-2">
            {conv.messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[85%] rounded px-3 py-2 text-sm ${
                  m.role === 'CUSTOMER'
                    ? 'self-start bg-slate-100 text-slate-800'
                    : m.role === 'AGENT'
                      ? 'self-end bg-slate-900 text-white'
                      : m.role === 'HUMAN'
                        ? 'self-end bg-blue-600 text-white'
                        : 'self-center bg-amber-50 text-amber-800'
                }`}
              >
                <div className="mb-0.5 text-[10px] uppercase opacity-60">{m.role}</div>
                {m.content}
              </div>
            ))}
          </div>

          {/* Sugestão Inteligente do Copiloto IA */}
          {copilot && (
            <div className="mt-3 rounded-xl border border-purple-200 bg-purple-50/80 p-3 text-xs">
              <div className="flex items-center justify-between font-semibold text-purple-900 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <span>✨</span> Sugestão do Copiloto IA
                </span>
                <button
                  type="button"
                  onClick={() => setReply(copilot.suggestion)}
                  className="rounded bg-purple-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-purple-700 active:scale-95 transition shadow-sm"
                >
                  Usar esta resposta ↵
                </button>
              </div>
              <p className="text-purple-800 italic leading-relaxed">"{copilot.suggestion}"</p>
            </div>
          )}

          {conv.status === 'HUMAN_ACTIVE' ? (
            <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendReply()}
                placeholder="Responder como atendente..."
                className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
              />
              <button
                onClick={sendReply}
                disabled={sending}
                className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition"
              >
                Enviar
              </button>
            </div>
          ) : (
            <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-400">
              Só é possível responder manualmente depois de assumir esta conversa na Fila humana (status
              atual: {conv.status}).
            </p>
          )}
        </section>

        <section className="rounded border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-medium text-slate-700">
            Timeline — tool calls e decisões de policy
          </h2>
          <div className="flex flex-col gap-4">
            {conv.agentRuns.map((run) => (
              <div key={run.id} className="rounded border border-slate-100 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-700">
                    {run.intent} <span className="text-slate-400">({run.intentConfidence})</span>
                  </span>
                  {run.outcome && (
                    <span className={`rounded px-2 py-0.5 text-xs ${OUTCOME_STYLES[run.outcome] ?? 'bg-slate-100'}`}>
                      {run.outcome}
                    </span>
                  )}
                </div>

                {run.policyDecisions.map((d, i) => (
                  <div key={i} className="mb-1 text-xs text-slate-500">
                    <span className={d.allowed ? 'text-emerald-700' : 'text-red-700'}>
                      policy: {d.action} → {d.allowed ? 'permitido' : 'bloqueado'}
                      {d.requiresConfirmation ? ' (exige confirmação)' : ''}
                    </span>
                    <span className="ml-1 text-slate-400">— {d.reason}</span>
                  </div>
                ))}

                {run.toolCalls.map((tc) => (
                  <div key={tc.id} className="mt-1 flex items-center gap-2 text-xs">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">{tc.tool}</span>
                    <span className="text-slate-500">{tc.status}</span>
                    <span className="text-slate-400">
                      {tc.source.adapter} · {tc.source.mode} · {tc.source.latencyMs}ms
                    </span>
                  </div>
                ))}

                {run.claims.length > 0 && (
                  <div className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
                    {run.claims.map((c, i) => (
                      <div key={i}>
                        <span className="text-slate-400">[{c.type}]</span> {c.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {conv.agentRuns.length === 0 && <p className="text-sm text-slate-400">Nenhum turno de agente ainda.</p>}
          </div>
        </section>
      </div>

      {conv.handoffs.length > 0 && (
        <section className="rounded border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-medium text-slate-700">Handoffs</h2>
          {conv.handoffs.map((h) => (
            <div key={h.id} className="text-sm text-slate-600">
              <span className="rounded bg-orange-100 px-2 py-0.5 text-xs text-orange-800">{h.status}</span>{' '}
              {h.reason} — {new Date(h.createdAt).toLocaleString('pt-BR')}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
