'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface AuditLogRow {
  id: string;
  actorType: string;
  actorId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
}

export default function AuditPage() {
  const [items, setItems] = useState<AuditLogRow[] | null>(null);

  useEffect(() => {
    apiFetch<{ items: AuditLogRow[] }>('/audit-logs?pageSize=100').then((r) => setItems(r.items));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-slate-900">Auditoria</h1>
      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Quando</th>
              <th className="px-4 py-2">Ator</th>
              <th className="px-4 py-2">Ação</th>
              <th className="px-4 py-2">Entidade</th>
            </tr>
          </thead>
          <tbody>
            {items?.map((l) => (
              <tr key={l.id} className="border-b border-slate-100">
                <td className="px-4 py-2 text-slate-400">{new Date(l.createdAt).toLocaleString('pt-BR')}</td>
                <td className="px-4 py-2 text-slate-500">
                  {l.actorType}
                  {l.actorId ? ` (${l.actorId})` : ''}
                </td>
                <td className="px-4 py-2 font-mono text-xs text-slate-800">{l.action}</td>
                <td className="px-4 py-2 text-slate-500">
                  {l.entityType ? `${l.entityType}:${l.entityId}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
