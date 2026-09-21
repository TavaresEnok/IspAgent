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
  { id: 'tnt_vibe', label: 'Vibe Telecom' },
];

const VIBE_TENANT = 'tnt_vibe';

/**
 * Canais `pulse:<id>` são clientes REAIS do PulseISP escolhidos no simulador do painel — a API só aceita
 * quando a requisição leva o login do admin, então o token do painel (mesma origem) vai junto.
 */
function requestHeaders(channelUserId: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  return headers;
}

async function errorText(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  return (body && typeof body.message === 'string' ? body.message : null) ?? `Erro HTTP ${res.status}`;
}

export default function WebChatPage() {
  const [tenantId, setTenantId] = useState(TENANTS[0].id);
  const [phone, setPhone] = useState('webchat_user');
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationStatus, setConversationStatus] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<Array<{ id: string; name: string; city: string | null; status: string; healthBand: string | null; contract: { plan: { name: string } | null } | null }> | null>(null);
  const [searching, setSearching] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  // Vindo do simulador do painel: /webchat?tenant=tnt_vibe&as=pulse:<id> já abre a conversa daquele cliente.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('tenant');
    const as = params.get('as');
    if (t && as && TENANTS.some((x) => x.id === t)) {
      setTenantId(t);
      setPhone(as);
      void loadHistory(t, as);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadHistory(t: string = tenantId, p: string = phone) {
    setError(null);
    const res = await fetch(`${API_URL}/public/webchat/${t}/conversation/${encodeURIComponent(p)}`, {
      headers: requestHeaders(p),
    });
    if (!res.ok) {
      setError(await errorText(res));
      return;
    }
    const data = await res.json();
    setMessages(data.messages);
    setConversationStatus(data.status);
    setStarted(true);
  }

  async function searchPulse() {
    if (search.trim().length < 2 || searching) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/public/webchat/${tenantId}/pulse-customers?search=${encodeURIComponent(search)}`);
      if (!res.ok) return setError(await errorText(res));
      setHits((await res.json()).items);
    } finally {
      setSearching(false);
    }
  }

  async function chatAs(customerId: string) {
    setError(null);
    const res = await fetch(`${API_URL}/public/webchat/${tenantId}/pulse-simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId }),
    });
    if (!res.ok) return setError(await errorText(res));
    const r = await res.json();
    setPhone(r.channelUserId);
    await loadHistory(tenantId, r.channelUserId);
  }

  async function resetConversation() {
    if (resetting) return;
    if (!window.confirm('Apagar o histórico desta conversa e voltar pra identificação?')) return;
    setResetting(true);
    try {
      const res = await fetch(`${API_URL}/public/webchat/${tenantId}/conversation/${encodeURIComponent(phone)}`, {
        method: 'DELETE',
        headers: requestHeaders(phone),
      });
      // Só volta pra tela de identificação se o backend confirmou o reset — nunca fingir sucesso
      // (mesmo princípio de não inventar resultado que vale pro resto do produto). Um 429 de rate
      // limit, por exemplo, não pode passar a impressão de que a conversa foi limpa quando não foi.
      if (!res.ok) {
        window.alert(`Não consegui resetar agora (HTTP ${res.status}). Tenta de novo em alguns segundos.`);
        return;
      }
      setMessages([]);
      setConversationStatus(null);
      setInput('');
      setStarted(false);
    } finally {
      setResetting(false);
    }
  }

  async function send() {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);

    // Atualização otimista imediata para o usuário não esperar
    const tempMsg: Message = {
      id: 'temp_' + Date.now(),
      role: 'CUSTOMER',
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      const res = await fetch(`${API_URL}/public/webchat/${tenantId}/message`, {
        method: 'POST',
        headers: requestHeaders(phone),
        body: JSON.stringify({ channelUserId: phone, message: text }),
      });
      if (!res.ok) {
        setError(await errorText(res));
        setInput(text);
        return;
      }
      setError(null);
      const data = await res.json();
      setMessages(data.messages);
      if (data.status) setConversationStatus(data.status);
    } finally {
      setSending(false);
    }
  }

  function startDirectChat() {
    setError(null);
    const sessionId = 'webchat_' + Math.random().toString(36).substring(2, 9);
    setPhone(sessionId);
    void loadHistory(tenantId, sessionId);
  }

  if (!started) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 font-bold text-white shadow-sm">
              V
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Vibe Telecom</h1>
              <p className="text-xs text-slate-500">Atendimento Inteligente</p>
            </div>
          </div>

          <p className="mb-5 text-sm text-slate-600 leading-relaxed">
            Olá! Tire dúvidas sobre sua conexão, planos ou faturas diretamente com nossa assistente virtual.
          </p>

          <button
            onClick={startDirectChat}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 px-4 text-sm font-semibold text-white shadow hover:bg-blue-700 transition active:scale-[0.99]"
          >
            <span>💬 Iniciar Atendimento</span>
          </button>

          {error && <p className="mt-3 rounded bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

          <details className="mt-5 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <summary className="cursor-pointer font-medium hover:text-slate-800">
              🔍 Simular cliente específico do PulseISP (opcional)
            </summary>
            <div className="mt-3">
              <div className="flex gap-2">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchPulse()}
                  placeholder="nome, código ou login"
                  className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-xs"
                />
                <button
                  onClick={searchPulse}
                  disabled={searching || search.trim().length < 2}
                  className="rounded bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                >
                  {searching ? '...' : 'Buscar'}
                </button>
              </div>
              {hits && hits.length === 0 && <p className="mt-2 text-xs text-slate-400">Nenhum cliente encontrado.</p>}
              {hits && hits.length > 0 && (
                <div className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto">
                  {hits.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => chatAs(c.id)}
                      className="rounded border border-slate-200 p-2 text-left hover:bg-slate-50"
                    >
                      <span className="block text-xs font-medium text-slate-800">{c.name}</span>
                      <span className="block text-[10px] text-slate-500">
                        {c.city ?? 'sem cidade'} · {c.contract?.plan?.name ?? 'sem plano'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </details>

          <a href="/login" className="mt-5 block text-center text-xs text-slate-400 hover:text-slate-600">
            Painel administrativo →
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-slate-100">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-xs">
        <div>
          <h1 className="text-sm font-bold text-slate-900">Vibe Telecom — Atendimento Virtual</h1>
          <p className="text-xs text-slate-400">
            {phone.startsWith('webchat_') ? 'Sessão Web Chat' : phone}
            {conversationStatus ? ` · ${conversationStatus}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {phone.startsWith('pulse:') ? (
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">DADOS REAIS (PulseISP)</span>
          ) : (
            <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">ONLINE</span>
          )}
          <button
            onClick={resetConversation}
            disabled={resetting}
            className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 transition"
          >
            {resetting ? 'Resetando...' : 'Encerrar / Novo Chat'}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex max-w-lg flex-col gap-2">
          {messages.length === 0 && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-900 shadow-xs">
              <p className="font-semibold text-blue-950 mb-1">👋 Olá! Seja bem-vindo à Vibe Telecom.</p>
              <p className="text-xs text-blue-800 leading-relaxed">
                Em que posso te ajudar hoje? Para consultar sua conexão, sinal óptico ou plano, você pode me informar seu nome, login PPPoE ou CPF diretamente na conversa.
              </p>
            </div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                m.role === 'CUSTOMER'
                  ? 'self-end bg-slate-900 text-white'
                  : m.role === 'AGENT' || m.role === 'HUMAN'
                    ? 'self-start bg-white text-slate-800 shadow-sm'
                    : 'self-center bg-amber-50 text-amber-800'
              }`}
            >
              {m.role === 'HUMAN' && <div className="mb-0.5 text-[10px] uppercase tracking-wide text-blue-600">Atendente</div>}
              {m.content}
            </div>
          ))}
          {conversationStatus === 'HUMAN_ACTIVE' && (
            <div className="self-center rounded bg-blue-50 px-3 py-2 text-xs text-blue-700">
              Um atendente humano assumiu esta conversa.
            </div>
          )}
          {sending && (
            <div className="self-start rounded-lg bg-white px-3.5 py-2.5 text-sm text-slate-500 shadow-xs flex items-center gap-2 border border-slate-100">
              <span className="flex gap-1 items-center">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce"></span>
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce [animation-delay:0.2s]"></span>
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce [animation-delay:0.4s]"></span>
              </span>
              <span className="text-xs text-slate-500 font-medium">Vibe Telecom digitando...</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-slate-200 bg-white p-3">
        {error && <p className="mx-auto mb-2 max-w-lg rounded bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        <div className="mx-auto flex max-w-lg gap-2">
          <input
            id="chat-message-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Digite sua mensagem..."
            className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            id="chat-send-button"
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
