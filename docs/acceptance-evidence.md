# Evidências de Aceitação

Cruzamento dos critérios P0 (seção 11) com a evidência real que os comprova — testes automatizados
(`apps/api/test/*.spec.ts`) e/ou artefatos de `.\scripts\verify.ps1` em `artifacts/verification/evidence/`.

| ID | Critério | Evidência |
|---|---|---|
| P0.1 | Cliente conhecido identificado no contrato correto | `apps/api/test/identity.spec.ts` (6/6) + `artifacts/verification/evidence/customer-resolution.json` |
| P0.2 | Pergunta financeira executa `BillingTool` de fato, resposta deriva do resultado | `apps/api/test/billing.spec.ts` (4/4) + `apps/api/test/agent.spec.ts` + `evidence/billing-tool.json` (toolCallId real, `Claim.evidence` apontando pra ele) |
| P0.3 | Resposta sobre problema técnico cita só fatos retornados | `apps/api/test/claims.spec.ts` (invariante isolado) + `apps/api/test/pulseisp.spec.ts` (cenário real: facts sem `rxDbm` no caso coletivo, resposta nunca menciona "óptico") |
| P0.4 | Com PulseISP mock, coletivo muda comportamento; sem PulseISP produto funciona | `apps/api/test/pulseisp.spec.ts` (mesma conversa, flag ligada/desligada) + `evidence/pulseisp-diagnostic.json` + `evidence/collective-incident-response.json` |
| P0.5 | Handoff gera resumo, entra na fila, atendente assume, IA para de responder | `apps/api/test/handoff.spec.ts` (6/6, inclui contagem de `AgentRun` antes/depois do takeover) + `evidence/handoff.json` |
| P0.6 | Ação bloqueada pela policy nunca executa | `apps/api/test/tools.spec.ts` (espião no adapter, zero chamadas) + `evidence/policy-block.json` |
| P0.7 | Cliente ambíguo/não identificado nunca vinculado ao contrato errado | `apps/api/test/identity.spec.ts` + `apps/api/test/conversation.spec.ts` + `apps/api/test/agent.spec.ts` (`cus_demo_g`/`cus_demo_g2`, `cus_demo_h`) |
| P0.8 | Tenant A não acessa dado do tenant B | `apps/api/test/tenancy.spec.ts` (8/8) + `evidence/tenant-isolation.txt` |
| P0.9 | Prompt injection (mensagem e documento de KB) não altera privilégio | `apps/api/test/security.spec.ts` (4/4, os 3 payloads da seção 11 + reafirmação ADMIN) + `evidence/prompt-injection.json` |
| P0.10 | `verify.ps1 -Fresh` builda e valida o ambiente do zero | ver resultado no Relatório Final e `artifacts/verification/summary.json` |

## Como reproduzir

```powershell
.\scripts\verify.ps1 -Fresh
```

Gera/atualiza todos os arquivos em `artifacts/verification/evidence/` a partir de chamadas HTTP reais
contra a stack Docker recém-construída — nenhum arquivo aqui é escrito à mão.

## Testes automatizados — cobertura por arquivo

| Arquivo | O que prova |
|---|---|
| `tenancy.spec.ts` | P0.8 |
| `identity.spec.ts` | P0.1, P0.7 |
| `conversation.spec.ts` | idempotência de conversa/identidade |
| `tools.spec.ts` | pipeline de ferramentas, P0.6 |
| `policy.spec.ts` | Policy Engine isolada |
| `idempotency.spec.ts` | princípio 1.7 |
| `erp.spec.ts` | `MockERPAdapter` contra os 8 cenários do seed |
| `billing.spec.ts` | P0.2 |
| `support.spec.ts` | abertura/consulta de chamado, idempotência |
| `claims.spec.ts` | invariante de `Claim`/evidence (seção 3.4) |
| `knowledge.spec.ts` | Knowledge Base (full-text) |
| `agent.spec.ts` | Agent Orchestrator ponta a ponta |
| `pulseisp.spec.ts` | P0.3, P0.4 |
| `handoff.spec.ts` | P0.5 |
| `security.spec.ts` | P0.9 |

**87 testes, 15 arquivos, 100% verdes** (`pnpm --filter @ispagent/api test`) na última execução desta
sessão.
