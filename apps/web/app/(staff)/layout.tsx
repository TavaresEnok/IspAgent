'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getAccessToken, clearSession, apiFetch } from '@/lib/api';

interface Me {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
}

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/conversations', label: 'Conversas' },
  { href: '/handoff', label: 'Fila humana' },
  { href: '/customers', label: 'Clientes' },
  { href: '/knowledge', label: 'Knowledge Base' },
  { href: '/integrations', label: 'Integrações' },
  { href: '/ai-settings', label: 'IA' },
  { href: '/pulseisp', label: 'PulseISP' },
  { href: '/policies', label: 'Políticas' },
  { href: '/tools', label: 'Ferramentas' },
  { href: '/users', label: 'Usuários' },
  { href: '/audit', label: 'Auditoria' },
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

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-slate-200 bg-slate-950 p-4 text-slate-200">
        <div className="mb-6 text-lg font-semibold text-white">ISPAgent</div>
        <nav className="flex flex-col gap-1 text-sm">
          {NAV.map((item) => (
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
            onClick={() => {
              clearSession();
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
