'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';

interface CommercialLead {
  id: string;
  type: string;
  customerName?: string;
  customerPhone?: string;
  customerDoc?: string;
  targetPlan?: string;
  notes?: string;
  createdAt: string;
}

interface CancellationRequest {
  id: string;
  conversationId: string;
  reason: string;
  discountOffered?: string;
  discountAccepted?: boolean;
  status: string;
  createdAt: string;
}

export default function LeadsAndRetentionPage() {
  const [tab, setTab] = useState<'LEADS' | 'RETENTION'>('LEADS');
  const [leads, setLeads] = useState<CommercialLead[] | null>(null);
  const [cancellations, setCancellations] = useState<CancellationRequest[] | null>(null);

  useEffect(() => {
    apiFetch<CommercialLead[]>('/dashboard/leads')
      .then(setLeads)
      .catch(() => setLeads([]));

    apiFetch<CancellationRequest[]>('/dashboard/cancellations')
      .then(setCancellations)
      .catch(() => setCancellations([]));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Oportunidades & Retenção</h1>
          <p className="mt-0.5 text-xs text-slate-400">
            Leads comerciais captados pela IA e clientes em processo de retenção de cancelamento.
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center rounded-xl border border-slate-800 bg-slate-900/90 p-1">
          <button
            onClick={() => setTab('LEADS')}
            className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition ${
              tab === 'LEADS'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            💼 Leads Comerciais ({leads?.length ?? 0})
          </button>
          <button
            onClick={() => setTab('RETENTION')}
            className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition ${
              tab === 'RETENTION'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            🧲 Retenção de Cancelamentos ({cancellations?.length ?? 0})
          </button>
        </div>
      </div>

      {/* Leads Tab Content */}
      {tab === 'LEADS' && (
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 backdrop-blur-md">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/50 text-[11px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-5 py-3.5">Tipo</th>
                  <th className="px-5 py-3.5">Cliente / Contato</th>
                  <th className="px-5 py-3.5">Documento</th>
                  <th className="px-5 py-3.5">Plano Solicitado</th>
                  <th className="px-5 py-3.5">Data de Registro</th>
                  <th className="px-5 py-3.5">Observações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {leads === null ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                      Carregando leads comerciais...
                    </td>
                  </tr>
                ) : leads.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                      Nenhum lead captado ainda. O agente registrará novos interessados automaticamente.
                    </td>
                  </tr>
                ) : (
                  leads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-5 py-3.5">
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                          lead.type === 'UPGRADE'
                            ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        }`}>
                          {lead.type}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-medium text-white">
                        {lead.customerName || lead.customerPhone || 'Cliente Interessado'}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-slate-400">{lead.customerDoc || '—'}</td>
                      <td className="px-5 py-3.5 text-cyan-300 font-semibold">{lead.targetPlan || 'Consulta de Planos'}</td>
                      <td className="px-5 py-3.5 text-slate-400">{new Date(lead.createdAt).toLocaleString('pt-BR')}</td>
                      <td className="px-5 py-3.5 text-slate-300 max-w-xs truncate">{lead.notes || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Retention Tab Content */}
      {tab === 'RETENTION' && (
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 backdrop-blur-md">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/50 text-[11px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-5 py-3.5">Motivo Alegado</th>
                  <th className="px-5 py-3.5">Oferta de Retenção</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Data</th>
                  <th className="px-5 py-3.5 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {cancellations === null ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                      Carregando tentativas de cancelamento...
                    </td>
                  </tr>
                ) : cancellations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                      Nenhum pedido de cancelamento registrado.
                    </td>
                  </tr>
                ) : (
                  cancellations.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-5 py-3.5 text-white font-medium">{c.reason}</td>
                      <td className="px-5 py-3.5 text-amber-300 font-mono">
                        {c.discountOffered || 'Transferência Direta para Retenção'}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                          c.status === 'RETAINED'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : c.status === 'NEGOTIATING'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                            : 'bg-red-500/10 text-red-400 border border-red-500/30'
                        }`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-400">{new Date(c.createdAt).toLocaleString('pt-BR')}</td>
                      <td className="px-5 py-3.5 text-right">
                        <Link
                          href={`/conversations/${c.conversationId}`}
                          className="rounded bg-slate-800 border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:text-white hover:bg-slate-700 transition"
                        >
                          Ver Conversa →
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
