'use client';

import type { ReactNode } from 'react';

/** Peças visuais comuns das telas de configuração (tema escuro do painel). */
export const inputClass =
  'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-cyan-500 focus:outline-none disabled:opacity-60';

export const buttonPrimary =
  'rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40';

export const buttonSecondary =
  'rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-100 hover:bg-slate-800 disabled:opacity-40';

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div>
      <h1 className="text-xl font-bold text-white">{title}</h1>
      {children && <p className="mt-1 max-w-3xl text-sm text-slate-400">{children}</p>}
    </div>
  );
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="mb-4 flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {children}
      {hint && <span className="text-xs leading-snug text-slate-500">{hint}</span>}
    </label>
  );
}

export function Notice({ kind, children, onClose }: { kind: 'ok' | 'error' | 'info'; children: ReactNode; onClose?: () => void }) {
  const style =
    kind === 'ok'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
      : kind === 'error'
        ? 'border-red-500/30 bg-red-500/10 text-red-200'
        : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-100';
  return (
    <div className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm ${style}`}>
      <div className="min-w-0 break-words">{children}</div>
      {onClose && (
        <button onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-100" aria-label="Fechar">
          ✕
        </button>
      )}
    </div>
  );
}

/** Valor que o admin precisa copiar (senha inicial, URL de webhook). */
export function CopyValue({ value }: { value: string }) {
  return (
    <div className="mt-1 flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-cyan-200">{value}</code>
      <button
        type="button"
        onClick={() => void navigator.clipboard?.writeText(value)}
        className="shrink-0 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
      >
        Copiar
      </button>
    </div>
  );
}
