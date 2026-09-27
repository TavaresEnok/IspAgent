'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';

type Status = 'STOPPED' | 'STARTING' | 'SCAN_QR_CODE' | 'PASSKEY_REQUIRED' | 'PASSKEY_CONFIRMATION_REQUIRED' | 'WORKING' | 'FAILED';

interface Session {
  configured?: boolean;
  status: Status | null;
  phone: string | null;
  pushName: string | null;
}

const LABEL: Record<Status | 'NONE', { text: string; style: string }> = {
  NONE: { text: 'Nunca conectado', style: 'bg-slate-800 text-slate-300' },
  STOPPED: { text: 'Desconectado', style: 'bg-slate-800 text-slate-300' },
  STARTING: { text: 'Iniciando...', style: 'bg-blue-500/15 text-blue-300' },
  SCAN_QR_CODE: { text: 'Aguardando leitura do QR Code', style: 'bg-amber-500/15 text-amber-300' },
  PASSKEY_REQUIRED: { text: 'Confirme no celular', style: 'bg-amber-500/15 text-amber-300' },
  PASSKEY_CONFIRMATION_REQUIRED: { text: 'Confirme no celular', style: 'bg-amber-500/15 text-amber-300' },
  WORKING: { text: 'Conectado', style: 'bg-emerald-500/15 text-emerald-300' },
  FAILED: { text: 'Falhou — conecte de novo', style: 'bg-red-500/15 text-red-300' },
};

/** Enquanto a sessão está a caminho de conectar, a tela acompanha sozinha. */
const WAITING: Array<Status | null> = ['STARTING', 'SCAN_QR_CODE', 'PASSKEY_REQUIRED', 'PASSKEY_CONFIRMATION_REQUIRED'];
const POLL_MS = 4000;

function formatPhone(digits: string): string {
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(digits);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : `+${digits}`;
}

export default function WhatsAppPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await apiFetch<Session>('/whatsapp-web/status');
      setSession(s);
      if (s.status === 'SCAN_QR_CODE') {
        const img = await apiFetch<{ mimetype: string; data: string }>('/whatsapp-web/qr');
        setQr(`data:${img.mimetype};base64,${img.data}`);
      } else {
        setQr(null);
      }
      setError(null);
      return s;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao consultar o WhatsApp');
      return null;
    }
  }, []);

  // Acompanha o status (e renova o QR, que expira em ~20 s) enquanto a conexão não termina.
  useEffect(() => {
    let active = true;
    const loop = async () => {
      const s = await refresh();
      if (!active) return;
      if (s && WAITING.includes(s.status)) timer.current = setTimeout(loop, POLL_MS);
    };
    void loop();
    return () => {
      active = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refresh, session?.status]);

  async function act(key: 'connect' | 'disconnect') {
    if (key === 'disconnect' && !confirm('Desconectar o WhatsApp? O atendimento por este número para até conectar de novo.')) return;
    setBusy(key);
    setError(null);
    try {
      const s = await apiFetch<Session>(`/whatsapp-web/${key}`, { method: 'POST' });
      setSession((prev) => ({ ...prev, ...s }));
      if (key === 'disconnect') setQr(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha na requisição');
    } finally {
      setBusy(null);
    }
  }

  if (!session) return error ? <p className="text-sm text-red-600">{error}</p> : <p className="text-sm text-slate-400">Carregando...</p>;

  if (session.configured === false) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-bold text-white">WhatsApp</h1>
        <p className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
          A conexão do WhatsApp por QR Code não está habilitada para este provedor. Fale com o suporte do ISPAgent.
        </p>
      </div>
    );
  }

  const label = LABEL[session.status ?? 'NONE'];
  const connected = session.status === 'WORKING';
  const waiting = WAITING.includes(session.status);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-white">WhatsApp</h1>
        <p className="text-sm text-slate-400">
          Conecte o número de atendimento do provedor lendo o QR Code com o celular, como no WhatsApp Web.
        </p>
      </div>

      {error && <p className="rounded-xl bg-red-500/10 px-4 py-2 text-sm text-red-300">{error}</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">Status</h2>
          <span className={`inline-block rounded px-2 py-1 text-xs font-medium ${label.style}`}>{label.text}</span>

          {connected && (
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-slate-500">Número</dt>
              <dd className="font-mono text-slate-100">{session.phone ? formatPhone(session.phone) : '—'}</dd>
              <dt className="text-slate-500">Perfil</dt>
              <dd className="text-slate-100">{session.pushName ?? '—'}</dd>
            </dl>
          )}

          <div className="mt-4 flex gap-2">
            {!connected && !waiting && (
              <button
                onClick={() => act('connect')}
                disabled={busy !== null}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy === 'connect' ? 'Iniciando...' : 'Conectar WhatsApp'}
              </button>
            )}
            {(connected || waiting) && (
              <button
                onClick={() => act('disconnect')}
                disabled={busy !== null}
                className="rounded-xl border border-red-500/40 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-50"
              >
                {busy === 'disconnect' ? 'Desconectando...' : waiting ? 'Cancelar' : 'Desconectar'}
              </button>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">QR Code</h2>
          {qr ? (
            <div className="flex flex-col items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR Code para conectar o WhatsApp" className="h-64 w-64 rounded-xl border border-slate-700 bg-white p-2" />
              <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-300">
                <li>Abra o WhatsApp no celular do número de atendimento.</li>
                <li>
                  Toque em <strong>Mais opções ⋮</strong> (ou <strong>Configurações</strong> no iPhone) →{' '}
                  <strong>Aparelhos conectados</strong> → <strong>Conectar aparelho</strong>.
                </li>
                <li>Aponte a câmera para este QR Code. Ele se renova sozinho.</li>
              </ol>
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              {connected
                ? 'WhatsApp conectado. O QR Code só aparece ao conectar um número.'
                : waiting
                  ? 'Gerando o QR Code...'
                  : 'Clique em "Conectar WhatsApp" para gerar o QR Code.'}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
