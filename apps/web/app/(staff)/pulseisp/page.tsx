'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';

interface Connection {
  configured: boolean;
  baseUrl: string;
  email: string | null;
  hasPassword: boolean;
  updatedAt: string | null;
}

interface TestResult {
  ok: boolean;
  latencyMs: number;
  totalCustomers?: number;
  error?: string;
}

interface CustomerHit {
  id: string;
  externalId: string;
  name: string;
  city: string | null;
  neighborhood: string | null;
  status: string;
  healthScore: number | null;
  healthBand: string | null;
  contract: { plan: { name: string; downloadMbps: number } | null } | null;
}

interface Me {
  tenantId: string;
}

const BAND_STYLE: Record<string, string> = {
  HEALTHY: 'bg-emerald-100 text-emerald-800',
  ATTENTION: 'bg-amber-100 text-amber-800',
  CRITICAL: 'bg-red-100 text-red-800',
};

export default function PulseIspPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [conn, setConn] = useState<Connection | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [test, setTest] = useState<TestResult | null>(null);
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<{ items: CustomerHit[]; total: number } | null>(null);

  useEffect(() => {
    Promise.all([apiFetch<Me>('/auth/me'), apiFetch<Connection>('/pulseisp/connection')])
      .then(([m, c]) => {
        setMe(m);
        setConn(c);
        setBaseUrl(c.baseUrl);
        setEmail(c.email ?? '');
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Falha ao carregar'));
  }, []);

  async function run<T>(key: string, fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      return await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha na requisição');
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    const c = await run('save', () =>
      apiFetch<Connection>('/pulseisp/connection', {
        method: 'PATCH',
        body: JSON.stringify({ baseUrl, email, password: password || undefined }),
      }),
    );
    if (c) {
      setConn(c);
      setPassword('');
      setTest(null);
      setNotice('Conexão salva. Use "Testar conexão" para confirmar o login.');
    }
  }

  async function runTest() {
    const r = await run('test', () => apiFetch<TestResult>('/pulseisp/connection/test', { method: 'POST' }));
    if (r) setTest(r);
  }

  async function doSearch() {
    const r = await run('search', () => apiFetch<{ items: CustomerHit[]; total: number }>(`/pulseisp/customers?search=${encodeURIComponent(search)}`));
    if (r) setHits(r);
  }

  async function simulate(customerId: string) {
    const r = await run(`sim-${customerId}`, () =>
      apiFetch<{ channelUserId: string; customerName: string }>('/pulseisp/simulate', {
        method: 'POST',
        body: JSON.stringify({ customerId }),
      }),
    );
    if (r && me) {
      window.location.href = `/webchat?tenant=${encodeURIComponent(me.tenantId)}&as=${encodeURIComponent(r.channelUserId)}`;
    }
  }

  if (!conn) return error ? <p className="text-sm text-red-600">{error}</p> : <p className="text-sm text-slate-500">Carregando...</p>;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">PulseISP</h1>
        <p className="text-sm text-slate-500">
          Conecte o ISPAgent ao PulseISP deste provedor (só leitura) e simule um cliente real no Web Chat para ver como o
          agente responde com os dados de rede dele.
        </p>
      </div>

      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded bg-blue-50 px-3 py-2 text-sm text-blue-800">{notice}</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-medium text-slate-700">Conexão</h2>

          <label className="mb-3 flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">URL da API do PulseISP</span>
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="rounded border border-slate-300 px-3 py-2 font-mono text-xs" />
            <span className="text-xs text-slate-400">De dentro do Docker, o PulseISP local é <code>http://host.docker.internal:4000/api</code>.</span>
          </label>

          <label className="mb-3 flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">E-mail do login no PulseISP</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" className="rounded border border-slate-300 px-3 py-2 text-sm" />
          </label>

          <label className="mb-3 flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Senha {conn.hasPassword ? '(já salva)' : ''}</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={conn.hasPassword ? '•••••••• — deixe em branco para manter' : 'senha do PulseISP'}
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button onClick={save} disabled={busy !== null || !baseUrl || !email} className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40">
              {busy === 'save' ? 'Salvando...' : 'Salvar'}
            </button>
            <button onClick={runTest} disabled={busy !== null || !conn.configured} className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">
              {busy === 'test' ? 'Testando...' : 'Testar conexão'}
            </button>
          </div>

          {test &&
            (test.ok ? (
              <p className="mt-2 rounded bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                Conexão OK em {test.latencyMs} ms — {test.totalCustomers?.toLocaleString('pt-BR')} clientes no PulseISP.
              </p>
            ) : (
              <p className="mt-2 break-words rounded bg-red-50 px-3 py-2 text-xs text-red-700">Falhou: {test.error}</p>
            ))}

          <p className="mt-3 text-xs text-slate-400">
            Use um login de LEITURA no PulseISP (perfil VIEWER), não o admin. A senha fica salva no banco em texto puro
            (ambiente local/DEMO) e a tela nunca a mostra de volta.
          </p>
        </section>

        <section className="rounded border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-medium text-slate-700">Simulador — fingir ser um cliente real</h2>
          <p className="mb-3 rounded bg-red-50 px-3 py-2 text-xs text-red-800">
            Dados reais de clientes do provedor. O simulador só copia nome, plano e status; endereço e documento não são
            copiados. Só admins veem esta busca.
          </p>

          <div className="flex gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search.trim().length >= 2 && doSearch()}
              placeholder="nome, código ou login PPPoE"
              className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
            />
            <button onClick={doSearch} disabled={busy !== null || search.trim().length < 2 || !conn.configured} className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40">
              {busy === 'search' ? 'Buscando...' : 'Buscar'}
            </button>
          </div>
          {!conn.configured && <p className="mt-2 text-xs text-amber-700">Salve a conexão ao lado primeiro.</p>}

          {hits && (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-xs text-slate-500">
                {hits.total.toLocaleString('pt-BR')} resultado(s){hits.total > hits.items.length ? ` — mostrando ${hits.items.length}` : ''}
              </p>
              {hits.items.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 rounded border border-slate-200 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{c.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {[c.city, c.neighborhood].filter(Boolean).join(' · ') || 'sem cidade'} · {c.contract?.plan?.name ?? 'sem plano'} · {c.status}
                    </p>
                    <p className="mt-1 text-xs">
                      {c.healthBand ? (
                        <span className={`rounded px-1.5 py-0.5 ${BAND_STYLE[c.healthBand] ?? 'bg-slate-100'}`}>
                          saúde {c.healthScore} — {c.healthBand}
                        </span>
                      ) : (
                        <span className="text-slate-400">sem telemetria</span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => simulate(c.id)}
                    disabled={busy !== null}
                    className="shrink-0 rounded bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                  >
                    {busy === `sim-${c.id}` ? 'Abrindo...' : 'Conversar como este cliente'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
