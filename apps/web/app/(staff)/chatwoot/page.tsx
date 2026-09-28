'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useTenantBrand } from '@/lib/branding';
import { CopyValue, Field, Notice, PageHeader, Section, buttonPrimary, inputClass } from '@/components/settings';

interface ChatwootView {
  configured: boolean;
  baseUrl: string | null;
  publicUrl: string | null;
  accountId: string | null;
  hasBotToken: boolean;
  widgetToken: string | null;
  webhookUrl: string | null;
  webhookPath: string | null;
}

export default function ChatwootPage() {
  const [view, setView] = useState<ChatwootView | null>(null);
  const [form, setForm] = useState({ baseUrl: '', publicUrl: '', accountId: '', botToken: '', widgetToken: '' });
  const [busy, setBusy] = useState(false);
  const brand = useTenantBrand(true);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = (v: ChatwootView) => {
    setView(v);
    setForm({ baseUrl: v.baseUrl ?? '', publicUrl: v.publicUrl ?? '', accountId: v.accountId ?? '', botToken: '', widgetToken: v.widgetToken ?? '' });
  };

  useEffect(() => {
    apiFetch<ChatwootView>('/chatwoot/connection')
      .then(load)
      .catch((e) => setNotice({ kind: 'error', text: e instanceof ApiError ? e.message : 'Falha ao carregar.' }));
  }, []);

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      load(
        await apiFetch<ChatwootView>('/chatwoot/connection', {
          method: 'PUT',
          body: JSON.stringify({ ...form, botToken: form.botToken || undefined, publicUrl: form.publicUrl || undefined, widgetToken: form.widgetToken || undefined }),
        }),
      );
      setNotice({ kind: 'ok', text: 'Chatwoot salvo. Cole a URL do webhook no Agent Bot (abaixo).' });
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof ApiError ? e.message : 'Falha ao salvar.' });
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const webhook = view?.webhookUrl ?? (view?.webhookPath && typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:3001${view.webhookPath}` : null);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Chatwoot">
        A sua equipe atende no Chatwoot e a IA do ISPAgent responde primeiro, como Agent Bot. Quando a IA transfere, a conversa aparece para os
        atendentes com a etiqueta do setor.
      </PageHeader>

      {notice && (
        <Notice kind={notice.kind} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      {view && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Section title="Conexão">
            <Field label="URL do Chatwoot (para a API)" hint="Endereço que este servidor usa para responder no Chatwoot.">
              <input className={inputClass} value={form.baseUrl} onChange={set('baseUrl')} placeholder="https://chat.seuprovedor.com.br" />
            </Field>
            <Field label="URL pública (opcional)" hint="Endereço que o navegador do cliente usa para o widget, se for diferente.">
              <input className={inputClass} value={form.publicUrl} onChange={set('publicUrl')} />
            </Field>
            <Field label="Número da conta" hint="Aparece na URL do Chatwoot: …/app/accounts/NÚMERO/…">
              <input className={inputClass} value={form.accountId} onChange={set('accountId')} inputMode="numeric" />
            </Field>
            <Field label="Token do Agent Bot" hint={view.hasBotToken ? 'Já há um token salvo — deixe em branco para manter.' : 'Configurações → Bots → seu bot → token de acesso.'}>
              <input className={inputClass} type="password" value={form.botToken} onChange={set('botToken')} autoComplete="off" placeholder={view.hasBotToken ? '••••••••' : ''} />
            </Field>
            <Field label="Token do widget do site (opcional)" hint="Da caixa de entrada do tipo Site; usado pela página de teste do widget.">
              <input className={inputClass} value={form.widgetToken} onChange={set('widgetToken')} />
            </Field>
            <button className={buttonPrimary} disabled={busy} onClick={() => void save()}>
              {busy ? 'Salvando…' : 'Salvar'}
            </button>
          </Section>

          <Section title="Ligar o bot no Chatwoot">
            {view.configured && webhook ? (
              <ol className="list-decimal space-y-3 pl-5 text-sm text-slate-300">
                <li>
                  No Chatwoot: <b>Configurações → Bots → Adicionar bot</b>, e em “URL do webhook” cole:
                  <CopyValue value={webhook} />
                  <span className="mt-1 block text-xs text-slate-500">Essa URL é secreta: é ela que prova que as mensagens vêm do seu Chatwoot.</span>
                </li>
                <li>Copie o token de acesso do bot e cole no campo “Token do Agent Bot” ao lado.</li>
                <li>
                  Em <b>Caixas de entrada → sua caixa → Bot</b>, escolha o bot criado.
                </li>
                {form.widgetToken && (
                  <li>
                    Teste como cliente em <a className="text-cyan-300 underline" href={`/chatwoot-teste?p=${brand.slug ?? ''}`} target="_blank" rel="noreferrer">página de teste do widget</a>.
                  </li>
                )}
              </ol>
            ) : (
              <p className="text-sm text-slate-400">Salve a conexão para gerar a URL do webhook.</p>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}
