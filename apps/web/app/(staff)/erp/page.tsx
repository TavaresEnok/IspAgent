'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { Field, Notice, PageHeader, Section, buttonPrimary, buttonSecondary, inputClass } from '@/components/settings';

interface ErpView {
  provider: 'demo' | 'sgp';
  baseUrl: string | null;
  app: string | null;
  hasToken: boolean;
  updatedAt: string | null;
}

export default function ErpPage() {
  const [view, setView] = useState<ErpView | null>(null);
  const [provider, setProvider] = useState<'demo' | 'sgp'>('demo');
  const [baseUrl, setBaseUrl] = useState('');
  const [app, setApp] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    apiFetch<ErpView>('/erp/connection')
      .then((v) => {
        setView(v);
        setProvider(v.provider);
        setBaseUrl(v.baseUrl ?? '');
        setApp(v.app ?? '');
      })
      .catch((e) => setNotice({ kind: 'error', text: e instanceof ApiError ? e.message : 'Falha ao carregar.' }));
  }, []);

  async function save() {
    setBusy('save');
    setNotice(null);
    try {
      const v = await apiFetch<ErpView>('/erp/connection', {
        method: 'PUT',
        body: JSON.stringify(provider === 'demo' ? { provider } : { provider, baseUrl, app, token: token || undefined }),
      });
      setView(v);
      setToken('');
      setNotice({ kind: 'ok', text: provider === 'demo' ? 'Modo demonstração ativado.' : 'Conexão salva. Use "Testar" para confirmar.' });
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof ApiError ? e.message : 'Falha ao salvar.' });
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy('test');
    setNotice(null);
    try {
      const r = await apiFetch<{ ok: boolean; message: string; latencyMs?: number }>('/erp/connection/test', { method: 'POST' });
      setNotice({ kind: r.ok ? 'ok' : 'error', text: `${r.message}${r.latencyMs ? ` (${r.latencyMs} ms)` : ''}` });
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof ApiError ? e.message : 'Falha no teste.' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="ERP (sistema de gestão)">
        De onde a IA tira faturas, PIX, plano e contratos dos seus clientes. O token fica cifrado e nunca é mostrado de volta.
      </PageHeader>

      {notice && (
        <Notice kind={notice.kind} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      {view && (
        <Section title="Conexão" aside={view.updatedAt ? <span className="text-xs text-slate-500">Atualizado {new Date(view.updatedAt).toLocaleString('pt-BR')}</span> : null}>
          <Field label="Sistema">
            <select className={inputClass} value={provider} onChange={(e) => setProvider(e.target.value as 'demo' | 'sgp')}>
              <option value="sgp">SGP</option>
              <option value="demo">Demonstração (base de exemplo)</option>
            </select>
          </Field>

          {provider === 'sgp' && (
            <>
              <Field label="URL do SGP" hint="O endereço do seu SGP, com https (ex.: https://seuprovedor.sgp.net.br).">
                <input className={inputClass} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://seuprovedor.sgp.net.br" />
              </Field>
              <Field label="App" hint="Nome do app cadastrado em SGP → Sistema → Tokens (atenção a maiúsculas e minúsculas).">
                <input className={inputClass} value={app} onChange={(e) => setApp(e.target.value)} placeholder="atendimento-ia" />
              </Field>
              <Field
                label="Token de API"
                hint={view.hasToken ? 'Já há um token salvo — deixe em branco para manter.' : 'Gere o token no SGP e libere o IP deste servidor em “Hosts permitidos”.'}
              >
                <input className={inputClass} type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" placeholder={view.hasToken ? '••••••••' : ''} />
              </Field>
            </>
          )}

          <div className="flex gap-2">
            <button className={buttonPrimary} disabled={busy !== null} onClick={() => void save()}>
              {busy === 'save' ? 'Salvando…' : 'Salvar'}
            </button>
            <button className={buttonSecondary} disabled={busy !== null} onClick={() => void test()}>
              {busy === 'test' ? 'Testando…' : 'Testar conexão'}
            </button>
          </div>
        </Section>
      )}
    </div>
  );
}
