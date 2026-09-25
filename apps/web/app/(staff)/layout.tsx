'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getAccessToken, clearSession, apiFetch, API_URL } from '@/lib/api';

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
  { href: '/leads', label: 'Leads & Retenção', icon: '💼' },
  { href: '/customers', label: 'Clientes', icon: '👥' },
  { href: '/sgp', label: 'SGP Telecom', icon: '⚡' },
  { href: '/playground', label: 'Laboratório IA', icon: '🧪' },
  { href: '/knowledge', label: 'Base de Conhecimento', icon: '📚' },
  { href: '/integrations', label: 'Integrações', icon: '🔌' },
  { href: '/ai-settings', label: 'Configurações IA', icon: '🤖' },
  { href: '/policies', label: 'Políticas & Regras', icon: '🛡️' },
  { href: '/tools', label: 'Ferramentas ERP', icon: '🛠️' },
  { href: '/users', label: 'Operadores', icon: '🔑' },
  { href: '/audit', label: 'Auditoria', icon: '📜' },
];

function playNotificationChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {}
}

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);
  const [pendingHandoffs, setPendingHandoffs] = useState<number>(0);
  const [realtimeAlert, setRealtimeAlert] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    apiFetch<Me>('/auth/me')
      .then(setMe)
      .catch(() => router.replace('/login'))
      .finally(() => setChecked(true));

    // Busca contagem inicial de handoffs
    apiFetch<any[]>('/handoff/queue')
      .then((q) => setPendingHandoffs(q.length))
      .catch(() => {});

    // Tempo real (SSE). O tenant vem do token; EventSource não envia header, então o token vai na query.
    // Em erro (ex.: token expirado), reconecta lendo o token atual — o apiFetch das telas já o renova.
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    const connect = () => {
      const token = getAccessToken();
      if (!token || closed) return;
      es = new EventSource(`${API_URL}/events/stream?access_token=${encodeURIComponent(token)}`);
      es.onmessage = (event) => {
        let payload: { type?: string; payload?: unknown } | null = null;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }
        window.dispatchEvent(new CustomEvent('ispagent:realtime', { detail: payload }));
        if (payload?.type === 'NEW_HANDOFF') {
          setPendingHandoffs((prev) => prev + 1);
          playNotificationChime();
          setRealtimeAlert('🔔 Novo cliente entrou na Fila de Atendente Humano!');
          setTimeout(() => setRealtimeAlert(null), 5000);
        }
      };
      es.onerror = () => {
        es?.close();
        if (!closed) retry = setTimeout(() => apiFetch('/auth/me').catch(() => null).finally(connect), 5000);
      };
    };
    connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      es?.close();
    };
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
                  <span className="flex-1">{item.label}</span>
                  {item.href === '/handoff' && pendingHandoffs > 0 && (
                    <span className="rounded-full bg-orange-500/20 border border-orange-500/40 text-orange-400 text-[10px] font-bold px-2 py-0.5 animate-pulse">
                      {pendingHandoffs}
                    </span>
                  )}
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
        <div className="mx-auto max-w-7xl">
          {realtimeAlert && (
            <div className="mb-6 rounded-2xl border border-orange-500/40 bg-orange-950/80 p-4 text-xs text-orange-200 shadow-xl flex items-center justify-between backdrop-blur-md animate-in slide-in-from-top-4 duration-300">
              <div className="flex items-center gap-3">
                <span className="text-xl">🔔</span>
                <span className="font-semibold">{realtimeAlert}</span>
              </div>
              <Link
                href="/handoff"
                className="rounded-xl bg-orange-500 hover:bg-orange-400 px-3.5 py-1.5 text-xs font-bold text-slate-950 shadow-md transition"
              >
                Atender Cliente Agora →
              </Link>
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
