'use client';

import { useEffect, useState } from 'react';
import { API_URL } from '@/lib/api';

declare global {
  interface Window {
    chatwootSDK?: { run: (opts: { websiteToken: string; baseUrl: string }) => void };
    chatwootSettings?: Record<string, unknown>;
  }
}

/**
 * Página de teste do widget do Chatwoot: simula o site do provedor. O cliente conversa pelo widget, o
 * Chatwoot entrega ao ISPAgent (Agent Bot) e, numa transferência, a conversa aparece para os atendentes
 * no Chatwoot. Endereço e token do widget vêm da API (são públicos por natureza — estão em qualquer site).
 */
export default function ChatwootTestPage() {
  const [state, setState] = useState<'loading' | 'ready' | 'off'>('loading');

  useEffect(() => {
    let cancelled = false;
    // O provedor vem do endereço: /chatwoot-teste?p=apelido
    const p = (new URLSearchParams(window.location.search).get('p') ?? '').trim().toLowerCase();
    fetch(`${API_URL}/public/chatwoot/widget-config?t=${encodeURIComponent(p)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ baseUrl: string; websiteToken: string }>) : Promise.reject()))
      .then(({ baseUrl, websiteToken }) => {
        if (cancelled) return;
        window.chatwootSettings = { locale: 'pt_BR', position: 'right', type: 'expanded_bubble', launcherTitle: 'Fale conosco' };
        const script = document.createElement('script');
        script.src = `${baseUrl}/packs/js/sdk.js`;
        script.async = true;
        script.onload = () => {
          window.chatwootSDK?.run({ websiteToken, baseUrl });
          setState('ready');
        };
        script.onerror = () => setState('off');
        document.body.appendChild(script);
      })
      .catch(() => !cancelled && setState('off'));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
      <div className="max-w-lg rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center">
        <h1 className="text-xl font-bold text-white">Site de teste — atendimento pelo Chatwoot</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          {state === 'loading' && 'Carregando o widget…'}
          {state === 'ready' &&
            'Clique no balão “Fale conosco” no canto da tela e converse como se fosse um cliente. Quem responde é a IA do ISPAgent; se ela transferir, a conversa aparece para os atendentes no Chatwoot.'}
          {state === 'off' && 'A integração com o Chatwoot não está configurada neste servidor.'}
        </p>
      </div>
    </main>
  );
}
