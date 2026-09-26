'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { API_URL, ApiError, apiFetch, getAccessToken } from '@/lib/api';

function PixQrCode({ code }: { code: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(code, { width: 180, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        /* código inválido para QR: o copia e cola continua disponível */
      });
    return () => {
      active = false;
    };
  }, [code]);

  if (!dataUrl) {
    return (
      <div className="flex h-32 w-32 items-center justify-center rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-500 animate-pulse">
        Gerando QR...
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white p-2 shadow-md shrink-0 flex items-center justify-center">
      <img src={dataUrl} alt="QR Code PIX para pagamento" className="h-28 w-28 md:h-32 md:w-32 object-contain" />
    </div>
  );
}

interface Message {
  id: string;
  role: 'CUSTOMER' | 'AGENT' | 'HUMAN' | 'SYSTEM';
  content: string;
  createdAt: string;
}

interface SgpContract {
  id: string;
  planName: string;
  status: string;
  address?: string;
}

interface SgpCustomerInfo {
  id: string;
  name: string;
  document: string;
  phones: string[];
  contracts: SgpContract[];
}

interface WebchatConfig {
  phoneIdentifies: boolean;
  sessionTokenRequired: boolean;
  demoEndpoints: boolean;
}

// Tenant e nome exibido são de build (NEXT_PUBLIC_*): o mesmo widget serve qualquer provedor.
const TENANT_ID = process.env.NEXT_PUBLIC_WEBCHAT_TENANT_ID || 'tnt_vibe';
const BRAND = process.env.NEXT_PUBLIC_WEBCHAT_BRAND || 'Atendimento Virtual';
/** Canais do simulador do painel (cliente real escolhido por um admin): exigem o login de admin. */
const RESERVED_PREFIXES = ['pulse:', 'sgp:'];
const isReserved = (id: string) => RESERVED_PREFIXES.some((p) => id.startsWith(p));
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
const MAX_RECORDING_MS = 60_000;

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
 * Cabeçalhos das chamadas do chat: o token de sessão (produção) e, para os canais reservados do
 * simulador, o login do administrador — a API só aceita esses canais com JWT de admin do tenant.
 */
function chatHeaders(tenant: string, session: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = readToken(tenant, session);
  if (token) headers['X-Webchat-Token'] = token;
  const staff = getAccessToken();
  if (isReserved(session) && staff) headers.Authorization = `Bearer ${staff}`;
  return headers;
}

async function errorText(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  const message = body && (Array.isArray(body.message) ? body.message.join('; ') : body.message);
  return (typeof message === 'string' ? message : null) ?? `Erro HTTP ${res.status}`;
}

function readFileAsBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Quick action prompts
const QUICK_ACTIONS = [
  { label: '⚡ Desbloqueio em Confiança', prompt: 'Já paguei minha fatura e solicito o desbloqueio em confiança' },
  { label: '📶 Diagnóstico da Conexão', prompt: 'Pode verificar o sinal da minha fibra e o status da conexão?' },
  { label: '📄 2ª Via de Fatura', prompt: 'Gostaria da segunda via da minha fatura' },
  { label: '💸 Gerar PIX', prompt: 'Preciso do código PIX da minha fatura para pagar agora' },
  { label: '🚀 Detalhes do Plano', prompt: 'Qual é o meu plano de internet contratado?' },
];

const SURVEY_TAGS = ['Rápido e Preciso', 'Resolveu meu problema', 'Atendimento Humanizado', 'Fácil de Usar', 'Precisa Melhorar'];

