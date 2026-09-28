'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { CopyValue, Field, Notice, PageHeader, Section, buttonPrimary, buttonSecondary, inputClass } from '@/components/settings';

interface Usage {
  conversationsThisMonth: number;
  aiTurnsThisMonth: number;
  activeUsers: number;
  monthlyConversationLimit: number | null;
  maxUsers: number | null;
}

interface TenantRow {
  id: string;
  name: string;
  slug: string | null;
  status: 'ACTIVE' | 'SUSPENDED';
  plan: string;
  customDomain: string | null;
  createdAt: string;
  usage: Usage;
}

const PLANS = [
  { value: 'basic', label: 'Básico' },
  { value: 'pro', label: 'Pro' },
  { value: 'enterprise', label: 'Enterprise' },
];

const toInt = (v: string): number | null => (v.trim() ? Math.max(1, Math.floor(Number(v))) || null : null);

export default function PlatformPage() {
  const [items, setItems] = useState<TenantRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [created, setCreated] = useState<{ slug: string; email: string; password: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', adminName: '', adminEmail: '', plan: 'basic', monthlyConversationLimit: '', maxUsers: '' });

  const reload = () => apiFetch<TenantRow[]>('/platform/tenants').then(setItems);

  useEffect(() => {
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
    const res = await act('create', () =>
      apiFetch<{ id: string; slug: string; admin: { email: string; initialPassword: string } }>('/platform/tenants', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          slug: form.slug,
          adminName: form.adminName,
          adminEmail: form.adminEmail,
          plan: form.plan,
          monthlyConversationLimit: toInt(form.monthlyConversationLimit) ?? undefined,
          maxUsers: toInt(form.maxUsers) ?? undefined,
        }),
      }),
    );
    if (res) {
      setCreated({ slug: res.slug, email: res.admin.email, password: res.admin.initialPassword });
      setForm({ name: '', slug: '', adminName: '', adminEmail: '', plan: 'basic', monthlyConversationLimit: '', maxUsers: '' });
      await reload();
    }
  }

  async function patch(t: TenantRow, body: Record<string, unknown>, okText: string) {
    if (body.status === 'SUSPENDED' && !confirm(`Suspender ${t.name}? A equipe perde o acesso e a IA para de atender na hora.`)) return false;
    const res = await act(t.id, () => apiFetch(`/platform/tenants/${t.id}`, { method: 'PATCH', body: JSON.stringify(body) }));
    if (res) {
      setNotice({ kind: 'ok', text: okText });
      await reload();
    }
    return Boolean(res);
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: k === 'slug' ? e.target.value.toLowerCase() : e.target.value });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Plataforma">Os provedores que usam o ISPAgent: cadastro, plano, limites, domínio próprio e consumo do mês.</PageHeader>

      {notice && (
        <Notice kind={notice.kind} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}
      {created && (
        <Notice kind="info" onClose={() => setCreated(null)}>
          Provedor criado. Envie ao administrador por um canal seguro (a senha aparece só agora):
          <CopyValue value={`${origin}/login?p=${created.slug}`} />
          <CopyValue value={created.email} />
          <CopyValue value={created.password} />
        </Notice>
      )}

      <Section title="Novo provedor">
        <form onSubmit={(e) => void create(e)}>
          <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Nome do provedor">
              <input className={inputClass} value={form.name} onChange={set('name')} required minLength={2} />
            </Field>
            <Field label="Apelido (endereço)" hint="ex.: netfibra → /login?p=netfibra">
              <input className={`${inputClass} font-mono`} value={form.slug} onChange={set('slug')} required pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]" />
            </Field>
            <Field label="Nome do administrador">
              <input className={inputClass} value={form.adminName} onChange={set('adminName')} required minLength={2} />
            </Field>
            <Field label="E-mail do administrador">
              <input className={inputClass} type="email" value={form.adminEmail} onChange={set('adminEmail')} required />
            </Field>
            <Field label="Plano">
              <select className={inputClass} value={form.plan} onChange={set('plan')}>
                {PLANS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Conversas por mês" hint="Em branco = sem limite">
              <input className={inputClass} inputMode="numeric" value={form.monthlyConversationLimit} onChange={set('monthlyConversationLimit')} />
            </Field>
            <Field label="Operadores ativos" hint="Em branco = sem limite">
              <input className={inputClass} inputMode="numeric" value={form.maxUsers} onChange={set('maxUsers')} />
            </Field>
          </div>
          <button className={buttonPrimary} disabled={busy !== null}>
            {busy === 'create' ? 'Criando…' : 'Criar provedor'}
          </button>
        </form>
      </Section>

      <Section title={`Provedores${items ? ` (${items.length})` : ''}`}>
        {!items ? (
          <p className="text-sm text-slate-500">Carregando…</p>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((t) =>
              editing === t.id ? (
                <EditTenant key={t.id} tenant={t} busy={busy !== null} onCancel={() => setEditing(null)} onSave={async (body) => (await patch(t, body, 'Provedor atualizado.')) && setEditing(null)} />
              ) : (
                <TenantCard
                  key={t.id}
                  tenant={t}
                  busy={busy !== null}
                  onEdit={() => setEditing(t.id)}
                  onToggle={() => void patch(t, { status: t.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' }, t.status === 'ACTIVE' ? 'Provedor suspenso.' : 'Provedor reativado.')}
                />
              ),
            )}
          </div>
        )}
      </Section>
    </div>
  );
}

function Meter({ label, value, limit }: { label: string; value: number; limit: number | null }) {
  const pct = limit ? Math.min(100, Math.round((value / limit) * 100)) : 0;
  return (
    <div className="min-w-[140px]">
      <div className="flex justify-between text-[11px] text-slate-400">
        <span>{label}</span>
        <span className="font-mono text-slate-200">
          {value}
          {limit ? ` / ${limit}` : ''}
        </span>
      </div>
      {limit && (
        <div className="mt-1 h-1.5 rounded-full bg-slate-800">
          <div className={`h-1.5 rounded-full ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-400' : 'bg-cyan-500'}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

function TenantCard({ tenant: t, busy, onEdit, onToggle }: { tenant: TenantRow; busy: boolean; onEdit: () => void; onToggle: () => void }) {
  const active = t.status === 'ACTIVE';
  return (
    <div className={`rounded-xl border border-slate-800 bg-slate-950/60 p-4 ${active ? '' : 'opacity-60'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-white">
            {t.name}{' '}
            <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
              {active ? 'Ativo' : 'Suspenso'}
            </span>
          </p>
          <p className="mt-0.5 font-mono text-xs text-slate-500">
            {t.slug ?? t.id} · plano {PLANS.find((p) => p.value === t.plan)?.label ?? t.plan}
            {t.customDomain ? ` · ${t.customDomain}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button className={buttonSecondary} disabled={busy} onClick={onEdit}>
            Editar
          </button>
          <button
            className={`rounded-xl px-3 py-2 text-sm ${active ? 'text-red-300 hover:bg-red-500/10' : 'text-emerald-300 hover:bg-emerald-500/10'}`}
            disabled={busy}
            onClick={onToggle}
          >
            {active ? 'Suspender' : 'Reativar'}
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-6">
        <Meter label="Conversas no mês" value={t.usage.conversationsThisMonth} limit={t.usage.monthlyConversationLimit} />
        <Meter label="Respostas da IA" value={t.usage.aiTurnsThisMonth} limit={null} />
        <Meter label="Operadores ativos" value={t.usage.activeUsers} limit={t.usage.maxUsers} />
      </div>
    </div>
  );
}

function EditTenant({ tenant: t, busy, onCancel, onSave }: { tenant: TenantRow; busy: boolean; onCancel: () => void; onSave: (body: Record<string, unknown>) => void }) {
  const [plan, setPlan] = useState(t.plan);
  const [conv, setConv] = useState(t.usage.monthlyConversationLimit?.toString() ?? '');
  const [users, setUsers] = useState(t.usage.maxUsers?.toString() ?? '');
  const [domain, setDomain] = useState(t.customDomain ?? '');
  return (
    <div className="rounded-xl border border-cyan-500/40 bg-slate-950/60 p-4">
      <p className="mb-3 font-semibold text-white">{t.name}</p>
      <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Plano">
          <select className={inputClass} value={plan} onChange={(e) => setPlan(e.target.value)}>
            {PLANS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Conversas por mês" hint="Em branco = sem limite">
          <input className={inputClass} inputMode="numeric" value={conv} onChange={(e) => setConv(e.target.value)} />
        </Field>
        <Field label="Operadores ativos" hint="Em branco = sem limite">
          <input className={inputClass} inputMode="numeric" value={users} onChange={(e) => setUsers(e.target.value)} />
        </Field>
        <Field label="Domínio próprio" hint="Aponte o DNS (CNAME/A) para este servidor.">
          <input className={`${inputClass} font-mono`} value={domain} onChange={(e) => setDomain(e.target.value.toLowerCase().trim())} placeholder="atendimento.provedor.com.br" />
        </Field>
      </div>
      <div className="flex gap-2">
        <button
          className={buttonPrimary}
          disabled={busy}
          onClick={() => onSave({ plan, monthlyConversationLimit: toInt(conv), maxUsers: toInt(users), customDomain: domain || null })}
        >
          Salvar
        </button>
        <button className={buttonSecondary} disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
