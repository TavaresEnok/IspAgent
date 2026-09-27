'use client';

import type { ReactNode } from 'react';
import {
  FLOW_DEPARTMENT_LABEL,
  FLOW_LIMITS,
  FLOW_LOOKUP_LABEL,
  FLOW_NODE_LABEL,
  type FlowAskKind,
  type FlowConditionOp,
  type FlowDepartment,
  type FlowLookup,
  type FlowNode,
} from '@ispagent/shared';
import { BLOCK_STYLE, newId } from './model';

const input =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:border-cyan-500 focus:outline-none disabled:opacity-60';

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {children}
      {hint && <span className="text-[10px] leading-snug text-slate-500">{hint}</span>}
    </label>
  );
}

/** Caixa de texto com atalhos de variáveis ({{primeiro_nome}}, {{empresa}} e as das perguntas). */
function TextWithVars({
  value,
  onChange,
  vars,
  disabled,
  rows = 4,
}: {
  value: string;
  onChange: (v: string) => void;
  vars: string[];
  disabled: boolean;
  rows?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        className={`${input} resize-y`}
        rows={rows}
        maxLength={FLOW_LIMITS.maxText}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      {!disabled && (
        <div className="flex flex-wrap gap-1">
          {vars.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onChange(`${value}{{${v}}}`)}
              className="rounded-md border border-slate-700 bg-slate-800/60 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300 hover:border-cyan-500/50"
            >
              {`{{${v}}}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Inspector({
  node,
  vars,
  readOnly,
  onChange,
  onDelete,
  onDuplicate,
  onRemoveOption,
}: {
  node: FlowNode;
  /** Variáveis disponíveis nos textos. */
  vars: string[];
  readOnly: boolean;
  onChange: (next: FlowNode) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  /** Remover uma opção do menu também remove a conexão que saía dela. */
  onRemoveOption: (optionId: string) => void;
}) {
  const style = BLOCK_STYLE[node.type];
  // Atualização tipada do `data` do bloco selecionado.
  const set = (patch: Record<string, unknown>) => onChange({ ...node, data: { ...node.data, ...patch } } as FlowNode);
  const askVars = vars.filter((v) => !['nome', 'primeiro_nome', 'empresa'].includes(v));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className={`rounded-lg px-2 py-1 text-sm ${style.chip}`}>{style.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-100">{FLOW_NODE_LABEL[node.type]}</p>
          <p className="truncate font-mono text-[10px] text-slate-500">{node.id}</p>
        </div>
      </div>

      {node.type === 'start' && (
        <p className="text-xs leading-relaxed text-slate-400">
          O fluxo começa aqui na primeira mensagem do cliente. Ligue a saída ao primeiro bloco (normalmente uma saudação ou um menu).
        </p>
      )}

      {(node.type === 'message' || node.type === 'ai' || node.type === 'end' || node.type === 'handoff') && (
        <Field
          label={node.type === 'message' ? 'Mensagem' : 'Mensagem (opcional)'}
          hint={
            node.type === 'ai'
              ? 'Depois deste bloco a IA do ISPAgent assume a conversa (com as mesmas regras de segurança). Sem mensagem, a IA responde já a última fala do cliente.'
              : node.type === 'end'
                ? 'Depois do fim, as próximas mensagens do cliente são respondidas pela IA.'
                : undefined
          }
        >
          <TextWithVars value={node.data.text ?? ''} onChange={(text) => set({ text })} vars={vars} disabled={readOnly} />
        </Field>
      )}

      {node.type === 'handoff' && (
        <Field label="Setor" hint="A conversa entra na Fila Humana deste setor, com o resumo do que o cliente respondeu no fluxo.">
          <select className={input} value={node.data.department} disabled={readOnly} onChange={(e) => set({ department: e.target.value as FlowDepartment })}>
            {Object.entries(FLOW_DEPARTMENT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      )}

      {node.type === 'menu' && (
        <>
          <Field label="Pergunta do menu" hint="As opções são enviadas numeradas. O cliente pode responder com o número ou o texto.">
            <TextWithVars value={node.data.text} onChange={(text) => set({ text })} vars={vars} disabled={readOnly} rows={3} />
          </Field>
          <Field label={`Opções (${node.data.options.length}/${FLOW_LIMITS.maxOptions})`}>
            <div className="flex flex-col gap-1.5">
              {node.data.options.map((o, i) => (
                <div key={o.id} className="flex items-center gap-1.5">
                  <span className="w-5 text-right text-[11px] text-slate-500">{i + 1}.</span>
                  <input
                    className={input}
                    value={o.label}
                    maxLength={FLOW_LIMITS.maxOptionLabel}
                    disabled={readOnly}
                    onChange={(e) => set({ options: node.data.options.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)) })}
                  />
                  {!readOnly && (
                    <>
                      <button
                        type="button"
                        title="Subir"
                        disabled={i === 0}
                        onClick={() => {
                          const opts = [...node.data.options];
                          [opts[i - 1], opts[i]] = [opts[i], opts[i - 1]];
                          set({ options: opts });
                        }}
                        className="rounded px-1 text-slate-400 hover:text-slate-100 disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        title="Remover opção"
                        disabled={node.data.options.length <= 2}
                        onClick={() => onRemoveOption(o.id)}
                        className="rounded px-1 text-slate-400 hover:text-red-400 disabled:opacity-30"
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
              ))}
              {!readOnly && node.data.options.length < FLOW_LIMITS.maxOptions && (
                <button
                  type="button"
                  onClick={() => set({ options: [...node.data.options, { id: newId('op'), label: `Opção ${node.data.options.length + 1}` }] })}
                  className="self-start rounded-lg border border-dashed border-slate-600 px-2 py-1 text-[11px] text-slate-300 hover:border-cyan-500"
                >
                  + opção
                </button>
              )}
            </div>
          </Field>
        </>
      )}

      {node.type === 'ask' && (
        <>
          <Field label="Pergunta">
            <TextWithVars value={node.data.text} onChange={(text) => set({ text })} vars={vars} disabled={readOnly} rows={3} />
          </Field>
          <Field label="Tipo de resposta" hint="A resposta é validada; inválida, a pergunta é repetida (até o limite de tentativas).">
            <select className={input} value={node.data.kind} disabled={readOnly} onChange={(e) => set({ kind: e.target.value as FlowAskKind })}>
              <option value="cpf">CPF ou CNPJ</option>
              <option value="text">Texto livre</option>
              <option value="email">E-mail</option>
              <option value="phone">Telefone</option>
            </select>
          </Field>
          <Field label="Guardar em" hint="Use depois como {{nome_da_variavel}} nos textos ou numa Condição.">
            <input
              className={`${input} font-mono`}
              value={node.data.variable}
              disabled={readOnly}
              onChange={(e) => set({ variable: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 31) })}
            />
          </Field>
          <Field label="Se a resposta for inválida (opcional)">
            <TextWithVars value={node.data.invalidText ?? ''} onChange={(invalidText) => set({ invalidText })} vars={vars} disabled={readOnly} rows={2} />
          </Field>
        </>
      )}

      {node.type === 'identify' && (
        <Field
          label="Documento em"
          hint="Mesmas regras do atendimento: só CPF/CNPJ completo e exato identifica, com limite de tentativas contra adivinhação. Já identificado? Segue direto por “encontrado”."
        >
          <select className={input} value={node.data.variable} disabled={readOnly} onChange={(e) => set({ variable: e.target.value })}>
            {[...new Set([node.data.variable, ...askVars])].map((v) => (
              <option key={v} value={v}>
                {`{{${v}}}`}
              </option>
            ))}
          </select>
        </Field>
      )}

      {node.type === 'lookup' && (
        <Field label="Consulta" hint="A resposta é montada só com os dados do SGP (nada inventado). Precisa do cliente identificado antes.">
          <select className={input} value={node.data.query} disabled={readOnly} onChange={(e) => set({ query: e.target.value as FlowLookup })}>
            {Object.entries(FLOW_LOOKUP_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      )}

      {node.type === 'ticket' && (
        <Field label="Descrição do chamado" hint="Só abre se a política do provedor permitir abertura de chamados. Falhou? Segue por “falhou”.">
          <TextWithVars value={node.data.description} onChange={(description) => set({ description })} vars={vars} disabled={readOnly} rows={3} />
        </Field>
      )}

      {node.type === 'condition' && (
        <>
          <Field label="Verificar">
            <select
              className={input}
              value={node.data.mode === 'builtin' ? node.data.builtin : 'variable'}
              disabled={readOnly}
              onChange={(e) =>
                onChange(
                  e.target.value === 'variable'
                    ? { ...node, data: { mode: 'variable', variable: askVars[0] ?? 'resposta', op: 'equals', value: '' } }
                    : { ...node, data: { mode: 'builtin', builtin: e.target.value as 'business_hours' | 'identified' } },
                )
              }
            >
              <option value="business_hours">Está no horário de atendimento?</option>
              <option value="identified">O cliente já foi identificado?</option>
              <option value="variable">Uma variável…</option>
            </select>
          </Field>
          {node.data.mode === 'variable' && (
            <>
              <Field label="Variável">
                <select className={input} value={node.data.variable} disabled={readOnly} onChange={(e) => set({ variable: e.target.value })}>
                  {[...new Set([node.data.variable, ...askVars])].map((v) => (
                    <option key={v} value={v}>
                      {`{{${v}}}`}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Comparação">
                <select className={input} value={node.data.op} disabled={readOnly} onChange={(e) => set({ op: e.target.value as FlowConditionOp })}>
                  <option value="equals">é igual a</option>
                  <option value="not_equals">é diferente de</option>
                  <option value="contains">contém</option>
                  <option value="is_set">foi preenchida</option>
                  <option value="is_empty">está vazia</option>
                </select>
              </Field>
              {['equals', 'not_equals', 'contains'].includes(node.data.op) && (
                <Field label="Valor" hint="Sem diferença de maiúsculas e acentos.">
                  <input className={input} value={node.data.value ?? ''} disabled={readOnly} onChange={(e) => set({ value: e.target.value })} />
                </Field>
              )}
            </>
          )}
        </>
      )}

      {!readOnly && node.type !== 'start' && (
        <div className="flex gap-2 border-t border-slate-800 pt-4">
          <button type="button" onClick={onDuplicate} className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800">
            Duplicar
          </button>
          <button type="button" onClick={onDelete} className="flex-1 rounded-lg border border-red-500/40 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10">
            Excluir bloco
          </button>
        </div>
      )}
    </div>
  );
}
