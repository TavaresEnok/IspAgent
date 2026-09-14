export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">ISPAgent</h1>
      <p className="max-w-md text-center text-sm text-slate-600">
        Plataforma em construção — MVP em andamento. Consulte <code>STATE.md</code> e{' '}
        <code>PROGRESS.md</code> no repositório para o status atual de cada fase.
      </p>
    </main>
  );
}
