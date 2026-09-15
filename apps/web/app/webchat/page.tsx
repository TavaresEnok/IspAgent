'use client';

import { useEffect, useRef, useState } from 'react';
import { API_URL } from '@/lib/api';

interface Message {
  id: string;
  role: 'CUSTOMER' | 'AGENT' | 'HUMAN' | 'SYSTEM';
  content: string;
  createdAt: string;
}

const TENANTS = [
  { id: 'tnt_demo_alpha', label: 'Provedor Alpha' },
  { id: 'tnt_demo_beta', label: 'Provedor Beta' },
];

const SAMPLE_PHONES = [
  { phone: '+5511999990001', label: 'cus_demo_a — saudável' },
  { phone: '+5511999990002', label: 'cus_demo_b — fatura vencida' },
  { phone: '+5511999990003', label: 'cus_demo_c — quedas frequentes' },
  { phone: '+5511999990004', label: 'cus_demo_d — problema coletivo (PON)' },
  { phone: '+5511999990005', label: 'cus_demo_e — plano antigo' },
  { phone: '+5511999990006', label: 'cus_demo_f — chamado já aberto' },
  { phone: '+5511999990007', label: 'cus_demo_g/g2 — identidade ambígua' },
  { phone: '+5511900000000', label: 'telefone não cadastrado' },
];

export default function WebChatPage() {
  const [tenantId, setTenantId] = useState(TENANTS[0].id);
  const [phone, setPhone] = useState(SAMPLE_PHONES[0].phone);
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationStatus, setConversationStatus] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadHistory() {
    const res = await fetch(`${API_URL}/public/webchat/${tenantId}/conversation/${encodeURIComponent(phone)}`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages);
      setConversationStatus(data.status);
    }
    setStarted(true);
  }

  async function send() {
    if (!input.trim() || sending) return;
    setSending(true);
    const text = input;
    setInput('');
    try {
      const res = await fetch(`${API_URL}/public/webchat/${tenantId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelUserId: phone, message: text }),
      });
      const data = await res.json();
      setMessages(data.messages);
    } finally {
      setSending(false);
    }
  }

  if (!started) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="mb-1 text-xl font-semibold text-slate-900">ISPAgent — Web Chat</h1>
          <p className="mb-6 text-sm text-slate-500">
            DEMO: digite um dos telefones do seed abaixo para simular a identificação do cliente.
          </p>

          <label className="mb-3 flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Provedor</span>
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            >
              {TENANTS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <label className="mb-1 flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Seu telefone</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <select
            onChange={(e) => setPhone(e.target.value)}
            value=""
            className="mb-4 w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-500"
          >
            <option value="" disabled>
              ou escolha um cenário do seed...
            </option>
            {SAMPLE_PHONES.map((s) => (
              <option key={s.phone} value={s.phone}>
                {s.label}
              </option>
            ))}
          </select>

          <button
            onClick={loadHistory}
            className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Iniciar conversa
          </button>

          <a href="/login" className="mt-4 block text-center text-xs text-slate-400 hover:text-slate-600">
            Sou atendente →
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-slate-100">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <h1 className="text-sm font-semibold text-slate-900">ISPAgent — Web Chat</h1>
          <p className="text-xs text-slate-400">
            {phone} · {TENANTS.find((t) => t.id === tenantId)?.label}
            {conversationStatus ? ` · ${conversationStatus}` : ''}
          </p>
        </div>
        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">MODO DEMO</span>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex max-w-lg flex-col gap-2">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                m.role === 'CUSTOMER'
                  ? 'self-end bg-slate-900 text-white'
                  : m.role === 'AGENT'
                    ? 'self-start bg-white text-slate-800 shadow-sm'
                    : 'self-center bg-amber-50 text-amber-800'
              }`}
            >
              {m.content}
            </div>
          ))}
          {conversationStatus === 'HUMAN_ACTIVE' && (
            <div className="self-center rounded bg-blue-50 px-3 py-2 text-xs text-blue-700">
              Um atendente humano assumiu esta conversa.
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-slate-200 bg-white p-3">
        <div className="mx-auto flex max-w-lg gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Digite sua mensagem..."
            className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            onClick={send}
            disabled={sending}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Enviar
          </button>
        </div>
      </div>
    </main>
  );
}
