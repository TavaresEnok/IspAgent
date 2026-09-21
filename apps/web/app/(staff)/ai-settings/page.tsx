'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';

interface ProviderCard {
  provider: string;
  label: string;
  needsApiKey: boolean;
  defaultModel: string | null;
  modelSuggestions: string[];
  hasApiKey: boolean;
  maskedApiKey: string | null;
  model: string | null;
  updatedAt: string | null;
  isActive: boolean;
}

interface Overview {
  active: string;
  effective: string;
  providers: ProviderCard[];
}

interface TestResult {
  ok: boolean;
  provider: string;
  model: string | null;
  latencyMs: number;
  sample?: { intent: string; confidence: string };
  error?: string;
}

interface Draft {
  apiKey: string;
  model: string;
  clearApiKey: boolean;
}

function TestBadge({ result }: { result: TestResult }) {
  if (result.ok) {
    return (
      <p className="mt-2 rounded bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
        Conexão OK — <span className="font-mono">{result.model}</span> respondeu em {result.latencyMs} ms (classificou a
        mensagem de teste como {result.sample?.intent}, confiança {result.sample?.confidence}).
      </p>
    );
  }
  return (
    <p className="mt-2 break-words rounded bg-red-50 px-3 py-2 text-xs text-red-700">
      Falhou{result.latencyMs ? ` após ${result.latencyMs} ms` : ''}: {result.error}
    </p>
  );
}

