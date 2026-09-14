import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ISPAgent',
  description: 'Agente Inteligente de Atendimento para Provedores de Internet',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
