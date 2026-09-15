'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface ActionSpec {
  action: string;
  tier: string;
  configFlag?: string;
}

const TIER_STYLES: Record<string, string> = {
  READ: 'bg-emerald-100 text-emerald-800',
  WRITE_LOW_RISK: 'bg-amber-100 text-amber-800',
  WRITE_SENSITIVE: 'bg-orange-100 text-orange-800',
  ADMIN: 'bg-red-100 text-red-800',
};

export default function ToolsPage() {
  const [actions, setActions] = useState<ActionSpec[] | null>(null);

  useEffect(() => {
    apiFetch<ActionSpec[]>('/policy/actions').then(setActions);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-slate-900">Ferramentas</h1>
      <p className="text-sm text-slate-500">
        Catálogo de ações que o agente pode propor (seção 4) — tier de risco e a flag de policy que
        controla cada uma. <code>ADMIN</code> é sempre bloqueado, sem exceção (fora de escopo do MVP).
      </p>

      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Ação</th>
              <th className="px-4 py-2">Tier</th>
              <th className="px-4 py-2">Flag de policy</th>
            </tr>
          </thead>
          <tbody>
            {actions?.map((a) => (
              <tr key={a.action} className="border-b border-slate-100">
                <td className="px-4 py-2 font-mono text-xs text-slate-800">{a.action}</td>
                <td className="px-4 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${TIER_STYLES[a.tier] ?? 'bg-slate-100'}`}>{a.tier}</span>
                </td>
                <td className="px-4 py-2 text-slate-500">
                  {a.configFlag ?? (a.tier === 'ADMIN' ? '— (sempre bloqueado, fora de escopo)' : '— (sempre permitido no tier)')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
