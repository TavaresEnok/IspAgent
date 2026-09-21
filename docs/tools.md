# Ferramentas (Tools)

## Pipeline (seção 4)

Toda ferramenta passa por `ToolExecutorService.run(def, input, opts)`
(`apps/api/src/tools/tool-executor.service.ts`), sem etapa pulável:

```
Schema Validation (Zod) → Policy Engine → Confirmation Check → Execução (com timeout)
  → ToolResult → ToolCall/AuditLog persistidos → devolve ao Agent Orchestrator
```

Nenhum código chama um adapter externo (ERP, PulseISP, Knowledge) fora deste pipeline.

## Catálogo

| Ferramenta | Action | Tier | Adapter |
|---|---|---|---|
| `BillingTool` | `billing.view` | READ | `ERPAdapter` |
| `SupportTool` (consulta) | `support.get_ticket` | READ | `ERPAdapter` |
| `SupportTool` (criação) | `support.create_ticket` | WRITE_LOW_RISK | `ERPAdapter` |
| `PlanTool` | `plan.view` | READ | `ERPAdapter` |
| `KnowledgeTool` | `knowledge.search` | READ | Postgres full-text |
| `PulseISPTool` | `pulseisp.query` | READ | `PulseISPAdapter` |

`GET /policy/actions` expõe o catálogo completo (incluindo ações fora de escopo do MVP, como
`network.provision_vlan`/`network.configure_olt`, tier `ADMIN`, sempre bloqueadas) — é o que alimenta a
tela "Ferramentas" do painel.

## Idempotência

`ToolRunOptions.idempotencyKey` — quando presente, um retry com a mesma chave nunca reexecuta a
ferramenta nem duplica o `ToolCall`; devolve o resultado (incluindo `data`) já persistido da primeira
execução. `AgentOrchestratorService` usa `agentrun-<id>-create_ticket` como chave para abertura de
chamado, então o mesmo turno nunca cria dois chamados por acidente (ex.: retry de rede).

## Ferramentas de teste (fixtures)

`TestLookupTool`, `TestCreateTicketTool`, `TestUnlockTool` (`apps/api/test/helpers/fixture-tools.ts`) só
existem para exercitar o pipeline isoladamente (Fase 4) — nunca aparecem em produção nem são
registradas em nenhum módulo do `apps/api/src`.
