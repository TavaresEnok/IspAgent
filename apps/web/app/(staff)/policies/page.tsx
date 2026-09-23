'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface PolicyConfig {
  tenantId: string;
  policyVersion: string;
  readOnlyMode?: boolean;
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

const BOOL_FIELDS: Array<{ key: keyof PolicyConfig; label: string; desc: string }> = [
  { key: 'canCreateTicket', label: 'Abertura de Chamados (O.S.)', desc: 'Permite abrir ocorrências na Central do Assinante do SGP' },
  { key: 'canAccessBilling', label: 'Consulta de Faturas & Débitos', desc: 'Permite consultar status financeiro e valores pendentes' },
  { key: 'canSendInvoice', label: 'Geração de PIX & Segunda Via', desc: 'Emite chave PIX copia-e-cola e código de barras via SGP' },
  { key: 'canPerformUnlock', label: 'Desbloqueio em Confiança', desc: 'Habilita liberação temporária de sinal bloqueado' },
  { key: 'requiresConfirmationForUnlock', label: 'Exigir Confirmação no Desbloqueio', desc: 'Pergunta "Deseja confirmar o desbloqueio?" antes de executar' },
  { key: 'canQueryPulseISP', label: 'Diagnóstico de Rede & Telemetria', desc: 'Consulta telemetria de sinal óptico e atenuação' },
  { key: 'canChangePlan', label: 'Upgrade de Plano Automático', desc: 'Permite alterar planos de banda contratada' },
];

export default function PoliciesPage() {
  const [config, setConfig] = useState<PolicyConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch<PolicyConfig>('/policy').then(setConfig).catch(() => null);
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

  if (!config) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        <div className="flex items-center gap-3">
          <span className="h-4 w-4 rounded-full border-2 border-cyan-400/30 border-t-cyan-400 animate-spin" />
          <span>Carregando políticas da Vibe Telecom...</span>
        </div>
      </div>
    );
  }

  const isReadOnly = Boolean(config.readOnlyMode);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">Políticas Operacionais da IA</h1>
        <p className="mt-0.5 text-xs text-slate-400">
          Controle de limites e permissões do que a IA pode executar no SGP da Vibe Telecom de forma autônoma.
        </p>
      </div>

      {/* Master Switch: Modo Somente Leitura */}
      <div className={`rounded-2xl border p-5 transition-all ${isReadOnly ? 'border-amber-500/40 bg-amber-950/20 shadow-lg shadow-amber-950/30' : 'border-slate-800 bg-slate-900/70'}`}>
        <label className="flex items-center justify-between cursor-pointer">
          <div className="pr-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">Modo Somente Leitura (Bloqueio Total de O.S. e Mutações)</span>
              {isReadOnly ? (
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full">
                  ATIVO — Bloqueando O.S.
                </span>
              ) : (
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-slate-800 text-slate-400 rounded-full">
                  Inativo
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-300">
              Quando ativado, proíbe estritamente qualquer abertura de chamado técnico (O.S.), alteração cadastral ou desbloqueio no SGP. A IA fica liberada exclusivamente para <strong>consultas de leitura</strong> e <strong>emissão de documentos (link do PDF e código PIX)</strong>.
            </p>
          </div>
          <input
            type="checkbox"
            checked={isReadOnly}
            onChange={() => toggle('readOnlyMode')}
            className="h-6 w-6 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500/30 focus:ring-offset-0 cursor-pointer"
          />
        </label>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 backdrop-blur-md">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Permissões Específicas</h2>
        <div className="divide-y divide-slate-800/80">
          {BOOL_FIELDS.map((f) => {
            const isBlockedByReadOnly = isReadOnly && (f.key === 'canCreateTicket' || f.key === 'canPerformUnlock' || f.key === 'canChangePlan');
            return (
              <label key={f.key} className="flex items-center justify-between py-4 cursor-pointer hover:bg-slate-800/20 px-2 rounded-xl transition">
                <div className="pr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white block">{f.label}</span>
                    {isBlockedByReadOnly && (
                      <span className="text-[10px] font-medium text-amber-400/80 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-800/40">
                        Bloqueado por Somente Leitura
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400">{f.desc}</span>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(config[f.key])}
                  onChange={() => toggle(f.key)}
                  className="h-5 w-5 rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-cyan-500/20 focus:ring-offset-0"
                />
              </label>
            );
          })}
        </div>
      </div>

      {/* Limits and Guardrails */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <span className="text-xs text-slate-400">Tool Calls por Turno</span>
          <div className="text-lg font-bold text-white mt-1 font-mono">{config.maxToolCallsPerTurn} chamadas</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <span className="text-xs text-slate-400">Tokens por Turno</span>
          <div className="text-lg font-bold text-white mt-1 font-mono">{config.maxTokensPerTurn} tokens</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <span className="text-xs text-slate-400">Handoff após Falhas</span>
          <div className="text-lg font-bold text-white mt-1 font-mono">{config.handoffAfterFailures} tentativas</div>
        </div>
      </div>

      {saving && <p className="text-xs text-cyan-400">Salvando alterações na política...</p>}
      {saved && !saving && <p className="text-xs text-emerald-400">✓ Políticas atualizadas com sucesso.</p>}
    </div>
  );
}
