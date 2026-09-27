'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ROLE_HIERARCHY, type Role } from '@ispagent/shared';
import { apiFetch, ApiError } from '@/lib/api';

interface FlowSummary {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  publishedVersion: number;
  publishedAt: string | null;
  updatedAt: string;
  draftChanged: boolean;
}

export default function FlowsPage() {
  const router = useRouter();
  const [flows, setFlows] = useState<FlowSummary[] | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canEdit = role ? (ROLE_HIERARCHY[role] ?? 0) >= ROLE_HIERARCHY.TENANT_ADMIN : false;

  const reload = () =>
    apiFetch<FlowSummary[]>('/flows')
      .then(setFlows)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Falha ao carregar os fluxos.'));

  useEffect(() => {
    apiFetch<{ role: Role }>('/auth/me').then((m) => setRole(m.role)).catch(() => undefined);
    void reload();
  }, []);

  async function act<T>(key: string, fn: () => Promise<T>) {
    setBusy(key);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Falha na operação.');
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  async function create(copyFromId?: string, copyName?: string) {
    const flowName = copyName ?? (name.trim() || 'Novo fluxo');
    const f = await act('create', () =>
      apiFetch<{ id: string }>('/flows', { method: 'POST', body: JSON.stringify({ name: flowName, copyFromId }) }),
    );
    if (f) router.push(`/flows/${f.id}`);
  }

  async function toggle(f: FlowSummary) {
    if (!f.active && !confirm(`Ativar "${f.name}"? Ele passa a conduzir as NOVAS conversas (o fluxo ativo anterior é desativado).`)) return;
    await act(`active-${f.id}`, () => apiFetch(`/flows/${f.id}/active`, { method: 'POST', body: JSON.stringify({ active: !f.active }) }));
    await reload();
  }

  async function remove(f: FlowSummary) {
    if (!confirm(`Excluir o fluxo "${f.name}"? Isso não pode ser desfeito.`)) return;
    await act(`del-${f.id}`, () => apiFetch(`/flows/${f.id}`, { method: 'DELETE' }));
    await reload();
  }

  const active = flows?.find((f) => f.active);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-white">Fluxos de atendimento</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Monte visualmente como o atendimento começa: menus, perguntas, identificação por CPF, consultas ao SGP, abertura de chamado e
          transferência para o setor certo. Em qualquer ponto o fluxo pode passar a conversa para a IA do ISPAgent.
        </p>
      </div>

      <div
        className={`rounded-2xl border p-4 text-sm ${
          active ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200' : 'border-slate-800 bg-slate-900/60 text-slate-300'
        }`}
      >
        {active ? (
          <>
            ● <b>{active.name}</b> (v{active.publishedVersion}) está conduzindo as novas conversas.
          </>
        ) : (
          <>Nenhum fluxo ativo: a IA do ISPAgent atende sozinha, como hoje.</>
        )}
      </div>

      {error && <p className="rounded-xl bg-red-500/10 px-4 py-2 text-sm text-red-300">{error}</p>}

      {canEdit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Nome do novo fluxo (ex.: Atendimento padrão)"
            className="min-w-[280px] flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
          />
          <button
            disabled={busy !== null}
            className="rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy === 'create' ? 'Criando…' : '+ Criar fluxo'}
          </button>
          <span className="w-full text-xs text-slate-500">O fluxo novo já vem com um modelo pronto (menu, 2ª via por CPF e IA) para você adaptar.</span>
        </form>
      )}

      {!flows ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : flows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center text-sm text-slate-400">
          Nenhum fluxo criado ainda.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {flows.map((f) => (
            <div key={f.id} className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/flows/${f.id}`} className="text-base font-semibold text-slate-100 hover:text-cyan-300">
                  🧩 {f.name}
                </Link>
                {f.active && <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">● Ativo</span>}
              </div>
              <div className="flex flex-wrap gap-1.5 text-[10px]">
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">
                  {f.publishedVersion ? `Publicado v${f.publishedVersion}` : 'Nunca publicado'}
                </span>
                {f.draftChanged && f.publishedVersion > 0 && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-300">Rascunho alterado</span>}
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-400">
                  Editado {new Date(f.updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>
              <div className="mt-auto flex flex-wrap gap-2 pt-1">
                <Link href={`/flows/${f.id}`} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-800">
                  {canEdit ? 'Editar' : 'Ver'}
                </Link>
                {canEdit && (
                  <>
                    <button
                      onClick={() => void toggle(f)}
                      disabled={busy !== null || (!f.active && !f.publishedVersion)}
                      title={!f.publishedVersion ? 'Publique o fluxo antes de ativar' : undefined}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${
                        f.active ? 'border border-red-500/40 text-red-300 hover:bg-red-500/10' : 'bg-emerald-600 text-white'
                      }`}
                    >
                      {f.active ? 'Desativar' : 'Ativar'}
                    </button>
                    <button
                      onClick={() => void create(f.id, `${f.name} (cópia)`)}
                      disabled={busy !== null}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                    >
                      Duplicar
                    </button>
                    {!f.active && (
                      <button
                        onClick={() => void remove(f)}
                        disabled={busy !== null}
                        className="rounded-lg px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
                      >
                        Excluir
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
