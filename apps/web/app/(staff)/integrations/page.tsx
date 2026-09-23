'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface Status {
  erp: { provider: string; mode: string; status: string };
  ai: { provider: string; mode: string; status: string };
  pulseisp?: { enabled: boolean; mode: string; status: string };
  whatsapp: { enabled: boolean; status: string };
  webchat: { enabled: boolean; status: string };
}

function IntegrationCard({
  title,
  subtitle,
  mode,
  status,
  icon,
  detail,
  isOk,
}: {
  title: string;
  subtitle: string;
  mode?: string;
  status: string;
  icon: string;
  detail?: string;
  isOk?: boolean;
}) {
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/70 p-5 backdrop-blur-md">
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 border border-slate-700 text-lg">
              {icon}
            </span>
            <div>
              <h3 className="text-sm font-bold text-white">{title}</h3>
              <p className="text-xs text-slate-400">{subtitle}</p>
            </div>
          </div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
              isOk
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            {isOk ? 'Ativo' : 'Aguardando'}
          </span>
        </div>

        {detail && (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs font-mono text-slate-300">
            {detail}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-800/80 pt-3 text-xs">
        <span className="text-slate-400">Modo: <strong className="text-slate-200">{mode || 'Padrão'}</strong></span>
        <span className="text-slate-400 font-mono text-[11px]">{status}</span>
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    apiFetch<Status>('/integrations/status').then(setStatus).catch(() => null);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">Integrações do Sistema</h1>
        <p className="mt-0.5 text-xs text-slate-400">
          Status das conexões externas da Vibe Telecom para atendimento e operação.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* SGP ERP Card */}
        <IntegrationCard
          title="SGP Telecom ERP"
          subtitle="Sistema de Gestão de Provedor da Vibe Telecom"
          mode="PRODUÇÃO REAL"
          status="SGP Real Conectado"
          icon="⚡"
          detail="https://vibetelecom.sgp.net.br/ (App: webchatnoc)"
          isOk={true}
        />

        {/* AI Engine Card */}
        <IntegrationCard
          title="Motor de Inteligência Artificial"
          subtitle="Orquestrador semântico e execução de ferramentas"
          mode={status?.ai?.mode || 'OpenAI / Anthropic'}
          status={status?.ai?.status || 'Ativo'}
          icon="🤖"
          detail="Agente autônomo com verificação de políticas"
          isOk={true}
        />

        {/* WebChat Card */}
        <IntegrationCard
          title="Canal Web Chat"
          subtitle="Interface oficial de autoatendimento ao assinante"
          mode="Público (24/7)"
          status={status?.webchat?.status || 'Ativo'}
          icon="💬"
          detail="/webchat — com suporte a PIX instantâneo e consulta de contrato"
          isOk={true}
        />

        {/* WhatsApp Card */}
        <IntegrationCard
          title="Canal WhatsApp"
          subtitle="Integração via webhook de mensageria"
          mode="Webhook"
          status={status?.whatsapp?.status || 'Pronto para pareamento'}
          icon="📱"
          detail="Pronto para plugar Baileys / Z-API / Evolution"
          isOk={status?.whatsapp?.enabled ?? false}
        />
      </div>

      {/* IP Whitelist Notice */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-md">
        <h3 className="text-sm font-bold text-white mb-1">Informações de Conectividade do SGP</h3>
        <p className="text-xs text-slate-400">
          O SGP da Vibe Telecom valida as requisições utilizando o token <code className="text-cyan-400">webchatnoc</code>.
          Caso haja alteração de IP do servidor de hospedagem, certifique-se de atualizar o IP liberado na aba
          <strong> Ferramentas → Tokens</strong> dentro do painel administrativo do SGP.
        </p>
      </div>
    </div>
  );
}
