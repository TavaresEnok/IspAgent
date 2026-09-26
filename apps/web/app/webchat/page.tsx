'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { API_URL } from '@/lib/api';

function PixQrCode({ code }: { code: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(code, { width: 180, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch((err) => console.error('Error generating QR Code:', err));
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

const VIBE_TENANT = 'tnt_vibe';

export default function WebChatPage() {
  const [phone, setPhone] = useState('webchat_user');
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationStatus, setConversationStatus] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // SGP Search / Simulator
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [foundCustomer, setFoundCustomer] = useState<SgpCustomerInfo | null>(null);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);

  // Proactive PON Incident
  const [incidentAlert, setIncidentAlert] = useState<{ hasIncident: boolean; title?: string; message?: string } | null>(null);

  // CSAT Survey
  const [showSurvey, setShowSurvey] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [rating, setRating] = useState<number>(5);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [surveySubmitted, setSurveySubmitted] = useState(false);
  const [submittingSurvey, setSubmittingSurvey] = useState(false);

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(text);
      setTimeout(() => setCopiedText((cur) => (cur === text ? null : cur)), 2000);
    } catch {
      setError('Não foi possível copiar automaticamente. Selecione o código e copie manualmente.');
    }
  }

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  // Cada conversa tem a sua avaliação.
  useEffect(() => {
    setSurveySubmitted(false);
  }, [conversationId]);

  // Tempo real: mensagens novas desta conversa (ex.: resposta do atendente humano) chegam sem recarregar.
  useEffect(() => {
    if (!started || !phone) return;
    const es = new EventSource(
      `${API_URL}/public/webchat/${VIBE_TENANT}/conversation/${encodeURIComponent(phone)}/stream`,
    );
    es.onmessage = (event) => {
      let parsed: { type?: string; payload?: { message?: Message; status?: string } } | null = null;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }
      // Conversa encerrada (ex.: por inatividade): é o momento de pedir a avaliação.
      if (parsed?.type === 'STATUS_CHANGED' && parsed.payload?.status) {
        setConversationStatus(parsed.payload.status);
        if (parsed.payload.status === 'CLOSED' && !surveySubmitted) setShowSurvey(true);
        return;
      }
      const msg = parsed?.payload?.message;
      if (!msg?.id) return;
      const incoming = msg;
      setMessages((prev) => {
        if (prev.some((m) => m.id === incoming.id)) return prev;
        // A mensagem que o próprio cliente acabou de enviar volta pelo stream: substitui a temporária.
        const tempIdx = prev.findIndex(
          (m) => m.id.startsWith('temp_') && m.role === incoming.role && m.content === incoming.content,
        );
        if (tempIdx >= 0) return prev.map((m, i) => (i === tempIdx ? incoming : m));
        return [...prev, incoming];
      });
      if (incoming.role === 'HUMAN') setConversationStatus('HUMAN_ACTIVE');
    };
    return () => es.close();
    // conversationId: depois de um encerramento, a próxima mensagem abre outra conversa e o stream reconecta nela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, phone, conversationId]);

  // URL parameters handler (e.g. ?as=sgp:123 or ?cpf=123)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const as = params.get('as');
    if (as) {
      setPhone(as);
      void loadHistory(as);
    }
  }, []);

  async function loadHistory(p: string = phone) {
    setError(null);
    try {
      const res = await fetch(`${API_URL}/public/webchat/${VIBE_TENANT}/conversation/${encodeURIComponent(p)}`);
      if (!res.ok) {
        setError(`Erro ao carregar conversa (${res.status})`);
        return;
      }
      const data = await res.json();
      setMessages(data.messages || []);
      setConversationStatus(data.status);
      setConversationId(data.conversationId);
      setStarted(true);

      // Checa incidentes proativos na rede
      try {
        const incRes = await fetch(`${API_URL}/public/webchat/${VIBE_TENANT}/incident-check/${encodeURIComponent(p)}`);
        if (incRes.ok) {
          const incData = await incRes.json();
          if (incData.hasIncident) setIncidentAlert(incData);
          else setIncidentAlert(null);
        }
      } catch {
        // silent
      }
    } catch (e: any) {
      setError(e.message || 'Falha ao conectar com o servidor.');
    }
  }

  async function submitSatisfactionSurvey() {
    if (!conversationId || submittingSurvey) return;
    setSubmittingSurvey(true);
    try {
      const res = await fetch(`${API_URL}/public/webchat/${VIBE_TENANT}/survey`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          rating,
          comment: comment.trim() || undefined,
          tags: selectedTags,
        }),
      });
      if (res.ok) {
        setSurveySubmitted(true);
        setConversationStatus('CLOSED');
      }
    } catch {
      // ignore
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
      const res = await fetch(
        `${API_URL}/public/webchat/${VIBE_TENANT}/sgp-customer?query=${encodeURIComponent(q)}`,
      );
      if (!res.ok) {
        setSearchMessage('Erro ao consultar o SGP.');
        return;
      }
      const data = await res.json();
      if (!data.found || !data.customer) {
        setSearchMessage('Nenhum cliente localizado no SGP com estes dados.');
      } else {
        setFoundCustomer(data.customer);
      }
    } catch {
      setSearchMessage('Não foi possível conectar à API do SGP.');
    } finally {
      setSearching(false);
    }
  }

  async function startChatAsCustomer(c: SgpCustomerInfo) {
    setError(null);
    const chosenPhone = c.phones[0] || `sgp:${c.id}`;
    setPhone(chosenPhone);
    setStarted(true);
    await loadHistory(chosenPhone);
  }

  function startDirectChat() {
    setError(null);
    const sessionId = 'vibe_' + Math.random().toString(36).substring(2, 9);
    setPhone(sessionId);
    void loadHistory(sessionId);
  }

  async function resetConversation() {
    if (resetting) return;
    if (!window.confirm('Deseja realmente limpar o histórico desta conversa?')) return;
    setResetting(true);
    try {
      const res = await fetch(
        `${API_URL}/public/webchat/${VIBE_TENANT}/conversation/${encodeURIComponent(phone)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        window.alert(`Não foi possível reiniciar agora (HTTP ${res.status}). Tente em alguns segundos.`);
        return;
      }
      setMessages([]);
      setConversationStatus(null);
      setInput('');
      setStarted(false);
      setFoundCustomer(null);
    } finally {
      setResetting(false);
    }
  }

  async function send(textToSend?: string) {
    const text = (textToSend || input).trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);

    const tempMsg: Message = {
      id: 'temp_' + Date.now(),
      role: 'CUSTOMER',
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      const res = await fetch(`${API_URL}/public/webchat/${VIBE_TENANT}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelUserId: phone, message: text }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setError(err?.message || `Erro HTTP ${res.status}`);
        return;
      }
      setError(null);
      const data = await res.json();
      setMessages(data.messages || []);
      if (data.conversationId) setConversationId(data.conversationId);
      if (data.status) setConversationStatus(data.status);
    } catch (e: any) {
      setError(e.message || 'Erro de conexão.');
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [recordingVoice, setRecordingVoice] = useState(false);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingReceipt(true);
    setError(null);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const res = await fetch(`${API_URL}/public/webchat/${VIBE_TENANT}/upload-receipt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelUserId: phone,
            fileBase64: base64,
            mimeType: file.type || 'image/jpeg',
            filename: file.name,
          }),
        });
        if (!res.ok) {
          setError(`Erro ao enviar comprovante (${res.status})`);
          return;
        }
        const data = await res.json();
        setMessages(data.messages || []);
        if (data.conversationId) setConversationId(data.conversationId);
        if (data.status) setConversationStatus(data.status);
      };
      reader.readAsDataURL(file);
    } catch {
      setError('Falha ao processar arquivo');
    } finally {
      setUploadingReceipt(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleVoiceSimulate() {
    if (recordingVoice || sending) return;
    setRecordingVoice(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/public/webchat/${VIBE_TENANT}/voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelUserId: phone,
          audioBase64: 'bW9ja192b2ljZV9ub3RlX2Zyb21fd2ViY2hhdA==',
          mimeType: 'audio/webm',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        if (data.conversationId) setConversationId(data.conversationId);
        if (data.status) setConversationStatus(data.status);
      }
    } catch {
      setError('Falha ao enviar áudio');
    } finally {
      setRecordingVoice(false);
    }
  }

  // Quick action prompts
  const QUICK_ACTIONS = [
    { label: '⚡ Desbloqueio em Confiança', prompt: 'Já paguei minha fatura e solicito o desbloqueio em confiança' },
    { label: '📶 Diagnóstico Óptico (dBm)', prompt: 'Pode verificar o sinal óptico da minha ONU fibra e o status da conexão?' },
    { label: '📄 2ª Via de Fatura', prompt: 'Gostaria da segunda via da minha fatura' },
    { label: '💸 Gerar PIX', prompt: 'Preciso do código PIX da minha fatura para pagar agora' },
    { label: '🚀 Detalhes do Plano', prompt: 'Qual é o meu plano de internet contratado?' },
  ];

  // Identificação inicial / Tela de boas-vindas
  if (!started) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4 font-sans text-slate-100">
        {/* Glow ambient background */}
        <div className="fixed inset-0 -z-10 flex items-center justify-center overflow-hidden">
          <div className="h-96 w-96 rounded-full bg-cyan-600/20 blur-[120px]" />
          <div className="h-96 w-96 rounded-full bg-blue-600/20 blur-[140px]" />
        </div>

        <div className="w-full max-w-md rounded-2xl border border-slate-800/80 bg-slate-900/90 p-7 shadow-2xl backdrop-blur-xl">
          {/* Header */}
          <div className="mb-6 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 font-extrabold text-white shadow-lg shadow-cyan-500/20 text-xl">
              V
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">Vibe Telecom</h1>
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> SGP Real
                </span>
              </div>
              <p className="text-xs text-slate-400">Atendimento Virtual Inteligente 24/7</p>
            </div>
          </div>

          <p className="mb-6 text-sm text-slate-300 leading-relaxed">
            Bem-vindo ao canal oficial de autoatendimento da Vibe Telecom. Consulte faturas, emita código PIX, realize diagnósticos de conexão e abra chamados técnicos diretamente no sistema.
          </p>

          {/* Botão de Início Direto */}
          <button
            onClick={startDirectChat}
            className="group flex w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-3.5 px-4 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 transition-all duration-200 hover:brightness-110 active:scale-[0.99]"
          >
            <span>💬 Iniciar Atendimento</span>
          </button>

          {error && (
            <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400">
              {error}
            </div>
          )}

          {/* Teste de Cliente Real do SGP */}
          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-cyan-400">🔍 Buscar Cliente Real no SGP</span>
              <span className="text-[10px] text-slate-500">Base Vibe Telecom</span>
            </div>
            <p className="text-[11px] text-slate-400 mb-3">
              Digite seu CPF/CNPJ, telefone ou código de contrato para carregar seus dados reais do SGP:
            </p>

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

            {searchMessage && (
              <p className="mt-2 text-xs text-amber-400/90">{searchMessage}</p>
            )}

            {foundCustomer && (
              <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-300">{foundCustomer.name}</span>
                  <span className="text-[10px] text-slate-400">CPF: {foundCustomer.document}</span>
                </div>
                {foundCustomer.contracts?.length > 0 && (
                  <div className="mt-1.5 text-[11px] text-slate-300">
                    <p>Contrato: #{foundCustomer.contracts[0].id} — {foundCustomer.contracts[0].planName}</p>
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

          <div className="mt-6 flex items-center justify-between border-t border-slate-800/80 pt-4 text-xs text-slate-500">
            <span>ISPAgent v2.0</span>
            <a href="/login" className="text-slate-400 hover:text-cyan-400 transition">
              Painel de Staff →
            </a>
          </div>
        </div>
      </main>
    );
  }

  // Tela principal do Chat
  return (
    <main className="flex h-screen flex-col bg-slate-950 font-sans text-slate-100">
      {/* Top Navigation Bar */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800/80 bg-slate-900/80 px-4 md:px-6 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 font-bold text-white shadow-md shadow-cyan-500/20 text-sm">
            V
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-white">Vibe Telecom</h1>
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> SGP Conectado
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Assistente Virtual Inteligente</p>
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
          <button
            onClick={() => setShowSurvey(true)}
            className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-950/40 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-900/60 transition"
          >
            ⭐ <span>Encerrar / Avaliar</span>
          </button>
          <button
            onClick={resetConversation}
            disabled={resetting}
            title="Reiniciar conversa"
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 hover:text-white transition disabled:opacity-50"
          >
            🔄 <span>Reiniciar</span>
          </button>
        </div>
      </header>

      {/* Proactive PON Incident Banner */}
      {incidentAlert && (
        <div className="mx-4 mt-3 rounded-xl border border-amber-500/40 bg-amber-950/50 p-3.5 backdrop-blur-md text-amber-200 text-xs shadow-lg flex items-start gap-3">
          <span className="text-xl shrink-0">⚠️</span>
          <div className="flex-1">
            <strong className="block font-semibold text-amber-300">{incidentAlert.title || 'Instabilidade Detectada'}</strong>
            <p className="mt-0.5 text-amber-200/90 leading-relaxed">{incidentAlert.message}</p>
          </div>
          <button
            onClick={() => setIncidentAlert(null)}
            className="text-amber-400 hover:text-white text-sm px-1.5 py-0.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {messages.length === 0 && (
          <div className="mx-auto my-8 max-w-md text-center text-slate-400">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 border border-slate-800 text-2xl">
              👋
            </div>
            <h2 className="text-base font-semibold text-white">Olá! Como posso ajudar você hoje?</h2>
            <p className="mt-1 text-xs text-slate-400">
              Você pode digitar seu CPF ou escolher uma das ações rápidas abaixo para começar:
            </p>

            {/* Quick Action Chips */}
            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2 text-left">
              {QUICK_ACTIONS.map((action, idx) => (
                <button
                  key={idx}
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
          const isSystem = m.role === 'SYSTEM';

          if (isSystem) {
            return (
              <div key={m.id} className="my-2 flex justify-center">
                <span className="rounded-full bg-slate-900 px-3 py-1 text-[11px] text-slate-400 border border-slate-800">
                  ℹ️ {m.content}
                </span>
              </div>
            );
          }

          // Detect PIX copia e cola code
          const pixMatch = m.content.match(/000201[0-9a-zA-Z$+/=._-]{20,}/) || m.content.match(/[0-9]{26,}[a-zA-Z0-9$+/=_-]{10,}/);
          const pixCode = pixMatch ? pixMatch[0] : null;

          // Detect Boleto PDF URL
          const rawPdfMatch = m.content.match(/https?:\/\/[^\s*`)]+(?:boleto|\.pdf)[^\s*`)]*/i);
          const pdfUrl = rawPdfMatch ? rawPdfMatch[0].replace(/[.,;)]+$/, '') : null;

          return (
            <div
              key={m.id}
              className={`flex flex-col ${isCustomer ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[90%] md:max-w-xl rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                  isCustomer
                    ? 'rounded-br-sm bg-gradient-to-r from-cyan-600 to-blue-600 text-white'
                    : 'rounded-bl-sm bg-slate-900 border border-slate-800 text-slate-200'
                }`}
              >
                <div className="whitespace-pre-wrap">{m.content}</div>

                {/* Visual QR Code and PIX Card */}
                {pixCode && !isCustomer && (
                  <div className="mt-3.5 rounded-xl border border-cyan-500/30 bg-slate-950/80 p-3 shadow-lg">
                    <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-800">
                      <span className="text-[11px] font-bold text-cyan-400 flex items-center gap-1.5">
                        <span>📱</span> Pague com QR Code ou PIX Copia e Cola
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">Sicredi</span>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3">
                      <PixQrCode code={pixCode} />

                      <div className="flex-1 w-full space-y-2">
                        <p className="text-[11px] text-slate-300 leading-snug">
                          Abra o app do seu banco, escolha <strong>PIX</strong> e aponte a câmera para o QR Code ao lado.
                        </p>
                        <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-2">
                          <span className="block text-[10px] text-slate-400 font-semibold mb-1">
                            Ou copie o código Copia e Cola:
                          </span>
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

                {/* Direct PDF Download / View Button */}
                {pdfUrl && !isCustomer && (
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

        {sending && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 border border-slate-800">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
            </div>
            <span>Vibe Telecom está digitando...</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input Area */}
      <footer className="border-t border-slate-800/80 bg-slate-900/90 p-4 backdrop-blur-md">
        {/* Quick Suggestion Chips */}
        {messages.length > 0 && (
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1 text-xs no-scrollbar">
            {QUICK_ACTIONS.slice(0, 3).map((act, i) => (
              <button
                key={i}
                onClick={() => send(act.prompt)}
                disabled={sending}
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
          {/* Input oculto para upload de comprovante */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/*,application/pdf"
            className="hidden"
          />

          {/* Botão de Anexo / Comprovante */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingReceipt || sending}
            title="Enviar comprovante de pagamento (Imagem ou PDF)"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-base text-slate-300 hover:border-cyan-500/50 hover:bg-slate-800 hover:text-white transition disabled:opacity-40"
          >
            {uploadingReceipt ? '⏳' : '📎'}
          </button>

          {/* Botão de Áudio / Mensagem de voz */}
          <button
            type="button"
            onClick={handleVoiceSimulate}
            disabled={recordingVoice || sending}
            title="Enviar mensagem de voz (Transcrição com IA)"
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-base transition disabled:opacity-40 ${
              recordingVoice ? 'text-red-400 border-red-500 animate-pulse bg-red-950/40' : 'text-slate-300 hover:border-cyan-500/50 hover:bg-slate-800 hover:text-white'
            }`}
          >
            {recordingVoice ? '🔴' : '🎙️'}
          </button>

          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={sending || uploadingReceipt}
            placeholder={
              uploadingReceipt
                ? 'Analisando comprovante com IA...'
                : conversationStatus === 'HUMAN_ACTIVE'
                ? 'Converse diretamente com o atendente...'
                : 'Digite sua mensagem ou CPF/código...'
            }
            className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending || uploadingReceipt}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 font-bold text-white shadow-md shadow-cyan-500/20 hover:brightness-110 active:scale-95 disabled:opacity-40 transition"
          >
            ➤
          </button>
        </form>

        {error && <p className="mt-2 text-center text-xs text-red-400">{error}</p>}
      </footer>

      {/* CSAT Satisfaction Survey Modal */}
      {showSurvey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700/80 bg-slate-900/95 p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {surveySubmitted ? (
              <div className="text-center py-6">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-3xl text-emerald-400 border border-emerald-500/30">
                  ✓
                </div>
                <h3 className="text-lg font-bold text-white">Obrigado pelo seu feedback!</h3>
                <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                  Sua avaliação foi registrada com sucesso e ajuda nossa equipe a aprimorar constantemente o atendimento da Vibe Telecom.
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
                  <button
                    onClick={() => setShowSurvey(false)}
                    className="text-slate-400 hover:text-white text-sm"
                  >
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

                {/* Feedback tags */}
                <div className="mb-4">
                  <label className="block text-[11px] text-slate-400 mb-2 font-medium">O que você achou?</label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      'Rápido e Preciso',
                      'Resolveu meu problema',
                      'Atendimento Humanizado',
                      'Fácil de Usar',
                      'Precisa Melhorar',
                    ].map((tag) => {
                      const active = selectedTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            setSelectedTags((prev) =>
                              active ? prev.filter((t) => t !== tag) : [...prev, tag],
                            );
                          }}
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

                {/* Comment input */}
                <div className="mb-5">
                  <label className="block text-[11px] text-slate-400 mb-1 font-medium">
                    Deixe um comentário adicional (opcional):
                  </label>
                  <textarea
                    rows={3}
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
