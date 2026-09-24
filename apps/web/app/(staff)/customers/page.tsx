'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';

interface CustomerRow {
  id: string;
  name: string;
  document: string;
  phones: string[];
  contracts: Array<{ id: string; status: string; planName?: string }>;
}

export default function CustomersPage() {
  const [items, setItems] = useState<CustomerRow[] | null>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ items: CustomerRow[] }>('/customers?pageSize=50')
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, []);

  async function searchSgp() {
    const q = query.trim();
    if (q.length < 2 || searching) return;
    setSearching(true);
    setSearchMsg(null);
    setSearchResult(null);

    try {
      const data = await apiFetch<{ found: boolean; customer?: typeof searchResult }>(
        `/sgp/customer?query=${encodeURIComponent(q)}`,
      );
      if (!data.found || !data.customer) {
        setSearchMsg('Nenhum cliente localizado no SGP com estes dados.');
      } else {
        setSearchResult(data.customer);
      }
    } catch (err) {
      setSearchMsg(err instanceof ApiError ? err.message : 'Não foi possível conectar à API do SGP.');
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Base de Clientes</h1>
          <p className="mt-0.5 text-xs text-slate-400">
            Clientes sincronizados e consulta direta à base oficial do SGP.
          </p>
        </div>
        <a
          href="/sgp"
          className="inline-flex items-center gap-2 rounded-xl bg-slate-800 border border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-700 transition"
        >
          <span>⚡ Console SGP Completo</span>
          <span>→</span>
        </a>
      </div>

      {/* SGP Live Search Box */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 backdrop-blur-md">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">🔍 Consulta Rápida no SGP</span>
          <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-300 font-mono">vibetelecom.sgp.net.br</span>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          Localize o cliente em tempo real no SGP por CPF, CNPJ, telefone com DDD ou número de contrato:
        </p>

        <div className="flex max-w-xl gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchSgp()}
            placeholder="Digite CPF/CNPJ ou Telefone..."
            className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
          />
          <button
            onClick={searchSgp}
            disabled={searching || query.trim().length < 2}
            className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-40 transition"
          >
            {searching ? 'Buscando...' : 'Buscar no SGP'}
          </button>
        </div>

        {searchMsg && (
          <p className="mt-2 text-xs text-amber-400">{searchMsg}</p>
        )}

        {searchResult && (
          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-white">{searchResult.name}</span>
                <span className="ml-3 text-xs text-slate-400 font-mono">CPF: {searchResult.document}</span>
              </div>
              <a
                href={`/webchat?as=${encodeURIComponent(`sgp:${searchResult.id}`)}`}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition"
              >
                Abrir Chat deste Cliente →
              </a>
            </div>
            {searchResult.contracts?.length > 0 && (
              <div className="mt-2 text-xs text-slate-300">
                <span>Contrato #{searchResult.contracts[0].id} — {searchResult.contracts[0].planName}</span>
                <span className="ml-2 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300">
                  {searchResult.contracts[0].status}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Customer List */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 backdrop-blur-md">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Clientes Recentes no Sistema</h2>
          <span className="text-xs text-slate-400 font-mono">{items?.length || 0} registro(s)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-950/50 text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-3">Nome</th>
                <th className="px-5 py-3">Documento</th>
                <th className="px-5 py-3">Telefones</th>
                <th className="px-5 py-3">Contratos</th>
                <th className="px-5 py-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {items === null ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                    Carregando clientes...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                    Nenhum cliente registrado localmente ainda. Use a busca no SGP acima.
                  </td>
                </tr>
              ) : (
                items.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-5 py-3.5 font-medium text-white">{c.name}</td>
                    <td className="px-5 py-3.5 text-slate-300 font-mono">{c.document}</td>
                    <td className="px-5 py-3.5 text-slate-400">{c.phones.join(', ') || '—'}</td>
                    <td className="px-5 py-3.5">
                      {c.contracts.map((ct) => (
                        <span
                          key={ct.id}
                          className="mr-1.5 rounded bg-slate-800 border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300"
                        >
                          #{ct.id} ({ct.status})
                        </span>
                      ))}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <a
                        href={`/webchat?as=${encodeURIComponent(c.phones[0] || `cust:${c.id}`)}`}
                        className="rounded bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 text-xs font-medium text-cyan-300 hover:bg-cyan-500/20 transition"
                      >
                        Chat →
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
