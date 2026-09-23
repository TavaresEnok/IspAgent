'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getAccessToken, clearSession, apiFetch } from '@/lib/api';

interface Me {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
}

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/conversations', label: 'Conversas', icon: '💬' },
  { href: '/handoff', label: 'Fila Humana', icon: '👤' },
  { href: '/customers', label: 'Clientes', icon: '👥' },
  { href: '/sgp', label: 'SGP Telecom', icon: '⚡' },
  { href: '/knowledge', label: 'Base de Conhecimento', icon: '📚' },
  { href: '/integrations', label: 'Integrações', icon: '🔌' },
  { href: '/ai-settings', label: 'Configurações IA', icon: '🤖' },
  { href: '/policies', label: 'Políticas & Regras', icon: '🛡️' },
  { href: '/tools', label: 'Ferramentas ERP', icon: '🛠️' },
  { href: '/users', label: 'Operadores', icon: '🔑' },
  { href: '/audit', label: 'Auditoria', icon: '📜' },
];

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    apiFetch<Me>('/auth/me')
      .then(setMe)
      .catch(() => router.replace('/login'))
      .finally(() => setChecked(true));
  }, [router]);

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">
        <div className="flex items-center gap-3">
          <span className="h-4 w-4 rounded-full border-2 border-cyan-400/30 border-t-cyan-400 animate-spin" />
          <span>Carregando painel Vibe Telecom...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 flex flex-col justify-between border-r border-slate-800/80 bg-slate-900/90 p-4">
        <div>
          {/* Brand Header */}
          <div className="mb-6 flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-400 to-blue-600 font-extrabold text-white shadow-md shadow-cyan-500/20 text-lg">
              V
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-base text-white tracking-tight">Vibe Telecom</span>
              </div>
              <span className="text-[10px] font-medium text-cyan-400 uppercase tracking-wider">
                Painel Staff NOC
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-1 text-xs font-medium">
            {NAV.map((item) => {
              const active = pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2 transition-all ${
                    active
                      ? 'bg-gradient-to-r from-cyan-500/20 to-blue-600/10 text-cyan-300 font-semibold border border-cyan-500/30 shadow-sm'
                      : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'
                  }`}
                >
                  <span className="text-sm">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer Area */}
        <div className="border-t border-slate-800/80 pt-4 px-2 space-y-3">
          {/* SGP Live Status */}
          <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1.5 text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-300 font-medium">SGP Vibe</span>
            </div>
            <span className="text-[10px] text-emerald-400 font-mono">Conectado</span>
          </div>

          {/* User Info */}
          <div className="flex items-center justify-between">
            <div className="min-w-0 pr-2">
              <p className="truncate text-xs font-medium text-slate-200">{me?.email}</p>
              <p className="text-[10px] text-cyan-400/80 font-mono">{me?.role}</p>
            </div>
            <button
              onClick={() => {
                clearSession();
                router.push('/login');
              }}
              title="Encerrar sessão"
              className="rounded-lg border border-slate-800 bg-slate-800/80 p-1.5 text-xs text-slate-400 hover:bg-red-500/20 hover:border-red-500/30 hover:text-red-400 transition"
            >
              🚪
            </button>
          </div>

          {/* Quick link to WebChat */}
          <Link
            href="/webchat"
            className="flex items-center justify-center gap-1.5 rounded-lg border border-cyan-500/20 bg-cyan-500/10 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/20 transition"
          >
            <span>💬 Abrir Web Chat Cliente</span>
          </Link>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-slate-950 p-6 md:p-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