export default function AiSettingsPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, TestResult>>({});

  function applyOverview(o: Overview, resetDraftFor?: string) {
    setOverview(o);
    setDrafts((prev) => {
      const next = { ...prev };
      for (const p of o.providers) {
        if (!p.needsApiKey) continue;
        if (!next[p.provider] || p.provider === resetDraftFor) {
          next[p.provider] = { apiKey: '', model: p.model ?? '', clearApiKey: false };
        }
      }
      return next;
    });
  }

  useEffect(() => {
    apiFetch<Overview>('/ai-config')
      .then((o) => applyOverview(o))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Falha ao carregar'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patchDraft(provider: string, change: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [provider]: { ...d[provider], ...change } }));
  }

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

  function saveBody(provider: string) {
    const d = drafts[provider];
    return JSON.stringify({ apiKey: d.apiKey || undefined, model: d.model || undefined, clearApiKey: d.clearApiKey || undefined });
  }

  async function save(provider: string) {
    const o = await run(`save-${provider}`, () =>
      apiFetch<Overview>(`/ai-config/providers/${provider}`, { method: 'PATCH', body: saveBody(provider) }),
    );
    if (!o) return;
    applyOverview(o, provider);
    const card = o.providers.find((p) => p.provider === provider)!;
    setNotice(
      card.isActive
        ? `${card.label}: salvo — já está em uso.`
        : card.hasApiKey
          ? `${card.label}: salvo. Ainda NÃO está em uso — clique em "Usar este".`
          : `${card.label}: salvo (ainda sem chave).`,
    );
  }

  async function saveAndUse(provider: string) {
    const saved = await run(`use-${provider}`, () =>
      apiFetch<Overview>(`/ai-config/providers/${provider}`, { method: 'PATCH', body: saveBody(provider) }),
    );
    if (!saved) return;
    applyOverview(saved, provider);
    await activate(provider);
  }

  async function activate(provider: string) {
    const o = await run(`use-${provider}`, () =>
      apiFetch<Overview>('/ai-config/active', { method: 'PATCH', body: JSON.stringify({ provider }) }),
    );
    if (o) {
      applyOverview(o);
      setNotice(`Agora o agente usa ${o.providers.find((p) => p.provider === provider)!.label}. Vale já na próxima mensagem.`);
    }
  }

  async function test(provider: string) {
    const d = drafts[provider];
    const result = await run(`test-${provider}`, () =>
      apiFetch<TestResult>(`/ai-config/providers/${provider}/test`, {
        method: 'POST',
        body: JSON.stringify(d ? { apiKey: d.apiKey || undefined, model: d.model || undefined } : {}),
      }),
    );
    if (result) setTests((t) => ({ ...t, [provider]: result }));
  }

  if (!overview) {
    return error ? <p className="text-sm text-red-600">{error}</p> : <p className="text-sm text-slate-500">Carregando...</p>;
  }

  const effectiveCard = overview.providers.find((p) => p.provider === overview.effective)!;
  const activeCard = overview.providers.find((p) => p.isActive)!;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">IA</h1>
        <p className="text-sm text-slate-500">
          Cada provider tem o seu bloco, com chave e modelo salvos separados — é só escolher qual o agente usa. Vale na
          próxima mensagem, sem editar <code className="rounded bg-slate-100 px-1">.env</code> nem reiniciar nada.
        </p>
      </div>

      <div
        className={`rounded border px-3 py-2 text-sm ${
          overview.active === overview.effective ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-300 bg-amber-50 text-amber-900'
        }`}
      >
        Em uso agora: <strong>{effectiveCard.label}</strong>
        {overview.active !== overview.effective && (
          <> — {activeCard.label} está selecionado, mas sem chave salva, então o agente roda no Mock.</>
        )}
      </div>

      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded bg-blue-50 px-3 py-2 text-sm text-blue-800">{notice}</p>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {overview.providers.map((p) => {
          const d = drafts[p.provider];
          const canTest = !p.needsApiKey || Boolean(d?.apiKey) || p.hasApiKey;
          const canUse = !p.needsApiKey || p.hasApiKey;
          const datalistId = `models-${p.provider}`;

          return (
            <section key={p.provider} className={`rounded border p-4 ${p.isActive ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200 bg-white'}`}>
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-800">{p.label}</h2>
                {p.isActive && (
                  <span className="shrink-0 rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                    {p.provider === overview.effective ? 'EM USO' : 'SELECIONADO'}
                  </span>
                )}
              </div>

              {p.needsApiKey && d ? (
                <>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-slate-600">
                    <dt className="text-slate-400">Salvo</dt>
                    <dd>
                      {p.hasApiKey ? (
                        <>
                          chave <span className="break-all font-mono">{p.maskedApiKey}</span>
                          {p.updatedAt ? ` · ${new Date(p.updatedAt).toLocaleString('pt-BR')}` : ''}
                        </>
                      ) : (
                        <span className="text-slate-400">sem chave</span>
                      )}
                    </dd>
                  </dl>

                  <label className="mt-3 flex flex-col gap-1 text-sm">
                    <span className="font-medium text-slate-700">Chave da API</span>
                    <input
                      type="password"
                      autoComplete="off"
                      value={d.apiKey}
                      onChange={(e) => patchDraft(p.provider, { apiKey: e.target.value })}
                      disabled={d.clearApiKey}
                      placeholder={p.hasApiKey ? 'deixe em branco para manter a salva, ou cole uma nova' : 'cole a chave aqui'}
                      className="rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
                    />
                  </label>
                  {p.hasApiKey && (
                    <label className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                      <input type="checkbox" checked={d.clearApiKey} onChange={(e) => patchDraft(p.provider, { clearApiKey: e.target.checked })} />
                      Remover a chave salva
                    </label>
                  )}

                  <label className="mt-3 flex flex-col gap-1 text-sm">
                    <span className="font-medium text-slate-700">Modelo</span>
                    <input
                      list={datalistId}
                      value={d.model}
                      onChange={(e) => patchDraft(p.provider, { model: e.target.value })}
                      placeholder={p.defaultModel ? `${p.defaultModel} (padrão)` : ''}
                      className="rounded border border-slate-300 px-3 py-2 text-sm"
                    />
                    <datalist id={datalistId}>
                      {p.modelSuggestions.map((m) => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                    <span className="text-xs text-slate-400">Digite o nome exato do modelo, ou escolha uma sugestão.</span>
                  </label>
                </>
              ) : (
                <p className="mt-2 text-xs text-slate-500">Sem chave nem modelo — respostas por regras, sempre disponível.</p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {p.needsApiKey && (
                  <>
                    <button
                      onClick={() => save(p.provider)}
                      disabled={busy !== null}
                      className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
                    >
                      {busy === `save-${p.provider}` ? 'Salvando...' : 'Salvar'}
                    </button>
                    <button
                      onClick={() => saveAndUse(p.provider)}
                      disabled={busy !== null || (!d?.apiKey && !p.hasApiKey) || Boolean(d?.clearApiKey)}
                      className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                    >
                      {busy === `use-${p.provider}` ? 'Ativando...' : 'Salvar e usar'}
                    </button>
                  </>
                )}
                {!p.needsApiKey && (
                  <button
                    onClick={() => activate(p.provider)}
                    disabled={busy !== null || p.isActive}
                    className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                  >
                    {p.isActive ? 'Em uso' : busy === `use-${p.provider}` ? 'Ativando...' : 'Usar este'}
                  </button>
                )}
                {p.needsApiKey && canUse && !p.isActive && (
                  <button
                    onClick={() => activate(p.provider)}
                    disabled={busy !== null}
                    className="rounded border border-emerald-600 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                  >
                    Usar este
                  </button>
                )}
                <button
                  onClick={() => test(p.provider)}
                  disabled={busy !== null || !canTest}
                  title={!canTest ? 'Cole uma chave para testar' : undefined}
                  className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  {busy === `test-${p.provider}` ? 'Testando...' : 'Testar conexão'}
                </button>
              </div>
              {p.needsApiKey && !canTest && <p className="mt-2 text-xs text-slate-400">Cole a chave acima para poder testar.</p>}
              {p.needsApiKey && (
                <p className="mt-2 text-xs text-slate-400">
                  &quot;Testar&quot; faz uma chamada real com o que está digitado (ou o salvo, se estiver em branco) — não precisa salvar antes.
                </p>
              )}
              {p.provider === 'gemini' && (
                <p className="mt-2 text-xs text-slate-500">
                  Chave grátis em{' '}
                  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="underline">
                    aistudio.google.com/apikey
                  </a>
                  .
                </p>
              )}
              {tests[p.provider] && <TestBadge result={tests[p.provider]} />}
            </section>
          );
        })}
      </div>

      <p className="text-xs text-slate-400">
        As chaves ficam salvas no banco em texto puro e a tela só mostra o início e o fim delas — ambiente local/DEMO. Não é
        a postura recomendada para produção (precisaria de um secret manager).
      </p>
    </div>
  );
}
