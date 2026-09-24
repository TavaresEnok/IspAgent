'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiLogin, setSession, ApiError } from '@/lib/api';

// Credenciais de demonstração só aparecem (e só pré-preenchem) num build marcado como DEMO.
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
const BRAND = process.env.NEXT_PUBLIC_WEBCHAT_BRAND || 'ISPAgent';

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
    <main className="relative flex min-h-screen items-center justify-center bg-slate-950 p-4 font-sans text-slate-100">
      {/* Background glow effects */}
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center overflow-hidden">
        <div className="h-[450px] w-[450px] rounded-full bg-cyan-600/15 blur-[130px]" />
        <div className="h-[400px] w-[400px] rounded-full bg-blue-600/15 blur-[140px]" />
      </div>

      <div className="relative w-full max-w-md rounded-2xl border border-slate-800/90 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-xl">
        {/* Brand Header */}
        <div className="mb-6 flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-400 to-blue-600 font-extrabold text-white shadow-lg shadow-cyan-500/25 text-2xl">
            {BRAND.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white">{BRAND}</h1>
              <span className="rounded-full bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 text-[10px] font-semibold text-cyan-400">
                Staff NOC
              </span>
            </div>
            <p className="text-xs text-slate-400">Painel Operacional do Provedor</p>
          </div>
        </div>

        <p className="mb-6 text-xs text-slate-300 leading-relaxed">
          Entre com as credenciais da sua equipe para acessar o dashboard de atendimentos, gerenciar a fila de transbordo e monitorar as integrações.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-300">
            <span>E-mail Corporativo</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="seu.email@provedor.com.br"
              autoComplete="username"
              className="rounded-xl border border-slate-700 bg-slate-950/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none transition"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-300">
            <span>Senha de Acesso</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              autoComplete="current-password"
              className="rounded-xl border border-slate-700 bg-slate-950/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none transition"
            />
          </label>
          {needsTenant && (
            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-300">
              <span>Provedor (tenant)</span>
              <input
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                required
                placeholder="identificador do provedor"
                className="rounded-xl border border-slate-700 bg-slate-950/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none transition"
              />
            </label>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 hover:brightness-110 active:scale-[0.99] disabled:opacity-50 transition"
          >
            {loading ? (
              <>
                <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                <span>Autenticando...</span>
              </>
            ) : (
              <span>Acessar Painel</span>
            )}
          </button>
        </form>

        {DEMO_MODE && (
          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 text-xs text-slate-400">
            <p className="mb-1 font-medium text-slate-300">Credenciais DEMO</p>
            <p>admin@alpha.ispagent.local / Demo!2026 (TENANT_ADMIN)</p>
            <p>operador@alpha.ispagent.local / Demo!2026 (AGENT)</p>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between border-t border-slate-800/80 pt-4 text-xs">
          <Link href="/" className="text-slate-400 hover:text-slate-200 transition">
            ← Voltar ao início
          </Link>
          <Link href="/webchat" className="text-cyan-400 hover:text-cyan-300 font-medium transition">
            Testar Web Chat →
          </Link>
        </div>
      </div>
    </main>
  );
}
