'use client';

import { useEffect, useState } from 'react';
import { apiFetch, API_URL } from '@/lib/api';

interface PersonaConfig {
  companyName: string;
  assistantName: string;
  tone: string;
  customRules: string;
  supportHours: string;
}

export default function PromptPlaygroundPage() {
  const [persona, setPersona] = useState<PersonaConfig>({
    companyName: 'Vibe Telecom',
    assistantName: 'Assistente Virtual Vibe',
    tone: 'Empático, consultivo e objetivo',
    customRules: 'Nunca prometer prazos de visita técnica sem confirmação do NOC. Priorizar geração de PIX para faturas vencidas.',
    supportHours: 'Segunda a Sexta, das 08:00 às 20:00. Sábados das 08:00 às 14:00.',
  });

  const [testMessage, setTestMessage] = useState('minha internet está lenta e quero o código pix da fatura para pagar');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [result, setResult] = useState<{
    reply: string;
    detectedIntents: string[];
    decisionRationale?: string;
    simulatedFacts: string[];
  } | null>(null);

  useEffect(() => {
    apiFetch<any>('/policy')
      .then((pol) => {
        if (pol?.config) {
          setPersona({
            companyName: pol.config.companyName || 'Vibe Telecom',
            assistantName: pol.config.assistantName || 'Assistente Virtual Vibe',
            tone: pol.config.tone || 'Empático, consultivo e objetivo',
            customRules: pol.config.customRules || '',
            supportHours: pol.config.supportHours || '',
          });
        }
      })
      .catch(() => {});
  }, []);

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testMessage.trim() || loading) return;
    setLoading(true);
    setResult(null);

    try {
      // Cria sessão de teste no webchat usando channelUserId dedicado para simulação
      const res = await fetch(`${API_URL}/public/webchat/tnt_vibe/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelUserId: 'playground_test_' + Date.now().toString(36),
          message: testMessage,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const lastMsg = data.messages?.filter((m: any) => m.role === 'AGENT' || m.role === 'ASSISTANT')?.pop();
        setResult({
          reply: lastMsg?.content || 'Resposta gerada pelo agente.',
          detectedIntents: data.decision?.detectedIntents || [data.decision?.intent || 'GERAL'],
          decisionRationale: data.decision?.rationale,
          simulatedFacts: data.decision?.facts || [],
        });
      }
    } catch (err: any) {
      setResult({
        reply: 'Erro ao simular: ' + (err.message || 'Falha de conexão com a API.'),
        detectedIntents: ['ERRO'],
        simulatedFacts: [],
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToPolicies = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      await apiFetch('/policy', {
        method: 'PUT',
        body: JSON.stringify(persona),
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert('Erro ao salvar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Laboratório de Prompt & Persona</h1>
          <p className="mt-0.5 text-xs text-slate-400">
            Ajuste a personalidade do agente, regras customizadas e teste turnos multi-intenção em tempo real.
          </p>
        </div>
        <button
          onClick={handleSaveToPolicies}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-cyan-950/40 transition disabled:opacity-50"
        >
          {saving ? 'Salvando...' : saveSuccess ? '✓ Persona Salva!' : '💾 Salvar Persona nas Políticas'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Persona Configuration */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg backdrop-blur-md space-y-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <span>🎭</span> Configuração da Persona
            </h2>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Nome da Empresa (Provedor)</label>
              <input
                type="text"
                value={persona.companyName}
                onChange={(e) => setPersona({ ...persona, companyName: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Nome do Assistente Virtual</label>
              <input
                type="text"
                value={persona.assistantName}
                onChange={(e) => setPersona({ ...persona, assistantName: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Tom de Voz</label>
              <input
                type="text"
                value={persona.tone}
                onChange={(e) => setPersona({ ...persona, tone: e.target.value })}
                placeholder="Ex: Consultivo, amigável, técnico..."
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Horário de Atendimento Humano</label>
              <input
                type="text"
                value={persona.supportHours}
                onChange={(e) => setPersona({ ...persona, supportHours: e.target.value })}
                placeholder="Ex: Seg a Sex 08h às 20h"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Regras Específicas / Diretrizes</label>
              <textarea
                rows={4}
                value={persona.customRules}
                onChange={(e) => setPersona({ ...persona, customRules: e.target.value })}
                placeholder="Regras adicionais para o System Prompt..."
                className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Prompt Preview Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg">
            <h3 className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
              <span>📜</span> Prévia do System Prompt Injetado
            </h3>
            <pre className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-[10px] text-cyan-300/80 font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto max-h-48">
{`Você é ${persona.assistantName}, assistente virtual oficial da ${persona.companyName}.
Tom de voz: ${persona.tone}.
Horário humano: ${persona.supportHours}.
Regras extras:
${persona.customRules || 'Nenhuma regra extra.'}`}
            </pre>
          </div>
        </div>

        {/* Right Column: Interactive Test & Inspector */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg backdrop-blur-md">
            <h2 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
              <span>🧪</span> Simulação de Mensagem do Cliente
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Teste frases com múltiplos assuntos (ex.: problema de conexão + pedido de PIX ou cancelamento).
            </p>

            <form onSubmit={handleSimulate} className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  placeholder="Digite a mensagem de teste..."
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-cyan-950/40 hover:brightness-110 active:scale-95 disabled:opacity-50 transition"
                >
                  {loading ? 'Executando...' : 'Testar Turno ⚡'}
                </button>
              </div>

              {/* Sample quick test prompts */}
              <div className="flex flex-wrap gap-2 pt-1 text-[11px]">
                <span className="text-slate-500 self-center">Testes Rápidos:</span>
                {[
                  'minha internet caiu e quero a 2 via da fatura',
                  'quero cancelar meu plano de internet agora',
                  'qual o plano de 1 giga e como faço para contratar?',
                  'me manda o código pix para pagar minha fatura atrasada',
                ].map((sample, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setTestMessage(sample)}
                    className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/40 transition"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </form>
          </div>

          {/* Results Inspector */}
          {result && (
            <div className="rounded-2xl border border-cyan-500/30 bg-slate-900/90 p-5 shadow-xl backdrop-blur-md space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <span className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                  <span>✨</span> Resposta & Diagnóstico do Orquestrador
                </span>
                <div className="flex items-center gap-1.5">
                  {result.detectedIntents.map((intent, i) => (
                    <span
                      key={i}
                      className="rounded-full bg-cyan-500/20 border border-cyan-500/40 px-2 py-0.5 text-[10px] font-mono font-semibold text-cyan-300"
                    >
                      {intent}
                    </span>
                  ))}
                </div>
              </div>

              {/* Assistant Message Bubble */}
              <div>
                <span className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Resposta ao Cliente ({persona.assistantName}):
                </span>
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed shadow-inner">
                  {result.reply}
                </div>
              </div>

              {/* Decision Rationale */}
              {result.decisionRationale && (
                <div>
                  <span className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Justificativa da Decisão (Policy / Orquestrador):
                  </span>
                  <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-2.5 text-[11px] text-slate-400 font-mono">
                    {result.decisionRationale}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
