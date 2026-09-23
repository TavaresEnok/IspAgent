import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100 font-sans selection:bg-cyan-500 selection:text-white">
      {/* Dynamic Background Glows */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-gradient-to-tr from-cyan-500/15 via-blue-600/15 to-purple-600/10 blur-[130px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-96 w-96 rounded-full bg-cyan-600/10 blur-[140px]" />

      <div className="relative mx-auto flex max-w-6xl flex-col items-center justify-between min-h-screen px-6 py-10 md:px-8">
        {/* Top Navbar */}
        <header className="flex w-full items-center justify-between border-b border-slate-800/80 pb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-400 to-blue-600 font-black text-white shadow-lg shadow-cyan-500/25 text-xl tracking-tight">
              V
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-white tracking-tight">Vibe Telecom</span>
                <span className="rounded-full bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 text-[11px] font-semibold text-cyan-400">
                  ISPAgent
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Agente Virtual Inteligente & ERP NOC</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>SGP Conectado</span>
            </div>
            <Link
              href="/login"
              className="rounded-lg border border-slate-700 bg-slate-900/80 px-3.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition"
            >
              Login Staff
            </Link>
          </div>
        </header>

        {/* Hero Section */}
        <section className="my-12 flex flex-col items-center text-center max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/90 px-3.5 py-1 text-xs text-slate-300 backdrop-blur-md">
            <span className="text-cyan-400 font-semibold">SGP Real Vibe Telecom</span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-400 font-mono text-[11px]">vibetelecom.sgp.net.br</span>
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl md:text-6xl md:leading-[1.15]">
            Atendimento Inteligente <br />
            <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400 bg-clip-text text-transparent">
              100% Conectado ao SGP
            </span>
          </h1>

          <p className="mt-5 text-base text-slate-300 sm:text-lg max-w-2xl leading-relaxed">
            Assistente virtual com inteligência artificial treinado para operações de provedores de internet.
            Consulte faturas em aberto, gere chaves PIX em tempo real, verifique o status da fibra e abra chamados técnicos sem intervenção humana.
          </p>

          {/* Action Cards */}
          <div className="mt-10 grid w-full grid-cols-1 gap-6 sm:grid-cols-2 text-left">
            {/* Card 1: Web Chat Cliente */}
            <Link
              href="/webchat"
              className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/50 hover:shadow-2xl hover:shadow-cyan-500/10"
            >
              <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-cyan-500/10 blur-2xl group-hover:bg-cyan-500/20 transition" />
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 text-2xl shadow-md shadow-cyan-500/30">
                    💬
                  </span>
                  <span className="rounded-full bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-300">
                    Ambiente de Teste
                  </span>
                </div>
                <h2 className="text-xl font-bold text-white group-hover:text-cyan-300 transition">
                  Web Chat do Cliente
                </h2>
                <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                  Converse como um cliente real da Vibe Telecom. Busque por CPF, telefone ou código de contrato e experimente a consulta de faturas, geração de PIX e diagnóstico de conexão.
                </p>
              </div>
              <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-cyan-400 group-hover:translate-x-1 transition">
                <span>Abrir Chat do Cliente</span>
                <span>→</span>
              </div>
            </Link>

            {/* Card 2: Painel Staff */}
            <Link
              href="/login"
              className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-blue-500/50 hover:shadow-2xl hover:shadow-blue-500/10"
            >
              <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-blue-500/10 blur-2xl group-hover:bg-blue-500/20 transition" />
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800 border border-slate-700 text-2xl shadow-md">
                    🛡️
                  </span>
                  <span className="rounded-full bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-blue-300">
                    Operadores & NOC
                  </span>
                </div>
                <h2 className="text-xl font-bold text-white group-hover:text-blue-300 transition">
                  Painel de Staff
                </h2>
                <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                  Gerencie conversas em tempo real, assuma atendimentos na fila humana (handoff), audite chamados abertos no SGP e configure as políticas de segurança da inteligência artificial.
                </p>
              </div>
              <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-blue-400 group-hover:translate-x-1 transition">
                <span>Entrar no Painel</span>
                <span>→</span>
              </div>
            </Link>
          </div>
        </section>

        {/* Real SGP Capabilities Grid */}
        <section className="w-full rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6 backdrop-blur-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4 mb-5">
            <div>
              <h3 className="text-sm font-semibold text-white">Recursos Integrados ao SGP da Vibe Telecom</h3>
              <p className="text-xs text-slate-400">Endpoints oficiais do SGP consumidos em tempo real pelo agente</p>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-cyan-400">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
              <span>Token: webchatnoc</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="text-lg mb-1">💸</div>
              <div className="text-xs font-semibold text-white">Faturas & PIX Imediato</div>
              <p className="mt-1 text-[11px] text-slate-400">
                Consulta faturas vencidas/abertas e gera chave Copia e Cola via rota oficial de PIX do SGP.
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="text-lg mb-1">📶</div>
              <div className="text-xs font-semibold text-white">Status do Contrato</div>
              <p className="mt-1 text-[11px] text-slate-400">
                Identifica se a conexão está ativa, bloqueada ou em redução por meio de consulta direta de planos.
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="text-lg mb-1">🛠️</div>
              <div className="text-xs font-semibold text-white">Ordens de Serviço</div>
              <p className="mt-1 text-[11px] text-slate-400">
                Consulta histórico de chamados e abre novas ocorrências técnicas diretamente na Central do Assinante.
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="text-lg mb-1">🤝</div>
              <div className="text-xs font-semibold text-white">Handoff Humano</div>
              <p className="mt-1 text-[11px] text-slate-400">
                Transfere automaticamente para atendentes humanos quando solicitado ou em negociações complexas.
              </p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-12 flex w-full flex-col sm:flex-row items-center justify-between border-t border-slate-800/80 pt-6 text-xs text-slate-500 gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-400">Vibe Telecom</span>
            <span>•</span>
            <span>Sistema ISP Agent v2.0</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/webchat" className="hover:text-slate-300 transition">
              Web Chat
            </Link>
            <Link href="/login" className="hover:text-slate-300 transition">
              Painel Staff
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
