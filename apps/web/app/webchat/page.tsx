'use client';

import { useEffect, useRef, useState } from 'react';
import { API_URL, ApiError, apiFetch, getAccessToken } from '@/lib/api';

interface Message {
  id: string;
  role: 'CUSTOMER' | 'AGENT' | 'HUMAN' | 'SYSTEM';
  content: string;
  createdAt: string;
}

interface PulseHit {
  id: string;
  name: string;
  city: string | null;
  status: string;
  healthBand: string | null;
  contract: { plan: { name: string } | null } | null;
}

interface WebchatConfig {
  phoneIdentifies: boolean;
  sessionTokenRequired: boolean;
  demoEndpoints: boolean;
}

// Tenant e nome exibido são de build (NEXT_PUBLIC_*): o mesmo widget serve qualquer provedor.
const TENANT_ID = process.env.NEXT_PUBLIC_WEBCHAT_TENANT_ID || 'tnt_vibe';
const BRAND = process.env.NEXT_PUBLIC_WEBCHAT_BRAND || 'Vibe Telecom';
const RESERVED_PREFIX = 'pulse:';

/** Id de sessão aleatório e não adivinhável (16-64 chars [A-Za-z0-9_-], o formato que a API exige). */
function newSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return 'webchat_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const tokenKey = (tenant: string, session: string) => `ispagent_webchat_token:${tenant}:${session}`;

function readToken(tenant: string, session: string): string | null {
  try {
    return window.sessionStorage.getItem(tokenKey(tenant, session));
  } catch {
    return null;
  }
}

function storeToken(tenant: string, session: string, token: string) {
  try {
    window.sessionStorage.setItem(tokenKey(tenant, session), token);
  } catch {
    /* sessionStorage indisponível: a sessão só não sobrevive a recarregar a página */
  }
}

/**
 * Cabeçalhos das chamadas do chat: o token de sessão (produção) e, para o canal reservado `pulse:` do
 * simulador, o login do administrador — a API só aceita esse canal com JWT de admin do tenant.
 */
function chatHeaders(tenant: string, session: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = readToken(tenant, session);
  if (token) headers['X-Webchat-Token'] = token;
  const staff = getAccessToken();
  if (session.startsWith(RESERVED_PREFIX) && staff) headers.Authorization = `Bearer ${staff}`;
  return headers;
}

async function errorText(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  const message = body && (Array.isArray(body.message) ? body.message.join('; ') : body.message);
  return (typeof message === 'string' ? message : null) ?? `Erro HTTP ${res.status}`;
}

