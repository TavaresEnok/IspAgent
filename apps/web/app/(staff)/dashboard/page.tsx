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

function StatCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon?: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg backdrop-blur-md transition-all hover:border-slate-700">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400">{label}</span>
        {icon && <span className="text-lg">{icon}</span>}
      </div>
      <div className="mt-3 text-3xl font-extrabold tracking-tight text-white">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Metrics>('/dashboard/metrics').then(setMetrics).catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-400">
        Falha ao carregar métricas: {error}
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        <div className="flex items-center gap-3">
          <span className="h-4 w-4 rounded-full border-2 border-cyan-400/30 border-t-cyan-400 animate-spin" />
          <span>Carregando métricas da Vibe Telecom...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Painel de Atendimento NOC</h1>
          <p className="mt-0.5 text-xs text-slate-400">
            Métricas de desempenho da IA e integrações do provedor Vibe Telecom.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-400">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>SGP Online • <code className="text-slate-300 font-mono">vibetelecom.sgp.net.br</code></span>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Conversas Hoje"
          value={metrics.conversationsToday}
          sub="Total de sessões ativas e concluídas"
          icon="💬"
        />
        <StatCard
          label="Resolvidas por IA"
          value={metrics.answeredByAiToday}
          sub="Autoatendimento sem intervenção humana"
          icon="🤖"
        />
        <StatCard
          label="Transferidas (Handoff)"
          value={metrics.handedOffToday}
          sub="Encaminhadas para operadores humanos"
          icon="👥"
        />
        <StatCard
          label="Chamados SGP Criados"
          value={metrics.ticketsCreated}
          sub="Ocorrências abertas na Central do Assinante"
          icon="🛠️"
        />
      </div>

      {/* Secondary Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Chamadas de Ferramentas (Tool Calls)"
          value={metrics.toolCalls.total}
          sub={`${metrics.toolCalls.ok} executadas com sucesso`}
          icon="⚡"
        />
        <StatCard
          label="Taxa de Sucesso das Tools"
          value={metrics.toolCalls.successRate !== null ? `${Math.round(metrics.toolCalls.successRate * 100)}%` : '100%'}
          sub="Eficiência das rotas de integração"
          icon="📈"
        />
        <StatCard
          label="Ações Bloqueadas por Regras"
          value={metrics.toolCalls.blockedByPolicy}
          sub="Travadas por políticas de segurança"
          icon="🛡️"
        />
      </div>

      {/* Top Intents & Active Workflows */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 backdrop-blur-md">
          <h2 className="text-sm font-bold text-white mb-1">Principais Intenções dos Clientes</h2>
          <p className="text-xs text-slate-400 mb-4">Classificações detectadas pelo orquestrador nas mensagens</p>

          {metrics.topIntents.length === 0 ? (
            <div className="flex h-36 items-center justify-center rounded-xl border border-dashed border-slate-800 text-xs text-slate-500">
              Nenhuma conversa registrada hoje ainda.
            </div>
          ) : (
            <div className="space-y-2.5">
              {metrics.topIntents.map((i) => (
                <div key={i.intent} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-2.5">
                  <span className="text-xs font-medium text-slate-300">{i.intent}</span>
                  <span className="rounded-full bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-0.5 text-xs font-semibold text-cyan-400 font-mono">
                    {i.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 backdrop-blur-md">
          <h2 className="text-sm font-bold text-white mb-1">Status Operacional do Sistema</h2>
          <p className="text-xs text-slate-400 mb-4">Camadas de serviço ativas para a Vibe Telecom</p>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex items-center gap-2.5">
                <span className="text-base">🏢</span>
                <div>
                  <div className="font-semibold text-white">ERP Oficial</div>
                  <div className="text-[11px] text-slate-400">SGP Telecom (Vibe Telecom)</div>
                </div>
              </div>
              <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
                Ativo
              </span>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex items-center gap-2.5">
                <span className="text-base">🧠</span>
                <div>
                  <div className="font-semibold text-white">Agente & Orquestrador</div>
                  <div className="text-[11px] text-slate-400">Tool Calls SGP + Router Semântico</div>
                </div>
              </div>
              <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
                Ativo
              </span>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex items-center gap-2.5">
                <span className="text-base">💬</span>
                <div>
                  <div className="font-semibold text-white">Canal WebChat</div>
                  <div className="text-[11px] text-slate-400">Público / Autoatendimento 24/7</div>
                </div>
              </div>
              <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
                Ativo
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="text-right text-[11px] text-slate-500">
        Última atualização: {new Date(metrics.observedAt).toLocaleString('pt-BR')}
      </div>
    </div>
  );
}
