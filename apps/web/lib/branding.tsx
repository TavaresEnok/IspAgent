'use client';

import { useEffect, useState } from 'react';
import { API_URL, apiFetch } from '@/lib/api';

export interface Brand {
  tenantId: string | null;
  slug: string | null;
  name: string;
  color: string;
  logo: string | null;
}

/** Marca de quando não há provedor identificado (o nome de compilação vira só o padrão). */
export const DEFAULT_BRAND: Brand = {
  tenantId: null,
  slug: null,
  name: process.env.NEXT_PUBLIC_WEBCHAT_BRAND || 'ISPAgent',
  color: '#0891b2',
  logo: null,
};

/**
 * Marca pública (login, Web Chat): pelo apelido na URL (`?p=vibe`) ou pelo domínio próprio do provedor.
 * `?tenant=` (widget.js antigo) continua valendo como apelido/id.
 */
export function usePublicBrand(): { brand: Brand; loaded: boolean } {
  const [brand, setBrand] = useState<Brand>(DEFAULT_BRAND);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const p = (params.get('p') ?? params.get('tenant') ?? '').trim().toLowerCase();
    const qs = /^[a-z0-9_-]{3,64}$/.test(p) ? `?p=${encodeURIComponent(p)}` : '';
    fetch(`${API_URL}/public/branding${qs}`)
      .then((r) => (r.ok ? (r.json() as Promise<Brand>) : Promise.reject()))
      .then((b) => setBrand({ ...DEFAULT_BRAND, ...b, name: b.name || DEFAULT_BRAND.name }))
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);
  return { brand, loaded };
}

/** Marca do provedor logado (painel). */
export function useTenantBrand(enabled: boolean): Brand {
  const [brand, setBrand] = useState<Brand>(DEFAULT_BRAND);
  useEffect(() => {
    if (!enabled) return;
    const load = () =>
      apiFetch<{ slug: string | null; name: string; color: string; logo: string | null }>('/tenant/branding')
        .then((b) => setBrand({ tenantId: null, ...b }))
        .catch(() => undefined);
    void load();
    // A tela "Marca" avisa quando salva, para o painel trocar na hora.
    window.addEventListener('ispagent:branding', load);
    return () => window.removeEventListener('ispagent:branding', load);
  }, [enabled]);
  return brand;
}

/** Logo do provedor, ou a inicial do nome sobre a cor da marca. */
export function BrandBadge({ brand, className = 'h-10 w-10 text-lg' }: { brand: Brand; className?: string }) {
  if (brand.logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={brand.logo} alt={brand.name} className={`${className} shrink-0 rounded-xl bg-white/5 object-contain`} />;
  }
  return (
    <div
      className={`${className} flex shrink-0 items-center justify-center rounded-xl font-extrabold text-white shadow-md`}
      style={{ background: `linear-gradient(135deg, ${brand.color}, #1e3a8a)` }}
    >
      {brand.name.charAt(0).toUpperCase()}
    </div>
  );
}
