'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { ROLE_HIERARCHY, type Role } from '@ispagent/shared';
import { getAccessToken, apiLogout, apiFetch } from '@/lib/api';

interface Me {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
}

// `minRole` espelha o RBAC da API (@Roles nos controllers): o menu só mostra o que o papel consegue usar.
const NAV: Array<{ href: string; label: string; minRole: Role }> = [
  { href: '/dashboard', label: 'Dashboard', minRole: 'READ_ONLY' },
  { href: '/conversations', label: 'Conversas', minRole: 'ANALYST' },
  { href: '/handoff', label: 'Fila humana', minRole: 'ANALYST' },
  { href: '/customers', label: 'Clientes', minRole: 'ANALYST' },
  { href: '/knowledge', label: 'Knowledge Base', minRole: 'READ_ONLY' },
  { href: '/integrations', label: 'Integrações', minRole: 'READ_ONLY' },
  { href: '/ai-settings', label: 'IA', minRole: 'TENANT_ADMIN' },
  { href: '/pulseisp', label: 'PulseISP', minRole: 'TENANT_ADMIN' },
  { href: '/policies', label: 'Políticas', minRole: 'READ_ONLY' },
  { href: '/tools', label: 'Ferramentas', minRole: 'READ_ONLY' },
  { href: '/users', label: 'Usuários', minRole: 'TENANT_ADMIN' },
  { href: '/audit', label: 'Auditoria', minRole: 'SUPERVISOR' },
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!checked) {
    return <div className="p-8 text-sm text-slate-500">Carregando...</div>;
  }

  const rank = me ? (ROLE_HIERARCHY[me.role as Role] ?? 0) : 0;
  const visibleNav = NAV.filter((item) => rank >= ROLE_HIERARCHY[item.minRole]);

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-slate-200 bg-slate-950 p-4 text-slate-200">
        <div className="mb-6 text-lg font-semibold text-white">ISPAgent</div>
        <nav className="flex flex-col gap-1 text-sm">
          {visibleNav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`rounded px-2 py-1.5 hover:bg-slate-800 ${pathname?.startsWith(item.href) ? 'bg-slate-800 text-white' : 'text-slate-300'}`}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="mt-8 border-t border-slate-800 pt-4 text-xs text-slate-400">
          <p className="truncate">{me?.email}</p>
          <p className="text-slate-500">{me?.role}</p>
          <button
            onClick={async () => {
              await apiLogout();
              router.push('/login');
            }}
            className="mt-2 text-slate-400 underline hover:text-white"
          >
            Sair
          </button>
        </div>
      </aside>
      <main className="flex-1 bg-slate-50 p-6">{children}</main>
    </div>
  );
}
