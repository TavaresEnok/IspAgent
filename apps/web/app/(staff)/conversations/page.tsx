'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface ConversationRow {
  id: string;
  channel: string;
  channelUserId: string;
  status: string;
  customer: { id: string; name: string } | null;
  updatedAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  AI_ACTIVE: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30',
  AWAITING_CONFIRMATION: 'bg-amber-500/10 text-amber-400 border border-amber-500/30',
  HANDOFF_PENDING: 'bg-orange-500/10 text-orange-400 border border-orange-500/30 animate-pulse',
  HUMAN_ACTIVE: 'bg-blue-500/10 text-blue-400 border border-blue-500/30',
  CLOSED: 'bg-slate-800 text-slate-400 border border-slate-700',
};

const STATUS_LABELS: Record<string, string> = {
  AI_ACTIVE: 'IA Ativa',
  AWAITING_CONFIRMATION: 'Aguardando Cliente',
  HANDOFF_PENDING: 'Fila de Atendente',
  HUMAN_ACTIVE: 'Atendente na Linha',
  CLOSED: 'Encerrada',
};

export default function ConversationsPage() {
  const [items, setItems] = useState<ConversationRow[] | null>(null);
  const [status, setStatus] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');

  const loadConversations = () => {
    let url = '/conversations?pageSize=50';
    if (status !== 'ALL') url += `&status=${status}`;
    if (search.trim()) url += `&search=${encodeURIComponent(search.trim())}`;
    apiFetch<{ items: ConversationRow[] }>(url)
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  };

  useEffect(() => {
    loadConversations();
  }, [status]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadConversations();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Histórico de Atendimentos</h1>
          <p className="mt-0.5 text-xs text-slate-400">
            Sessões de conversa em andamento e encerradas pelo agente e operadores.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Buscar CPF, nome ou ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none w-52"
            />
            <button
              type="submit"
              className="rounded-lg bg-cyan-600/80 hover:bg-cyan-500 px-3 py-1.5 text-xs font-medium text-white transition"
            >
              Buscar
            </button>
          </form>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
          >
            <option value="ALL">Todos os Status</option>
            <option value="AI_ACTIVE">IA Ativa</option>
            <option value="HANDOFF_PENDING">Fila de Atendente</option>
            <option value="HUMAN_ACTIVE">Atendente na Linha</option>
            <option value="AWAITING_CONFIRMATION">Aguardando Cliente</option>
            <option value="CLOSED">Encerrada</option>
          </select>

          {(status !== 'ALL' || search) && (
            <button
              onClick={() => {
                setStatus('ALL');
                setSearch('');
                apiFetch<{ items: ConversationRow[] }>('/conversations?pageSize=50')
                  .then((r) => setItems(r.items))
                  .catch(() => setItems([]));
              }}
              className="text-xs text-slate-400 hover:text-white underline underline-offset-2"
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 backdrop-blur-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-950/50 text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-3.5">Cliente</th>
                <th className="px-5 py-3.5">Canal</th>
                <th className="px-5 py-3.5">Identificador / Telefone</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Última Mensagem</th>
                <th className="px-5 py-3.5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {items === null ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                    Carregando conversas...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                    Nenhuma conversa registrada ainda. Abra o WebChat para iniciar um atendimento de teste!
                  </td>
                </tr>
              ) : (
                items.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-5 py-3.5 font-medium text-white">
                      {c.customer?.name ?? 'Não identificado'}
                    </td>
                    <td className="px-5 py-3.5 text-slate-300">
                      <span className="rounded bg-slate-800 border border-slate-700 px-2 py-0.5 text-[10px] font-mono">
                        {c.channel}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-slate-400">{c.channelUserId}</td>
                    <td className="px-5 py-3.5">
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[c.status] || 'bg-slate-800 text-slate-400'}`}>
                        {STATUS_LABELS[c.status] || c.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-400">{new Date(c.updatedAt).toLocaleString('pt-BR')}</td>
                    <td className="px-5 py-3.5 text-right">
                      <a
                        href={`/conversations/${c.id}`}
                        className="rounded bg-slate-800 border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:text-white hover:bg-slate-700 transition"
                      >
                        Ver Detalhes →
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
