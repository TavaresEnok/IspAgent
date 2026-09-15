'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface PolicyConfig {
  tenantId: string;
  policyVersion: string;
  canCreateTicket: boolean;
  canAccessBilling: boolean;
  canSendInvoice: boolean;
  canPerformUnlock: boolean;
  requiresConfirmationForUnlock: boolean;
  canQueryPulseISP: boolean;
  canChangePlan: boolean;
  maxToolCallsPerTurn: number;
  maxTokensPerTurn: number;
  handoffAfterFailures: number;
}

const BOOL_FIELDS: Array<{ key: keyof PolicyConfig; label: string }> = [
  { key: 'canCreateTicket', label: 'Pode abrir chamado' },
  { key: 'canAccessBilling', label: 'Pode acessar financeiro' },
  { key: 'canSendInvoice', label: 'Pode enviar segunda via' },
  { key: 'canPerformUnlock', label: 'Pode desbloquear' },
  { key: 'requiresConfirmationForUnlock', label: 'Desbloqueio exige confirmação' },
  { key: 'canQueryPulseISP', label: 'Pode consultar PulseISP' },
  { key: 'canChangePlan', label: 'Pode mudar de plano' },
];

export default function PoliciesPage() {
  const [config, setConfig] = useState<PolicyConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch<PolicyConfig>('/policy').then(setConfig);
  }, []);

  async function toggle(key: keyof PolicyConfig) {
    if (!config) return;
    const next = { ...config, [key]: !config[key] };
    setConfig(next);
    setSaving(true);
    setSaved(false);
    try {
      await apiFetch('/policy', { method: 'PATCH', body: JSON.stringify({ [key]: next[key] }) });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (!config) return <p className="text-sm text-slate-500">Carregando...</p>;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-slate-900">Políticas</h1>
      <p className="text-sm text-slate-500">
        Policy Engine do tenant (seção 4) — o que o agente pode fazer sozinho, o que exige confirmação, o
        que fica sempre bloqueado. Mudanças aqui valem no próximo turno, sem redeploy.
      </p>

      <div className="rounded border border-slate-200 bg-white p-4">
        {BOOL_FIELDS.map((f) => (
          <label key={f.key} className="flex items-center justify-between border-b border-slate-100 py-3 last:border-0">
            <span className="text-sm text-slate-700">{f.label}</span>
            <input
              type="checkbox"
              checked={Boolean(config[f.key])}
              onChange={() => toggle(f.key)}
              className="h-4 w-4"
            />
          </label>
        ))}
      </div>

      <div className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <p>Limite de tool calls por turno: {config.maxToolCallsPerTurn}</p>
        <p>Limite de tokens por turno: {config.maxTokensPerTurn}</p>
        <p>Handoff após falhas consecutivas: {config.handoffAfterFailures}</p>
        <p className="mt-2 text-xs text-slate-400">ADMIN (VLAN, OLT, provisionamento) é sempre bloqueado, sem exceção — não configurável.</p>
      </div>

      {saving && <p className="text-xs text-slate-400">Salvando...</p>}
      {saved && !saving && <p className="text-xs text-emerald-600">Salvo.</p>}
    </div>
  );
}
