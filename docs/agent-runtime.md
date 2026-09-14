# Agent Runtime

## Fluxo de um turno (`AgentOrchestratorService.handleMessage`)

```
mensagem do cliente
  → appendMessage (CUSTOMER)
  → resolveIdentity (Fase 3 — idempotente, nunca vincula cliente incerto)
  → classifyIntent (AIProvider — regras no MockAIProvider, LLM no AnthropicProvider)
  → cria AgentRun (intent, promptVersion, model, mode)
  → seleciona ferramenta:
      - intenção de conta (FINANCEIRO/PLANO/CHAMADO/...) + identidade confirmada → BillingTool/PlanTool/SupportTool
      - qualquer outro caso → KnowledgeTool
  → PolicyEngine.evaluate(action) — registrado em policyDecisions
  → ToolExecutorService.run(...) — pipeline completo da Fase 4 (schema → policy → confirmação → execução → auditoria)
  → buildClaims: 1 Claim FACT por fact do ToolResult, evidence = "toolCallId#facts.path"
  → ClaimValidatorService.assertValid — invariante da seção 3.4; violação força outcome=HANDOFF
  → composeReply (AIProvider) — só recebe os fatos já validados, nunca o ToolResult inteiro
  → appendMessage (AGENT)
  → atualiza AgentRun com outcome/claims/policyDecisions
  → devolve AgentDecision
```

## outcome

| outcome | quando |
|---|---|
| `ANSWERED` | ferramenta executou com sucesso (`OK`) e não era uma ação de escrita |
| `ACTION_EXECUTED` | `SupportTool` criou um chamado de verdade |
| `AWAITING_CONFIRMATION` | policy exigiu confirmação (`NEEDS_CONFIRMATION`) — nada foi executado |
| `BLOCKED` | policy bloqueou a ação (`BLOCKED_BY_POLICY`) — nada foi executado |
| `HANDOFF` | invariante de Claim violado, OU intenção de conta sem identidade confirmada (ambígua/não encontrada) |

## Limites ainda não implementados nesta fase

- `maxToolCallsPerTurn`/`maxTokensPerTurn` (seção 4): a config existe em `TenantPolicyConfig`, mas o
  orquestrador desta fase só chama **uma** ferramenta por turno (não há loop multi-tool ainda) — o
  limite não tem o que enforcar de verdade até um agente com loop mais rico existir. Registrado como
  limitação real, não escondido.
- Compactação de histórico (seção 5.2) para conversas longas: não implementada — cada turno só usa a
  mensagem atual, não a transcrição completa, então o problema que a compactação resolveria ainda não
  se manifesta neste desenho simples.
