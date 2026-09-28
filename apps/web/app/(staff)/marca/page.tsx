'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { BrandBadge, type Brand } from '@/lib/branding';
import { CopyValue, Field, Notice, PageHeader, Section, buttonPrimary, buttonSecondary, inputClass } from '@/components/settings';

interface TenantBranding {
  slug: string | null;
  name: string;
  color: string;
  logo: string | null;
  customDomain: string | null;
  plan: string | null;
}

const MAX_LOGO_BYTES = 200 * 1024;

export default function BrandPage() {
  const [data, setData] = useState<TenantBranding | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#0891b2');
  const [logo, setLogo] = useState<string | null>(null);
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = (b: TenantBranding) => {
    setData(b);
    setName(b.name);
    setColor(b.color);
    setLogo(b.logo);
    setSlug(b.slug ?? '');
  };

  useEffect(() => {
    apiFetch<TenantBranding>('/tenant/branding')
      .then(load)
      .catch((e) => setNotice({ kind: 'error', text: e instanceof ApiError ? e.message : 'Falha ao carregar.' }));
  }, []);

  function pickLogo(file: File | undefined) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) {
      setNotice({ kind: 'error', text: 'Use PNG, JPEG, WebP ou SVG.' });
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setNotice({ kind: 'error', text: 'A logo precisa ter até 200 KB.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogo(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      load(
        await apiFetch<TenantBranding>('/tenant/branding', {
          method: 'PUT',
          body: JSON.stringify({ brandName: name, brandColor: color, brandLogo: logo, slug: slug || undefined }),
        }),
      );
      window.dispatchEvent(new Event('ispagent:branding'));
      setNotice({ kind: 'ok', text: 'Marca salva — painel, login, Web Chat e a IA já usam o novo nome.' });
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof ApiError ? e.message : 'Falha ao salvar.' });
    } finally {
      setBusy(false);
    }
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const preview: Brand = { tenantId: null, slug, name: name || 'Seu provedor', color, logo };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Marca">
        O ISPAgent aparece para os seus clientes e para a sua equipe com o seu nome, cor e logo. A IA também se apresenta com esse nome.
      </PageHeader>

      {notice && (
        <Notice kind={notice.kind} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      {data && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Section title="Identidade visual">
            <Field label="Nome">
              <input className={inputClass} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Cor principal">
              <div className="flex items-center gap-3">
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg border border-slate-700 bg-slate-950" />
                <input className={`${inputClass} max-w-[140px] font-mono`} value={color} onChange={(e) => setColor(e.target.value)} />
              </div>
            </Field>
            <Field label="Logo" hint="PNG, JPEG, WebP ou SVG, até 200 KB. De preferência quadrada.">
              <div className="flex items-center gap-3">
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => pickLogo(e.target.files?.[0])} className="text-xs text-slate-300" />
                {logo && (
                  <button type="button" className={buttonSecondary} onClick={() => setLogo(null)}>
                    Remover
                  </button>
                )}
              </div>
            </Field>
            <Field label="Apelido público" hint="Vai no endereço do seu atendimento: 3 a 40 letras minúsculas, números e “-”.">
              <input className={`${inputClass} font-mono`} value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
            </Field>
            <button className={buttonPrimary} disabled={busy} onClick={() => void save()}>
              {busy ? 'Salvando…' : 'Salvar'}
            </button>
          </Section>

          <div className="flex flex-col gap-5">
            <Section title="Pré-visualização">
              <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 p-4">
                <BrandBadge brand={preview} className="h-12 w-12 text-2xl" />
                <div>
                  <p className="font-bold text-white">{preview.name}</p>
                  <p className="text-xs" style={{ color }}>
                    Atendimento virtual
                  </p>
                </div>
              </div>
            </Section>

            <Section title="Seus endereços">
              {data.slug ? (
                <div className="space-y-4 text-sm text-slate-300">
                  <div>
                    Web Chat para clientes
                    <CopyValue value={`${origin}/webchat?p=${data.slug}`} />
                  </div>
                  <div>
                    Login da sua equipe
                    <CopyValue value={`${origin}/login?p=${data.slug}`} />
                  </div>
                  {data.customDomain && (
                    <div>
                      Domínio próprio
                      <CopyValue value={`https://${data.customDomain}`} />
                    </div>
                  )}
                  <p className="text-xs text-slate-500">
                    Quer um domínio próprio (ex.: atendimento.seuprovedor.com.br)? Peça à plataforma e aponte o DNS para o servidor.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-slate-400">Defina um apelido público para gerar os endereços.</p>
              )}
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}
