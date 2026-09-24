'use client';

import { useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';

interface SgpContract {
  id: string;
  planName: string;
  status: string;
  address?: string;
}

interface SgpCustomerInfo {
  id: string;
  name: string;
  document: string;
  phones: string[];
  contracts: SgpContract[];
}

export default function SgpConsolePage() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [foundCustomer, setFoundCustomer] = useState<SgpCustomerInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSearch() {
    const q = query.trim();
    if (q.length < 2 || searching) return;
    setSearching(true);
    setError(null);
    setNotice(null);
    setFoundCustomer(null);

    try {
      const data = await apiFetch<{ found: boolean; customer?: SgpCustomerInfo }>(
        `/sgp/customer?query=${encodeURIComponent(q)}`,
      );
      if (!data.found || !data.customer) {
        setNotice('Nenhum cliente encontrado no SGP com o termo informado.');
      } else {
        setFoundCustomer(data.customer);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha na conexão com a API do SGP.');
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-white tracking-tight">SGP Telecom — Vibe Telecom</h1>
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            API Oficial Conectada
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-400">
          Console de consulta e diagnóstico em tempo real conectado diretamente ao SGP da Vibe Telecom.
        </p>
      </div>

      {/* Connection Info & IP Whitelist Guide */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-md">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Domínio SGP</span>
          <div className="mt-1 text-sm font-semibold text-white font-mono">
            https://vibetelecom.sgp.net.br/
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Endpoints URA e Central do Assinante ativos.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-md">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Identificação da Aplicação</span>
          <div className="mt-1 text-sm font-semibold text-cyan-400 font-mono">
            App: webchatnoc
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Token de acesso autenticado em todas as chamadas.
          </p>
        </div>

        <div className="rounded-2xl border border-cyan-500/30 bg-cyan-950/20 p-5 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400">IP de Saída Desta Máquina</span>
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
          </div>
          <div className="mt-1 text-sm font-bold text-white font-mono">
            168.194.15.42
          </div>
          <p className="mt-2 text-xs text-cyan-300/80">
            Libere este IP no SGP Admin em <span className="font-semibold text-white">Ferramentas → Tokens</span> se houver bloqueio 403.
          </p>
        </div>
      </div>

      {/* Customer Lookup & Test Section */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 backdrop-blur-md">
        <h2 className="text-base font-bold text-white mb-2">Consulta de Cliente Real no SGP</h2>
        <p className="text-xs text-slate-400 mb-4">
          Digite CPF, CNPJ, número de telefone ou número de contrato para testar a busca direta no SGP da Vibe Telecom:
        </p>

        <div className="flex max-w-xl gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Digite CPF/CNPJ, Telefone com DDD ou Contrato"
            className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none transition"
          />
          <button
            onClick={handleSearch}
            disabled={searching || query.trim().length < 2}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110 active:scale-95 disabled:opacity-40 transition shadow-md shadow-cyan-500/20"
          >
            {searching ? 'Consultando...' : 'Consultar SGP'}
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-400">
            {error}
          </div>
        )}

        {notice && (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-400">
            {notice}
          </div>
        )}

        {/* Found Customer Details */}
        {foundCustomer && (
          <div className="mt-6 rounded-xl border border-slate-700 bg-slate-950 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <span className="text-[10px] font-mono uppercase text-cyan-400">Cliente SGP</span>
                <h3 className="text-lg font-bold text-white">{foundCustomer.name}</h3>
                <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                  <span>Documento: <code className="text-slate-300 font-mono">{foundCustomer.document}</code></span>
                  <span>•</span>
                  <span>Telefones: {foundCustomer.phones.join(', ') || 'Nenhum cadastrado'}</span>
                </div>
              </div>

              <a
                href={`/webchat?as=${encodeURIComponent(`sgp:${foundCustomer.id}`)}`}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 shadow-md transition"
              >
                <span>💬 Iniciar Web Chat como este Cliente</span>
                <span>→</span>
              </a>
            </div>

            <div className="mt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                Contratos no SGP ({foundCustomer.contracts?.length || 0})
              </h4>

              {foundCustomer.contracts?.length === 0 ? (
                <p className="text-xs text-slate-500">Nenhum contrato ativo localizado no SGP.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {foundCustomer.contracts.map((c) => (
                    <div key={c.id} className="rounded-lg border border-slate-800 bg-slate-900/80 p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">Contrato #{c.id}</span>
                        <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                          {c.status}
                        </span>
                      </div>
                      <p className="text-xs text-cyan-300 font-medium mt-1">{c.planName}</p>
                      {c.address && (
                        <p className="text-[11px] text-slate-400 mt-1 truncate">📍 {c.address}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Endpoints Matrix */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-md">
        <h3 className="text-sm font-bold text-white mb-1">Rotas Utilizadas no SGP da Vibe Telecom</h3>
        <p className="text-xs text-slate-400 mb-4">
          Operações executadas pelo agente de atendimento durante as conversas:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <span className="font-mono text-cyan-400 text-[11px]">POST /api/ura/pagamento/pix/</span>
            <div className="font-semibold text-white mt-1">Geração de PIX Copia e Cola</div>
            <p className="mt-1 text-[11px] text-slate-400">
              Gera a chave PIX e QR Code para a fatura aberta do cliente.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <span className="font-mono text-cyan-400 text-[11px]">POST /api/ura/consultaplano/</span>
            <div className="font-semibold text-white mt-1">Consulta de Planos e Contratos</div>
            <p className="mt-1 text-[11px] text-slate-400">
              Valida planos contratados, velocidades de download/upload e status da conexão.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <span className="font-mono text-cyan-400 text-[11px]">POST /api/central/ocorrencia/</span>
            <div className="font-semibold text-white mt-1">Abertura e Consulta de O.S.</div>
            <p className="mt-1 text-[11px] text-slate-400">
              Registra chamados de suporte diretamente na Central do Assinante do SGP.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
