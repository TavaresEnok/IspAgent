'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { ROLE_HIERARCHY, type Role } from '@ispagent/shared';
import { getAccessToken, apiLogout, apiFetch, API_URL } from '@/lib/api';

const BRAND = process.env.NEXT_PUBLIC_WEBCHAT_BRAND || 'ISPAgent';

interface Me {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
}

// `minRole` espelha o RBAC da API (@Roles nos controllers): o menu só mostra o que o papel consegue usar.
const NAV: Array<{ href: string; label: string; icon: string; minRole: Role }> = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊', minRole: 'READ_ONLY' },
  { href: '/conversations', label: 'Conversas', icon: '💬', minRole: 'ANALYST' },
  { href: '/handoff', label: 'Fila Humana', icon: '👤', minRole: 'ANALYST' },
  { href: '/leads', label: 'Leads & Retenção', icon: '💼', minRole: 'ANALYST' },
  { href: '/customers', label: 'Clientes', icon: '👥', minRole: 'ANALYST' },
  { href: '/sgp', label: 'SGP', icon: '⚡', minRole: 'AGENT' },
  { href: '/whatsapp', label: 'WhatsApp', icon: '📱', minRole: 'TENANT_ADMIN' },
  { href: '/flows', label: 'Fluxos', icon: '🧩', minRole: 'SUPERVISOR' },
  { href: '/pulseisp', label: 'PulseISP', icon: '📡', minRole: 'TENANT_ADMIN' },
  { href: '/playground', label: 'Laboratório IA', icon: '🧪', minRole: 'TENANT_ADMIN' },
  { href: '/knowledge', label: 'Base de Conhecimento', icon: '📚', minRole: 'READ_ONLY' },
  { href: '/integrations', label: 'Integrações', icon: '🔌', minRole: 'READ_ONLY' },
  { href: '/ai-settings', label: 'Configurações IA', icon: '🤖', minRole: 'TENANT_ADMIN' },
  { href: '/policies', label: 'Políticas & Regras', icon: '🛡️', minRole: 'READ_ONLY' },
  { href: '/tools', label: 'Ferramentas ERP', icon: '🛠️', minRole: 'READ_ONLY' },
  { href: '/users', label: 'Operadores', icon: '🔑', minRole: 'TENANT_ADMIN' },
  { href: '/audit', label: 'Auditoria', icon: '📜', minRole: 'SUPERVISOR' },
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

    // Tempo real (SSE). O EventSource não envia Authorization: pede-se um ticket curto logado e o stream
    // é aberto com ele; se a conexão cair, pede outro ticket (o antigo já expirou).
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    const connect = async () => {
      try {
        const { ticket } = await apiFetch<{ ticket: string }>('/events/ticket', { method: 'POST' });
        if (closed) return;
        es = new EventSource(`${API_URL}/events/stream?ticket=${encodeURIComponent(ticket)}`);
        es.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            // Outras telas (ex.: detalhe da conversa) se atualizam ouvindo este evento, sem abrir outro stream.
            window.dispatchEvent(new CustomEvent('ispagent:realtime', { detail: payload }));
            if (payload?.type === 'NEW_HANDOFF') {
              setPendingHandoffs((prev) => prev + 1);
              playNotificationChime();
              setRealtimeAlert('🔔 Novo cliente entrou na Fila de Atendente Humano!');
              setTimeout(() => setRealtimeAlert(null), 5000);
            }
          } catch {}
        };
        es.onerror = () => {
          es?.close();
          if (!closed) retry = setTimeout(connect, 10_000);
        };
      } catch {
        if (!closed) retry = setTimeout(connect, 30_000);
      }
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(retry);
      es?.close();
    };
  }, [router]);

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">
        <div className="flex items-center gap-3">
          <span className="h-4 w-4 rounded-full border-2 border-cyan-400/30 border-t-cyan-400 animate-spin" />
          <span>Carregando painel {BRAND}...</span>
        </div>
      </div>
    );
  }

  const rank = me ? (ROLE_HIERARCHY[me.role as Role] ?? 0) : 0;
  const fullBleed = /^\/flows\/[^/]+/.test(pathname ?? '');
  const visibleNav = NAV.filter((item) => rank >= ROLE_HIERARCHY[item.minRole]);

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 flex flex-col justify-between border-r border-slate-800/80 bg-slate-900/90 p-4">
        <div>
          {/* Brand Header */}
          <div className="mb-6 flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-400 to-blue-600 font-extrabold text-white shadow-md shadow-cyan-500/20 text-lg">
              {BRAND.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-base text-white tracking-tight">{BRAND}</span>
              </div>
              <span className="text-[10px] font-medium text-cyan-400 uppercase tracking-wider">
                Painel Staff NOC
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-1 text-xs font-medium">
            {visibleNav.map((item) => {
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
          {/* User Info */}
          <div className="flex items-center justify-between">
            <div className="min-w-0 pr-2">
              <p className="truncate text-xs font-medium text-slate-200">{me?.email}</p>
              <p className="text-[10px] text-cyan-400/80 font-mono">{me?.role}</p>
            </div>
            <button
              onClick={async () => {
                await apiLogout();
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
      {/* O editor de fluxo usa a tela inteira (canvas); as demais páginas ficam centralizadas. */}
      <main className={`flex-1 bg-slate-950 ${fullBleed ? 'overflow-hidden' : 'overflow-y-auto p-6 md:p-8'}`}>
        <div className={fullBleed ? 'h-full' : 'mx-auto max-w-7xl'}>
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