export default function WebChatPage() {
  const [config, setConfig] = useState<WebchatConfig | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [tenantId, setTenantId] = useState(TENANT_ID);
  const [session, setSession] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isStaff, setIsStaff] = useState(false);
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationStatus, setConversationStatus] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Simulador SGP (só staff logado)
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [foundCustomer, setFoundCustomer] = useState<SgpCustomerInfo | null>(null);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);

  // Aviso proativo de incidente
  const [incidentAlert, setIncidentAlert] = useState<{ hasIncident: boolean; title?: string; message?: string } | null>(null);

  // Pesquisa de satisfação (CSAT)
  const [showSurvey, setShowSurvey] = useState(false);
  const [rating, setRating] = useState<number>(5);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [surveySubmitted, setSurveySubmitted] = useState(false);
  const [submittingSurvey, setSubmittingSurvey] = useState(false);

  // Comprovante e áudio
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [sendingVoice, setSendingVoice] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  // Tempo real: mensagens novas desta conversa (ex.: resposta do atendente humano) chegam sem recarregar,
  // e o encerramento por inatividade abre a avaliação. O token de sessão vai na query (EventSource não
  // envia header); é o HMAC da própria conversa, não uma credencial de staff.
  useEffect(() => {
    if (!started || !session || !conversationId) return;
    const token = readToken(tenantId, session);
    const qs = token ? `?token=${encodeURIComponent(token)}` : '';
    const es = new EventSource(`${API_URL}/public/webchat/${tenantId}/conversation/${encodeURIComponent(session)}/stream${qs}`);
    es.onmessage = (event) => {
      let parsed: { type?: string; payload?: { message?: Message; status?: string } } | null = null;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }
      if (parsed?.type === 'STATUS_CHANGED' && parsed.payload?.status) {
        setConversationStatus(parsed.payload.status);
        if (parsed.payload.status === 'CLOSED') setShowSurvey((open) => open || !surveySubmitted);
        return;
      }
      const incoming = parsed?.payload?.message;
      if (!incoming?.id) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === incoming.id)) return prev;
        // A mensagem que o próprio cliente acabou de enviar volta pelo stream: substitui a temporária.
        const tempIdx = prev.findIndex((m) => m.id.startsWith('temp_') && m.role === incoming.role && m.content === incoming.content);
        if (tempIdx >= 0) return prev.map((m, i) => (i === tempIdx ? incoming : m));
        return [...prev, incoming];
      });
      if (incoming.role === 'HUMAN') setConversationStatus('HUMAN_ACTIVE');
    };
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, session, tenantId, conversationId]);

  useEffect(() => {
    setIsStaff(Boolean(getAccessToken()));
    fetch(`${API_URL}/public/webchat/config`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((cfg: WebchatConfig) => setConfig(cfg))
      .catch(() => setUnavailable(true));

    // Vindo do simulador do painel: /webchat?as=sgp:<id> (ou pulse:<id>) abre a conversa daquele cliente.
    // Só canais reservados, e a API só os aceita com login de administrador do MESMO tenant.
    const params = new URLSearchParams(window.location.search);
    // widget.js informa o provedor do site onde está embutido (o Web Chat público é por tenant).
    const tenantParam = params.get('tenant');
    if (tenantParam && /^[\w-]{1,64}$/.test(tenantParam)) setTenantId(tenantParam);
    const as = params.get('as');
    if (as && isReserved(as) && getAccessToken()) {
      apiFetch<{ tenantId: string }>('/auth/me')
        .then((me) => {
          setTenantId(me.tenantId);
          setSession(as);
          return loadHistory(as, me.tenantId);
        })
        .catch(() => setError('Faça login no painel como administrador para usar o simulador.'));
    }
    return () => {
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
      if (recordTimerRef.current) clearTimeout(recordTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Aplica a resposta de qualquer rota do chat: mensagens, status e (em produção) token da sessão. */
  function applyChatResponse(
    data: { messages?: Message[]; status?: string; sessionToken?: string; conversationId?: string | null },
    tenant = tenantId,
    id = session,
  ) {
    if (data.sessionToken) storeToken(tenant, id, data.sessionToken);
    if (data.conversationId) setConversationId(data.conversationId);
    if (data.messages) setMessages(data.messages);
    if (data.status) setConversationStatus(data.status);
  }

  async function loadHistory(id: string, tenant: string = tenantId) {
    setError(null);
    try {
      const res = await fetch(`${API_URL}/public/webchat/${tenant}/conversation/${encodeURIComponent(id)}`, {
        headers: chatHeaders(tenant, id),
      });
      if (!res.ok) {
        setError(await errorText(res));
        return;
      }
      const data = await res.json();
      setMessages(data.messages || []);
      setConversationStatus(data.status);
      setConversationId(data.conversationId ?? null);
      setStarted(true);
      void checkIncident(id, tenant);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao conectar com o servidor.');
    }
  }

  async function checkIncident(id: string = session, tenant: string = tenantId) {
    try {
      const res = await fetch(`${API_URL}/public/webchat/${tenant}/incident-check/${encodeURIComponent(id)}`, {
        headers: chatHeaders(tenant, id),
      });
      if (res.ok) {
        const data = await res.json();
        setIncidentAlert(data.hasIncident ? data : null);
      }
    } catch {
      /* aviso é opcional */
    }
  }

  async function submitSatisfactionSurvey() {
    if (submittingSurvey) return;
    setSubmittingSurvey(true);
    try {
      const tags = selectedTags.length ? `[${selectedTags.join(', ')}] ` : '';
      const res = await fetch(`${API_URL}/public/webchat/${tenantId}/survey`, {
        method: 'POST',
        headers: chatHeaders(tenantId, session),
        body: JSON.stringify({
          channelUserId: session,
          rating,
          comment: `${tags}${comment.trim()}`.trim().slice(0, 1000) || undefined,
        }),
      });
      if (!res.ok) {
        setError(await errorText(res));
        return;
      }
      setSurveySubmitted(true);
      setConversationStatus('CLOSED');
    } finally {
      setSubmittingSurvey(false);
    }
  }

  async function searchSgpCustomer() {
    const q = searchQuery.trim();
    if (q.length < 2 || searching) return;
    setSearching(true);
    setSearchMessage(null);
    setFoundCustomer(null);
    try {
      const data = await apiFetch<{ found: boolean; customer?: SgpCustomerInfo }>(`/sgp/customer?query=${encodeURIComponent(q)}`);
      if (!data.found || !data.customer) setSearchMessage('Nenhum cliente localizado no SGP com estes dados.');
      else setFoundCustomer(data.customer);
    } catch (err) {
      setSearchMessage(err instanceof ApiError ? err.message : 'Não foi possível conectar à API do SGP.');
    } finally {
      setSearching(false);
    }
  }

  async function startChatAsCustomer(c: SgpCustomerInfo) {
    setError(null);
    try {
      const r = await apiFetch<{ channelUserId: string }>('/sgp/simulate', {
        method: 'POST',
        body: JSON.stringify({ customerId: c.id }),
      });
      // O simulador só conversa com o tenant do próprio administrador logado.
      const me = await apiFetch<{ tenantId: string }>('/auth/me');
      setTenantId(me.tenantId);
      setSession(r.channelUserId);
      await loadHistory(r.channelUserId, me.tenantId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao iniciar o simulador.');
    }
  }

  function startDirectChat() {
    setError(null);
    setSession(newSessionId());
    setMessages([]);
    setConversationStatus(null);
    setStarted(true);
  }

  function startNewSession() {
    setConversationId(null);
    setMessages([]);
    setConversationStatus(null);
    setInput('');
    setError(null);
    setSession('');
    setStarted(false);
    setFoundCustomer(null);
    setIncidentAlert(null);
    setSurveySubmitted(false);
    setShowSurvey(false);
  }

  async function resetConversation() {
    if (resetting) return;
    // Em produção não existe "apagar histórico" público: só encerra e abre uma sessão nova. O DELETE
    // (DEMO ou staff) apaga de verdade, então só é usado quando a API o oferece.
    const canDelete = config?.demoEndpoints || (isReserved(session) && isStaff);
    if (!canDelete) return startNewSession();

    if (!window.confirm('Deseja realmente limpar o histórico desta conversa?')) return;
    setResetting(true);
    try {
      const res = await fetch(`${API_URL}/public/webchat/${tenantId}/conversation/${encodeURIComponent(session)}`, {
        method: 'DELETE',
        headers: chatHeaders(tenantId, session),
      });
      // Só volta pra tela inicial se o backend confirmou — nunca fingir sucesso (um 429 não pode parecer limpeza).
      if (!res.ok) {
        window.alert(`Não foi possível reiniciar agora (HTTP ${res.status}). Tente em alguns segundos.`);
        return;
      }
      startNewSession();
    } finally {
      setResetting(false);
    }
  }

  async function send(textToSend?: string) {
    const text = (textToSend ?? input).trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
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
      applyChatResponse(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro de conexão.');
      setMessages((prev) => prev.filter((m) => !m.id.startsWith('temp_')));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(text);
      setTimeout(() => setCopiedText(null), 2000);
    } catch {
      setError('Não foi possível copiar automaticamente — selecione o código e copie manualmente.');
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('Arquivo muito grande (máximo 6 MB).');
      return;
    }
    setUploadingReceipt(true);
    setError(null);
    try {
      const fileBase64 = await readFileAsBase64(file);
      const res = await fetch(`${API_URL}/public/webchat/${tenantId}/upload-receipt`, {
        method: 'POST',
        headers: chatHeaders(tenantId, session),
        body: JSON.stringify({ channelUserId: session, fileBase64, mimeType: file.type || 'image/jpeg' }),
      });
      if (!res.ok) {
        setError(await errorText(res));
        return;
      }
      applyChatResponse(await res.json());
    } catch {
      setError('Falha ao processar o arquivo.');
    } finally {
      setUploadingReceipt(false);
    }
  }

  async function sendVoice(blob: Blob) {
    setSendingVoice(true);
    try {
      const audioBase64 = await readFileAsBase64(blob);
      const res = await fetch(`${API_URL}/public/webchat/${tenantId}/voice`, {
        method: 'POST',
        headers: chatHeaders(tenantId, session),
        body: JSON.stringify({ channelUserId: session, audioBase64, mimeType: blob.type || 'audio/webm' }),
      });
      if (!res.ok) {
        setError(await errorText(res));
        return;
      }
      applyChatResponse(await res.json());
    } catch {
      setError('Falha ao enviar o áudio.');
    } finally {
      setSendingVoice(false);
    }
  }

  /** 1º toque grava (até 60 s), 2º toque para e envia. */
  async function toggleVoiceRecording() {
    if (recordingVoice) {
      recorderRef.current?.stop();
      return;
    }
    if (sending || sendingVoice) return;
    setError(null);
    // Fora de HTTPS (ou localhost) o navegador nem expõe o microfone: não é questão de permissão.
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError('O áudio só funciona com conexão segura (https). Digite a sua mensagem por enquanto.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (ev) => ev.data.size > 0 && chunks.push(ev.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recordTimerRef.current) clearTimeout(recordTimerRef.current);
        setRecordingVoice(false);
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size > 0) void sendVoice(blob);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecordingVoice(true);
      recordTimerRef.current = setTimeout(() => recorder.state === 'recording' && recorder.stop(), MAX_RECORDING_MS);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      setError(
        name === 'NotFoundError'
          ? 'Não encontrei nenhum microfone neste aparelho.'
          : name === 'NotAllowedError'
            ? 'O acesso ao microfone foi bloqueado. Libere o microfone para este site no cadeado da barra de endereço.'
            : 'Não consegui acessar o microfone. Verifique a permissão do navegador.',
      );
    }
  }

  if (unavailable) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-slate-100">
        <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900/90 p-6 text-center shadow-2xl">
          <h1 className="text-lg font-bold text-white">{BRAND}</h1>
          <p className="mt-2 text-sm text-slate-400">O atendimento virtual não está disponível no momento.</p>
        </div>
      </main>
    );
  }

  // Tela de boas-vindas
  if (!started) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4 font-sans text-slate-100">
        <div className="fixed inset-0 -z-10 flex items-center justify-center overflow-hidden">
          <div className="h-96 w-96 rounded-full bg-cyan-600/20 blur-[120px]" />
          <div className="h-96 w-96 rounded-full bg-blue-600/20 blur-[140px]" />
        </div>

        <div className="w-full max-w-md rounded-2xl border border-slate-800/80 bg-slate-900/90 p-7 shadow-2xl backdrop-blur-xl">
          <div className="mb-6 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 font-extrabold text-white shadow-lg shadow-cyan-500/20 text-xl">
              {BRAND.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">{BRAND}</h1>
              <p className="text-xs text-slate-400">Atendimento Virtual Inteligente 24/7</p>
            </div>
          </div>

          <p className="mb-6 text-sm text-slate-300 leading-relaxed">
            Bem-vindo ao autoatendimento da {BRAND}. Consulte faturas, emita código PIX, verifique a sua conexão e fale
            com a nossa equipe quando precisar.
          </p>

          <button
            onClick={startDirectChat}
            disabled={!config}
            className="group flex w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-3.5 px-4 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 transition-all duration-200 hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
          >
            <span>💬 Iniciar Atendimento</span>
          </button>

          {error && (
            <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400">{error}</div>
          )}

          {/* Simulador: só para a equipe logada (dados reais de cliente nunca ficam na tela pública). */}
          {isStaff && (
            <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-cyan-400">🔍 Simular Cliente Real do SGP</span>
                <span className="text-[10px] text-slate-500">Somente equipe</span>
              </div>
              <p className="text-[11px] text-slate-400 mb-3">CPF/CNPJ, telefone ou código de contrato do cliente:</p>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchSgpCustomer()}
                  placeholder="Ex.: CPF ou Telefone com DDD"
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
                />
                <button
                  onClick={searchSgpCustomer}
                  disabled={searching || searchQuery.trim().length < 2}
                  className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-40 transition"
                >
                  {searching ? '...' : 'Buscar'}
                </button>
              </div>

              {searchMessage && <p className="mt-2 text-xs text-amber-400/90">{searchMessage}</p>}

              {foundCustomer && (
                <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-300">{foundCustomer.name}</span>
                    <span className="text-[10px] text-slate-400">CPF: {foundCustomer.document}</span>
                  </div>
                  {foundCustomer.contracts?.length > 0 && (
                    <div className="mt-1.5 text-[11px] text-slate-300">
                      <p>
                        Contrato: #{foundCustomer.contracts[0].id} — {foundCustomer.contracts[0].planName}
                      </p>
                      <span className="inline-block mt-1 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300">
                        Status: {foundCustomer.contracts[0].status}
                      </span>
                    </div>
                  )}
                  <button
                    onClick={() => startChatAsCustomer(foundCustomer)}
                    className="mt-3 w-full rounded bg-emerald-600 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition"
                  >
                    Entrar no Chat como este Cliente →
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between border-t border-slate-800/80 pt-4 text-xs text-slate-500">
            <span>ISPAgent</span>
            <a href="/login" className="text-slate-400 hover:text-cyan-400 transition">
              Painel da Equipe →
            </a>
          </div>
        </div>
      </main>
    );
  }

  const busy = sending || uploadingReceipt || sendingVoice;

  // Tela principal do chat
  return (
    <main className="flex h-screen flex-col bg-slate-950 font-sans text-slate-100">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800/80 bg-slate-900/80 px-4 md:px-6 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 font-bold text-white shadow-md shadow-cyan-500/20 text-sm">
            {BRAND.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white">{BRAND}</h1>
            <p className="text-[11px] text-slate-400">
              {isReserved(session) ? `Simulador — ${session}` : 'Assistente Virtual Inteligente'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {conversationStatus === 'HUMAN_ACTIVE' && (
            <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 text-xs font-medium text-amber-400">
              👤 Atendente Humano na Linha
            </span>
          )}
          {conversationStatus === 'HANDOFF_PENDING' && (
            <span className="rounded-full bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 text-xs font-medium text-blue-400 animate-pulse">
              ⏳ Aguardando Atendente
            </span>
          )}
          {messages.length > 0 && conversationStatus !== 'CLOSED' && (
            <button
              onClick={() => setShowSurvey(true)}
              className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-950/40 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-900/60 transition"
            >
              ⭐ <span>Encerrar / Avaliar</span>
            </button>
          )}
          <button
            onClick={resetConversation}
            disabled={resetting}
            title="Nova conversa"
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 hover:text-white transition disabled:opacity-50"
          >
            🔄 <span>Nova conversa</span>
          </button>
        </div>
      </header>

      {incidentAlert && (
        <div className="mx-4 mt-3 rounded-xl border border-amber-500/40 bg-amber-950/50 p-3.5 backdrop-blur-md text-amber-200 text-xs shadow-lg flex items-start gap-3">
          <span className="text-xl shrink-0">⚠️</span>
          <div className="flex-1">
            <strong className="block font-semibold text-amber-300">{incidentAlert.title || 'Instabilidade Detectada'}</strong>
            <p className="mt-0.5 text-amber-200/90 leading-relaxed">{incidentAlert.message}</p>
          </div>
          <button onClick={() => setIncidentAlert(null)} className="text-amber-400 hover:text-white text-sm px-1.5 py-0.5">
            ✕
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {messages.length === 0 && (
          <div className="mx-auto my-8 max-w-md text-center text-slate-400">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 border border-slate-800 text-2xl">
              👋
            </div>
            <h2 className="text-base font-semibold text-white">Olá! Como posso ajudar você hoje?</h2>
            <p className="mt-1 text-xs text-slate-400">
              Digite o que precisa (e o CPF/CNPJ do titular quando eu pedir) ou escolha uma ação rápida:
            </p>

            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2 text-left">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  onClick={() => send(action.prompt)}
                  className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-300 hover:border-cyan-500/50 hover:bg-slate-900 hover:text-white transition"
                >
                  <span className="block font-medium">{action.label}</span>
                  <span className="block text-[11px] text-slate-500 truncate">{action.prompt}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => {
          const isCustomer = m.role === 'CUSTOMER';
          if (m.role === 'SYSTEM') {
            return (
              <div key={m.id} className="my-2 flex justify-center">
                <span className="rounded-full bg-slate-900 px-3 py-1 text-[11px] text-slate-400 border border-slate-800">
                  ℹ️ {m.content}
                </span>
              </div>
            );
          }

          // PIX copia e cola e link do boleto: só nas falas do atendimento (nunca no texto do cliente).
          const pixMatch = isCustomer ? null : m.content.match(/000201[0-9a-zA-Z$+/=._-]{20,}/);
          const pixCode = pixMatch ? pixMatch[0] : null;
          const rawPdfMatch = isCustomer ? null : m.content.match(/https:\/\/[^\s*`)]+(?:boleto|\.pdf)[^\s*`)]*/i);
          const pdfUrl = rawPdfMatch ? rawPdfMatch[0].replace(/[.,;)]+$/, '') : null;

          return (
            <div key={m.id} className={`flex flex-col ${isCustomer ? 'items-end' : 'items-start'}`}>
              <div
                className={`max-w-[90%] md:max-w-xl rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                  isCustomer
                    ? 'rounded-br-sm bg-gradient-to-r from-cyan-600 to-blue-600 text-white'
                    : 'rounded-bl-sm bg-slate-900 border border-slate-800 text-slate-200'
                }`}
              >
                {m.role === 'HUMAN' && <span className="mb-1 block text-[10px] font-semibold text-amber-400">Atendente</span>}
                <div className="whitespace-pre-wrap">{m.content}</div>

                {pixCode && (
                  <div className="mt-3.5 rounded-xl border border-cyan-500/30 bg-slate-950/80 p-3 shadow-lg">
                    <div className="mb-2 pb-1.5 border-b border-slate-800">
                      <span className="text-[11px] font-bold text-cyan-400 flex items-center gap-1.5">
                        <span>📱</span> Pague com QR Code ou PIX Copia e Cola
                      </span>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3">
                      <PixQrCode code={pixCode} />
                      <div className="flex-1 w-full space-y-2">
                        <p className="text-[11px] text-slate-300 leading-snug">
                          Abra o app do seu banco, escolha <strong>PIX</strong> e aponte a câmera para o QR Code ao lado.
                        </p>
                        <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-2">
                          <span className="block text-[10px] text-slate-400 font-semibold mb-1">Ou copie o código Copia e Cola:</span>
                          <div className="flex items-center gap-2">
                            <input
                              readOnly
                              value={pixCode}
                              className="flex-1 bg-slate-950 border border-slate-700/60 rounded px-2 py-1 text-[10px] text-slate-300 font-mono truncate select-all"
                            />
                            <button
                              onClick={() => copyToClipboard(pixCode)}
                              className="shrink-0 rounded bg-cyan-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-cyan-500 active:scale-95 transition shadow"
                            >
                              {copiedText === pixCode ? '✓ Copiado!' : 'Copiar'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {pdfUrl && (
                  <div className="mt-3">
                    <a
                      href={pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-emerald-950/40 hover:from-emerald-500 hover:to-teal-500 active:scale-95 transition"
                    >
                      <span className="text-base">📄</span>
                      <span>Visualizar / Baixar Boleto em PDF</span>
                      <span className="text-xs opacity-75">↗</span>
                    </a>
                  </div>
                )}
              </div>
              <span className="mt-1 px-1 text-[10px] text-slate-500">
                {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          );
        })}

        {(sending || sendingVoice || uploadingReceipt) && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 border border-slate-800">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
            </div>
            <span>
              {uploadingReceipt ? 'Analisando o comprovante...' : sendingVoice ? 'Ouvindo o seu áudio...' : `${BRAND} está digitando...`}
            </span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <footer className="border-t border-slate-800/80 bg-slate-900/90 p-4 backdrop-blur-md">
        {conversationStatus === 'CLOSED' ? (
          <div className="flex flex-col items-center gap-2 text-xs text-slate-400">
            <span>Atendimento encerrado. Obrigado!</span>
            <button onClick={startNewSession} className="rounded-lg bg-slate-800 px-3 py-1.5 text-slate-200 hover:bg-slate-700">
              Iniciar nova conversa
            </button>
          </div>
        ) : (
          <>
            {messages.length > 0 && (
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1 text-xs no-scrollbar">
                {QUICK_ACTIONS.slice(0, 3).map((act) => (
                  <button
                    key={act.label}
                    onClick={() => send(act.prompt)}
                    disabled={busy}
                    className="shrink-0 rounded-full border border-slate-800 bg-slate-950 px-3 py-1 text-slate-300 hover:border-cyan-500/40 hover:text-white transition"
                  >
                    {act.label}
                  </button>
                ))}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy || recordingVoice}
                title="Enviar comprovante de pagamento (imagem ou PDF)"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-base text-slate-300 hover:border-cyan-500/50 hover:bg-slate-800 hover:text-white transition disabled:opacity-40"
              >
                {uploadingReceipt ? '⏳' : '📎'}
              </button>

              <button
                type="button"
                onClick={toggleVoiceRecording}
                disabled={busy}
                title={recordingVoice ? 'Parar e enviar o áudio' : 'Gravar mensagem de voz'}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-base transition disabled:opacity-40 ${
                  recordingVoice
                    ? 'text-red-400 border-red-500 animate-pulse bg-red-950/40'
                    : 'text-slate-300 hover:border-cyan-500/50 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {recordingVoice ? '⏹️' : '🎙️'}
              </button>

              <input
                ref={inputRef}
                type="text"
                value={input}
                maxLength={2000}
                onChange={(e) => setInput(e.target.value)}
                disabled={busy || recordingVoice}
                placeholder={
                  recordingVoice
                    ? 'Gravando... toque em ⏹️ para enviar'
                    : conversationStatus === 'HUMAN_ACTIVE'
                      ? 'Converse diretamente com o atendente...'
                      : 'Digite sua mensagem...'
                }
                className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!input.trim() || busy || recordingVoice}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 font-bold text-white shadow-md shadow-cyan-500/20 hover:brightness-110 active:scale-95 disabled:opacity-40 transition"
              >
                ➤
              </button>
            </form>
          </>
        )}

        {error && <p className="mt-2 text-center text-xs text-red-400">{error}</p>}
      </footer>

      {showSurvey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700/80 bg-slate-900/95 p-6 shadow-2xl">
            {surveySubmitted ? (
              <div className="text-center py-6">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-3xl text-emerald-400 border border-emerald-500/30">
                  ✓
                </div>
                <h3 className="text-lg font-bold text-white">Obrigado pelo seu feedback!</h3>
                <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                  Sua avaliação foi registrada e ajuda a {BRAND} a melhorar o atendimento.
                </p>
                <button
                  onClick={() => setShowSurvey(false)}
                  className="mt-6 w-full rounded-xl bg-slate-800 py-2.5 text-xs font-semibold text-white hover:bg-slate-700 transition"
                >
                  Fechar
                </button>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 text-lg">⭐</span>
                    <h3 className="text-sm font-bold text-white">Avaliação do Atendimento</h3>
                  </div>
                  <button onClick={() => setShowSurvey(false)} className="text-slate-400 hover:text-white text-sm">
                    ✕
                  </button>
                </div>

                <div className="my-5 text-center">
                  <p className="text-xs text-slate-300 mb-3">Como você avalia a sua experiência hoje?</p>
                  <div className="flex justify-center gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        className={`text-3xl transition-transform hover:scale-125 ${
                          star <= rating ? 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]' : 'text-slate-700'
                        }`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] font-medium text-amber-300">
                    {rating === 5 ? 'Excelente!' : rating === 4 ? 'Muito bom' : rating === 3 ? 'Regular' : rating === 2 ? 'Ruim' : 'Muito insatisfeito'}
                  </p>
                </div>

                <div className="mb-4">
                  <label className="block text-[11px] text-slate-400 mb-2 font-medium">O que você achou?</label>
                  <div className="flex flex-wrap gap-1.5">
                    {SURVEY_TAGS.map((tag) => {
                      const active = selectedTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setSelectedTags((prev) => (active ? prev.filter((t) => t !== tag) : [...prev, tag]))}
                          className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition ${
                            active
                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                              : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mb-5">
                  <label className="block text-[11px] text-slate-400 mb-1 font-medium">Deixe um comentário adicional (opcional):</label>
                  <textarea
                    rows={3}
                    maxLength={900}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Conte como podemos melhorar ou deixe um elogio..."
                    className="w-full rounded-xl border border-slate-700/80 bg-slate-950 p-2.5 text-xs text-white placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSurvey(false)}
                    className="flex-1 rounded-xl border border-slate-700 py-2.5 text-xs font-medium text-slate-300 hover:bg-slate-800 transition"
                  >
                    Agora não
                  </button>
                  <button
                    type="button"
                    onClick={submitSatisfactionSurvey}
                    disabled={submittingSurvey}
                    className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-2.5 text-xs font-bold text-white shadow-lg shadow-amber-950/40 hover:brightness-110 active:scale-95 disabled:opacity-50 transition"
                  >
                    {submittingSurvey ? 'Enviando...' : 'Enviar Avaliação'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
