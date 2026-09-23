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
  companyName?: string;
  assistantName?: string;
  tone?: string;
  customRules?: string;
  supportHours?: string;
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
  const [personaForm, setPersonaForm] = useState({
    companyName: '',
    assistantName: '',
    tone: '',
    customRules: '',
    supportHours: '',
  });

  useEffect(() => {
    apiFetch<PolicyConfig>('/policy').then((c) => {
      if (c) {
        setConfig(c);
        setPersonaForm({
          companyName: c.companyName || 'Vibe Telecom',
          assistantName: c.assistantName || 'Assistente Virtual',
          tone: c.tone || 'caloroso, educado, empático e resolutivo (2 a 4 frases)',
          customRules: c.customRules || '',
          supportHours: c.supportHours || 'Segunda a Sexta, 08h às 18h',
        });
      }
    }).catch(() => null);
  }, []);

  async function savePersona() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await apiFetch<PolicyConfig>('/policy', {
        method: 'PATCH',
        body: JSON.stringify(personaForm),
      });
      if (res) setConfig(res);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

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

      {/* Persona e Atendimento do Provedor */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 backdrop-blur-md">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <span>🎭</span> Persona & Tom de Voz da IA
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Personalize o nome da empresa, o nome do assistente virtual, o tom da conversa e as regras específicas do seu provedor.
            </p>
          </div>
          <button
            onClick={savePersona}
            disabled={saving}
            className="rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-cyan-950 hover:brightness-110 active:scale-95 transition disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Salvar Persona'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block text-slate-400 font-medium mb-1">Nome da Empresa / Provedor</label>
            <input
              type="text"
              value={personaForm.companyName}
              onChange={(e) => setPersonaForm({ ...personaForm, companyName: e.target.value })}
              placeholder="Ex: Vibe Telecom"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-slate-400 font-medium mb-1">Nome do Assistente Virtual</label>
            <input
              type="text"
              value={personaForm.assistantName}
              onChange={(e) => setPersonaForm({ ...personaForm, assistantName: e.target.value })}
              placeholder="Ex: Ana, VibeBot, Assistente Virtual"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-slate-400 font-medium mb-1">Horário de Atendimento Humano</label>
            <input
              type="text"
              value={personaForm.supportHours}
              onChange={(e) => setPersonaForm({ ...personaForm, supportHours: e.target.value })}
              placeholder="Ex: Segunda a Sexta, 08h às 18h"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-slate-400 font-medium mb-1">Tom de Voz</label>
            <input
              type="text"
              value={personaForm.tone}
              onChange={(e) => setPersonaForm({ ...personaForm, tone: e.target.value })}
              placeholder="Ex: caloroso, educado, empático e resolutivo (2 a 4 frases)"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-slate-400 font-medium mb-1">Regras Específicas / Políticas Customizadas do Provedor</label>
            <textarea
              rows={3}
              value={personaForm.customRules}
              onChange={(e) => setPersonaForm({ ...personaForm, customRules: e.target.value })}
              placeholder="Ex: Se o cliente perguntar sobre planos corporativos, oriente a ligar no 0800. Para cancelamento, informar que não há multa após 12 meses."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>
        </div>
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