export default function WebChatPage() {
  const [config, setConfig] = useState<WebchatConfig | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [tenantId, setTenantId] = useState(TENANT_ID);
  const [session, setSession] = useState('');
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationStatus, setConversationStatus] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStaff, setIsStaff] = useState(false);
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<PulseHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  useEffect(() => {
    setIsStaff(Boolean(getAccessToken()));
    fetch(`${API_URL}/public/webchat/config`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((cfg: WebchatConfig) => setConfig(cfg))
      .catch(() => setUnavailable(true));

    // Vindo do simulador do painel: /webchat?tenant=<id>&as=pulse:<id> já abre a conversa daquele cliente
    // (a API só aceita esse canal com login de administrador do MESMO tenant).
    const params = new URLSearchParams(window.location.search);
    const as = params.get('as');
    if (as && as.startsWith(RESERVED_PREFIX)) {
      const tenant = params.get('tenant') || TENANT_ID;
      setTenantId(tenant);
      setSession(as);
      void loadHistory(as, tenant);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadHistory(id: string, tenant: string = tenantId) {
    setError(null);
    const res = await fetch(`${API_URL}/public/webchat/${tenant}/conversation/${encodeURIComponent(id)}`, {
      headers: chatHeaders(tenant, id),
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
      const result = await apiFetch<{ items: PulseHit[] }>(`/pulseisp/customers?search=${encodeURIComponent(search)}`);
      setHits(result.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao buscar clientes.');
    } finally {
      setSearching(false);
    }
  }

  async function chatAs(customerId: string) {
    setError(null);
    try {
      const r = await apiFetch<{ channelUserId: string }>('/pulseisp/simulate', {
        method: 'POST',
        body: JSON.stringify({ customerId }),
      });
      // O simulador só conversa com o tenant do próprio administrador logado.
      const me = await apiFetch<{ tenantId: string }>('/auth/me');
      setTenantId(me.tenantId);
      setSession(r.channelUserId);
      await loadHistory(r.channelUserId, me.tenantId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao simular o cliente.');
    }
  }

  function startNewSession() {
    setMessages([]);
    setConversationStatus(null);
    setInput('');
    setError(null);
    setSession('');
    setStarted(false);
  }

  async function resetConversation() {
    if (resetting) return;
    // Em produção não existe "apagar histórico" público: só encerra e abre uma sessão nova. O DELETE
    // (DEMO ou staff) apaga de verdade, então só é usado quando a API o oferece.
    const canDelete = config?.demoEndpoints || (session.startsWith(RESERVED_PREFIX) && isStaff);
    if (!canDelete) return startNewSession();

    if (!window.confirm('Apagar o histórico desta conversa e voltar pra identificação?')) return;
    setResetting(true);
    try {
      const res = await fetch(`${API_URL}/public/webchat/${tenantId}/conversation/${encodeURIComponent(session)}`, {
        method: 'DELETE',
        headers: chatHeaders(tenantId, session),
      });
      // Só volta pra tela inicial se o backend confirmou o reset — nunca fingir sucesso (um 429, por
      // exemplo, não pode passar a impressão de que a conversa foi limpa quando não foi).
      if (!res.ok) {
        window.alert(`Não consegui resetar agora (HTTP ${res.status}). Tenta de novo em alguns segundos.`);
        return;
      }
      startNewSession();
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
    setMessages((prev) => [
      ...prev,
      { id: 'temp_' + Date.now(), role: 'CUSTOMER', content: text, createdAt: new Date().toISOString() },
    ]);

    try {
      const res = await fetch(`${API_URL}/public/webchat/${tenantId}/message`, {
        method: 'POST',
        headers: chatHeaders(tenantId, session),
        body: JSON.stringify({ channelUserId: session, message: text }),
      });
      if (!res.ok) {
        setError(await errorText(res));
        setInput(text);
        setMessages((prev) => prev.filter((m) => !m.id.startsWith('temp_')));
        return;
      }
      setError(null);
      const data = await res.json();
      if (data.sessionToken) storeToken(tenantId, session, data.sessionToken);
      setMessages(data.messages);
      if (data.status) setConversationStatus(data.status);
    } finally {
      setSending(false);
    }
  }

  function startDirectChat() {
    setError(null);
    const id = newSessionId();
    setSession(id);
    setMessages([]);
    setStarted(true);
  }

  if (unavailable) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">{BRAND}</h1>
          <p className="mt-2 text-sm text-slate-600">O atendimento virtual não está disponível no momento.</p>
        </div>
      </main>
    );
  }

  if (!started) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 font-bold text-white shadow-sm">
              {BRAND.charAt(0)}
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">{BRAND}</h1>
              <p className="text-xs text-slate-500">Atendimento Inteligente</p>
            </div>
          </div>

          <p className="mb-5 text-sm leading-relaxed text-slate-600">
            Olá! Tire dúvidas sobre sua conexão, planos ou faturas diretamente com nossa assistente virtual.
          </p>

          <button
            onClick={startDirectChat}
            disabled={!config}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow transition hover:bg-blue-700 active:scale-[0.99] disabled:opacity-50"
          >
            <span>💬 Iniciar Atendimento</span>
          </button>

          {error && <p className="mt-3 rounded bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

          {isStaff && (
            <details className="mt-5 border-t border-slate-100 pt-3 text-xs text-slate-500">
              <summary className="cursor-pointer font-medium hover:text-slate-800">
                🔍 Simular cliente específico do PulseISP (administrador)
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
          )}

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
          <h1 className="text-sm font-bold text-slate-900">{BRAND} — Atendimento Virtual</h1>
          <p className="text-xs text-slate-400">
            {session.startsWith('webchat_') ? 'Sessão Web Chat' : session}
            {conversationStatus ? ` · ${conversationStatus}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {session.startsWith(RESERVED_PREFIX) ? (
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">DADOS REAIS (PulseISP)</span>
          ) : (
            <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">ONLINE</span>
          )}
          <button
            onClick={resetConversation}
            disabled={resetting}
            className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
          >
            {resetting ? 'Resetando...' : 'Encerrar / Novo Chat'}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex max-w-lg flex-col gap-2">
          {messages.length === 0 && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-900 shadow-xs">
              <p className="mb-1 font-semibold text-blue-950">👋 Olá! Seja bem-vindo à {BRAND}.</p>
              <p className="text-xs leading-relaxed text-blue-800">
                Em que posso te ajudar hoje? Para consultar sua fatura, plano ou conexão, vou pedir o CPF ou CNPJ do titular
                da assinatura durante a conversa.
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
            <div className="flex items-center gap-2 self-start rounded-lg border border-slate-100 bg-white px-3.5 py-2.5 text-sm text-slate-500 shadow-xs">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500"></span>
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500 [animation-delay:0.2s]"></span>
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500 [animation-delay:0.4s]"></span>
              </span>
              <span className="text-xs font-medium text-slate-500">{BRAND} digitando...</span>
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
            maxLength={2000}
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
