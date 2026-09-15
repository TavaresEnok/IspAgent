'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface Status {
  erp: { provider: string; mode: string; status: string };
  ai: { provider: string; mode: string; status: string };
  pulseisp: { enabled: boolean; mode: string; status: string };
  whatsapp: { enabled: boolean; status: string };
  webchat: { enabled: boolean; status: string };
}

function Row({ name, mode, status }: { name: string; mode?: string; status: string }) {
  const ok = status.startsWith('VALIDADO') || status.includes('VALIDADO (');
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-3">
      <div>
        <div className="text-sm font-medium text-slate-800">{name}</div>
        <div className="text-xs text-slate-500">{status}</div>
      </div>
      <div className="flex items-center gap-2">
        {mode && <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{mode}</span>}
        <span className={`h-2 w-2 rounded-full ${ok ? 'bg-emerald-500' : 'bg-slate-300'}`} />
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    apiFetch<Status>('/integrations/status').then(setStatus);
  }, []);

  if (!status) return <p className="text-sm text-slate-500">Carregando...</p>;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-slate-900">Integrações</h1>
      <p className="text-sm text-slate-500">
        Status honesto de cada integração — sem credencial/API real validada, o sistema roda em modo DEMO
        e isso fica visível aqui, nunca escondido.
      </p>

      <div className="rounded border border-slate-200 bg-white p-4">
        <Row name="ERP" mode={status.erp.mode} status={status.erp.status} />
        <Row name="AI Provider" mode={status.ai.mode} status={status.ai.status} />
        <Row name="PulseISP" mode={status.pulseisp.mode} status={status.pulseisp.status} />
        <Row name="WhatsApp" status={status.whatsapp.status} />
        <Row name="Web Chat" status={status.webchat.status} />
      </div>
    </div>
  );
}
