'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface Doc {
  id: string;
  title: string;
  content: string;
  source: string | null;
  createdAt: string;
}

export default function KnowledgePage() {
  const [items, setItems] = useState<Doc[] | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    apiFetch<Doc[]>('/knowledge').then(setItems);
  }

  useEffect(load, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/knowledge', { method: 'POST', body: JSON.stringify({ title, content }) });
      setTitle('');
      setContent('');
      load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold text-slate-900">Knowledge Base</h1>

      <form onSubmit={create} className="flex flex-col gap-2 rounded border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-medium text-slate-700">Novo documento</h2>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título"
          required
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Conteúdo"
          required
          rows={3}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={saving}
          className="self-start rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Adicionar
        </button>
      </form>

      <div className="flex flex-col gap-3">
        {items?.map((d) => (
          <div key={d.id} className="rounded border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-medium text-slate-900">{d.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{d.content}</p>
            {d.source && <p className="mt-1 text-xs text-slate-400">Fonte: {d.source}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
