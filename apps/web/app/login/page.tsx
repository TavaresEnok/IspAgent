'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiLogin, setSession, ApiError } from '@/lib/api';

// Credenciais de demonstração só aparecem (e só pré-preenchem) num build marcado como DEMO.
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState(DEMO_MODE ? 'admin@alpha.ispagent.local' : '');
  const [password, setPassword] = useState(DEMO_MODE ? 'Demo!2026' : '');
  const [tenantId, setTenantId] = useState('');
  const [needsTenant, setNeedsTenant] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { accessToken, refreshToken } = await apiLogin(email, password, needsTenant ? tenantId.trim() : undefined);
      setSession(accessToken, refreshToken);
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TENANT_REQUIRED') {
        setNeedsTenant(true);
        setError(err.message);
      } else {
        setError(err instanceof ApiError ? err.message : 'Falha ao conectar com a API');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-slate-900">ISPAgent</h1>
        <p className="mb-6 text-sm text-slate-500">Painel de atendimento — login de staff</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">E-mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Senha</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </label>
          {needsTenant && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Provedor (tenant)</span>
              <input
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                required
                placeholder="ex.: tnt_vibe"
                className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              />
            </label>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        {DEMO_MODE && (
          <div className="mt-6 rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
            <p className="mb-1 font-medium">Credenciais DEMO</p>
            <p>admin@alpha.ispagent.local / Demo!2026 (TENANT_ADMIN)</p>
            <p>operador@alpha.ispagent.local / Demo!2026 (AGENT)</p>
          </div>
        )}

        <a href="/webchat" className="mt-4 block text-center text-xs text-slate-400 hover:text-slate-600">
          Ir para o Web Chat do cliente →
        </a>
      </div>
    </main>
  );
}
