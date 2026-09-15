'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface Metrics {
  conversationsToday: number;
  answeredByAiToday: number;
  handedOffToday: number;
  topIntents: Array<{ intent: string; count: number }>;
  ticketsCreated: number;
  toolCalls: { total: number; ok: number; successRate: number | null; blockedByPolicy: number; integrationErrors: number };
  pulseIspDiagnosticsUsed: number;
  observedAt: string;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <div className="text-2xl font-semibold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Metrics>('/dashboard/metrics').then(setMetrics).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!metrics) return <p className="text-sm text-slate-500">Carregando...</p>;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold text-slate-900">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="Conversas hoje" value={metrics.conversationsToday} />
        <Stat label="Resolvidas pela IA hoje" value={metrics.answeredByAiToday} />
        <Stat label="Transferidas hoje" value={metrics.handedOffToday} />
        <Stat label="Chamados criados (total)" value={metrics.ticketsCreated} />
        <Stat label="Tool calls (total)" value={metrics.toolCalls.total} />
        <Stat
          label="Taxa de sucesso de tool calls"
          value={metrics.toolCalls.successRate !== null ? `${Math.round(metrics.toolCalls.successRate * 100)}%` : '—'}
        />
        <Stat label="Ações recusadas pela policy" value={metrics.toolCalls.blockedByPolicy} />
        <Stat label="Erros de integração" value={metrics.toolCalls.integrationErrors} />
        <Stat label="Diagnósticos PulseISP usados" value={metrics.pulseIspDiagnosticsUsed} />
      </div>

      <div className="rounded border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-medium text-slate-700">Principais intenções (hoje)</h2>
        {metrics.topIntents.length === 0 ? (
          <p className="text-sm text-slate-400">Sem conversas hoje ainda.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {metrics.topIntents.map((i) => (
              <li key={i.intent} className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-700">{i.intent}</span>
                <span className="font-medium text-slate-900">{i.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-slate-400">Observado em {new Date(metrics.observedAt).toLocaleString('pt-BR')}</p>
    </div>
  );
}
