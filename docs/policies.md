# Policy Engine

## Onde vive

`PolicyEngineService.evaluate(action, {confirmed?})` (`apps/api/src/policy/policy-engine.service.ts`).
O modelo propõe, a Policy Engine decide (princípio 1.6) — nenhuma ferramenta executa sem passar por
`evaluate()` primeiro (ver `docs/tools.md`).

## Configuração por tenant

Tabela `tenant_policy_configs` (uma linha por tenant): `canCreateTicket`, `canAccessBilling`,
`canSendInvoice`, `canPerformUnlock`, `requiresConfirmationForUnlock`, `canQueryPulseISP`,
`canChangePlan`, `maxToolCallsPerTurn`, `maxTokensPerTurn`, `handoffAfterFailures`.

- `GET /policy` — lê a config do tenant autenticado.
- `PATCH /policy` — atualiza (só `TENANT_ADMIN`/`SUPER_ADMIN`, `@Roles`). Tela "Políticas" no painel.

## Regras fixas (não configuráveis)

- Tier `ADMIN` (VLAN, OLT, provisionamento) é **sempre bloqueado**, para todo tenant, mesmo que uma
  config futura tentasse habilitar — a checagem acontece antes de olhar qualquer flag (seção 5.5).
- Tier `WRITE_SENSITIVE` sem uma flag dedicada ainda exige confirmação por padrão (o tier já é o sinal
  — ver `PolicyEngineService.requiresConfirmation`).

## Decisão rastreável

Toda chamada a `evaluate()` devolve um `PolicyDecision` completo — `action`, `tier`, `allowed`,
`requiresConfirmation`, `reason`, `policyVersion`, `tenantId`, `evaluatedAt` — persistido em
`AgentRun.policyDecisions` e visível na timeline da tela "Detalhe da conversa".

## Catálogo de ações

Ver `docs/tools.md` e `apps/api/src/policy/policy-actions.ts` — cresce conforme novas ferramentas
entram em operação, nunca some uma ação existente nem muda seu tier silenciosamente.
