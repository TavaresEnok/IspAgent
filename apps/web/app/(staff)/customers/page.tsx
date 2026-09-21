'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface CustomerRow {
  id: string;
  name: string;
  document: string;
  phones: string[];
  contracts: Array<{ id: string; status: string }>;
}

export default function CustomersPage() {
  const [items, setItems] = useState<CustomerRow[] | null>(null);

  useEffect(() => {
    apiFetch<{ items: CustomerRow[] }>('/customers?pageSize=50').then((r) => setItems(r.items));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-slate-900">Clientes</h1>
      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2">Documento</th>
              <th className="px-4 py-2">Telefones</th>
              <th className="px-4 py-2">Contratos</th>
            </tr>
          </thead>
          <tbody>
            {items?.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2 text-slate-900">{c.name}</td>
                <td className="px-4 py-2 text-slate-500">{c.document}</td>
                <td className="px-4 py-2 text-slate-500">{c.phones.join(', ') || '—'}</td>
                <td className="px-4 py-2 text-slate-500">
                  {c.contracts.map((ct) => (
                    <span key={ct.id} className="mr-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                      {ct.status}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
