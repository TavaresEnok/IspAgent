'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface ConversationRow {
  id: string;
  channel: string;
  channelUserId: string;
  status: string;
  customer: { id: string; name: string } | null;
  updatedAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  AI_ACTIVE: 'bg-emerald-100 text-emerald-800',
  AWAITING_CONFIRMATION: 'bg-amber-100 text-amber-800',
  HANDOFF_PENDING: 'bg-orange-100 text-orange-800',
  HUMAN_ACTIVE: 'bg-blue-100 text-blue-800',
  CLOSED: 'bg-slate-100 text-slate-600',
};

export default function ConversationsPage() {
  const [items, setItems] = useState<ConversationRow[] | null>(null);

  useEffect(() => {
    apiFetch<{ items: ConversationRow[] }>('/conversations?pageSize=50').then((r) => setItems(r.items));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-slate-900">Conversas</h1>

      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Cliente</th>
              <th className="px-4 py-2">Canal</th>
              <th className="px-4 py-2">Identificador</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Atualizada</th>
            </tr>
          </thead>
          <tbody>
            {items?.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2">
                  <a href={`/conversations/${c.id}`} className="text-slate-900 hover:underline">
                    {c.customer?.name ?? 'Não identificado'}
                  </a>
                </td>
                <td className="px-4 py-2 text-slate-500">{c.channel}</td>
                <td className="px-4 py-2 text-slate-500">{c.channelUserId}</td>
                <td className="px-4 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLES[c.status] ?? 'bg-slate-100'}`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-400">{new Date(c.updatedAt).toLocaleString('pt-BR')}</td>
              </tr>
            ))}
            {items?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Nenhuma conversa ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
