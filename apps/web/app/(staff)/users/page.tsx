'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { CopyValue, Notice, PageHeader, Section, buttonPrimary, inputClass } from '@/components/settings';

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  createdAt: string;
}

const ROLES: Array<{ value: string; label: string }> = [
  { value: 'TENANT_ADMIN', label: 'Administrador' },
  { value: 'SUPERVISOR', label: 'Supervisor' },
  { value: 'AGENT', label: 'Atendente' },
  { value: 'ANALYST', label: 'Analista' },
  { value: 'READ_ONLY', label: 'Somente leitura' },
];
const roleLabel = (r: string) => ROLES.find((x) => x.value === r)?.label ?? r;

export default function UsersPage() {
  const [items, setItems] = useState<UserRow[] | null>(null);
  const [me, setMe] = useState<{ userId?: string; id?: string } | null>(null);
  const [form, setForm] = useState({ name: '', email: '', role: 'AGENT' });
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);

  const reload = () => apiFetch<UserRow[]>('/users').then(setItems);

  useEffect(() => {
    apiFetch<{ userId?: string; id?: string }>('/auth/me').then(setMe).catch(() => undefined);
    reload().catch((e) => setNotice({ kind: 'error', text: e instanceof ApiError ? e.message : 'Falha ao carregar.' }));
  }, []);

  async function act<T>(key: string, fn: () => Promise<T>) {
    setBusy(key);
    setNotice(null);
    try {
      return await fn();
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof ApiError ? e.message : 'Falha na operação.' });
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const res = await act('create', () => apiFetch<UserRow & { initialPassword: string }>('/users', { method: 'POST', body: JSON.stringify(form) }));
    if (res) {
      setSecret({ email: res.email, password: res.initialPassword });
      setForm({ name: '', email: '', role: 'AGENT' });
      await reload();
    }
  }

  async function update(u: UserRow, patch: Partial<Pick<UserRow, 'role' | 'active'>>) {
    if (patch.active === false && !confirm(`Desativar ${u.name}? A pessoa sai do painel na hora.`)) return;
    if (await act(u.id, () => apiFetch(`/users/${u.id}`, { method: 'PATCH', body: JSON.stringify(patch) }))) await reload();
  }

  async function reset(u: UserRow) {
    if (!confirm(`Gerar uma nova senha para ${u.name}? A senha atual deixa de funcionar.`)) return;
    const res = await act(u.id, () => apiFetch<{ initialPassword: string }>(`/users/${u.id}/reset-password`, { method: 'POST' }));
    if (res) setSecret({ email: u.email, password: res.initialPassword });
  }

  const myId = me?.userId ?? me?.id;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Operadores">A equipe do seu provedor que acessa o painel. Cada pessoa com o seu login e o seu papel.</PageHeader>

      {notice && (
        <Notice kind={notice.kind} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}
      {secret && (
        <Notice kind="info" onClose={() => setSecret(null)}>
          Senha inicial de <b>{secret.email}</b> (aparece só agora — envie à pessoa por um canal seguro):
          <CopyValue value={secret.password} />
        </Notice>
      )}

      <Section title="Novo operador">
        <form onSubmit={(e) => void create(e)} className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_180px_auto]">
          <input className={inputClass} placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className={inputClass} placeholder="E-mail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <select className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <button className={buttonPrimary} disabled={busy !== null}>
            {busy === 'create' ? 'Criando…' : 'Adicionar'}
          </button>
        </form>
      </Section>

      <Section title={`Equipe${items ? ` (${items.filter((u) => u.active).length} ativos)` : ''}`}>
        {!items ? (
          <p className="text-sm text-slate-500">Carregando…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Nome</th>
                  <th className="py-2 pr-3">E-mail</th>
                  <th className="py-2 pr-3">Papel</th>
                  <th className="py-2 pr-3">Situação</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {items.map((u) => {
                  const self = u.id === myId;
                  return (
                    <tr key={u.id} className={u.active ? '' : 'opacity-50'}>
                      <td className="py-2.5 pr-3 text-slate-100">
                        {u.name} {self && <span className="text-xs text-cyan-400">(você)</span>}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-300">{u.email}</td>
                      <td className="py-2.5 pr-3">
                        {self || u.role === 'SUPER_ADMIN' ? (
                          <span className="text-slate-300">{roleLabel(u.role)}</span>
                        ) : (
                          <select
                            className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
                            value={u.role}
                            disabled={busy !== null}
                            onChange={(e) => void update(u, { role: e.target.value })}
                          >
                            {ROLES.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-xs">{u.active ? <span className="text-emerald-300">Ativo</span> : <span className="text-slate-400">Desativado</span>}</td>
                      <td className="py-2.5 text-right">
                        {!self && u.role !== 'SUPER_ADMIN' && (
                          <div className="flex justify-end gap-2">
                            <button className="rounded-lg px-2 py-1 text-xs text-slate-300 hover:bg-slate-800" disabled={busy !== null} onClick={() => void reset(u)}>
                              Nova senha
                            </button>
                            <button
                              className={`rounded-lg px-2 py-1 text-xs ${u.active ? 'text-red-300 hover:bg-red-500/10' : 'text-emerald-300 hover:bg-emerald-500/10'}`}
                              disabled={busy !== null}
                              onClick={() => void update(u, { active: !u.active })}
                            >
                              {u.active ? 'Desativar' : 'Reativar'}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
