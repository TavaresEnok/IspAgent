export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">ISPAgent</h1>
        <p className="mt-2 max-w-md text-sm text-slate-600">
          Agente Inteligente de Atendimento para Provedores de Internet — MVP.
        </p>
      </div>
      <div className="flex gap-4">
        <a href="/webchat" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
          Web Chat (cliente)
        </a>
        <a href="/login" className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Painel de staff
        </a>
      </div>
    </main>
  );
}
