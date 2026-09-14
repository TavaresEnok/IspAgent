# PROGRESS

Histórico por fase (seção 10). Cada entrada só é escrita depois que o gate da fase correspondente passa
de verdade — nunca antes, nunca por expectativa do que "deveria" funcionar.

---

## Fase 1 — Fundação

**Status:** ✅ APROVADO. Gate `docker compose up -d --wait` → exit code 0, 5/5 serviços `healthy`:

```
ispagent-ispagent-api-1      Up (healthy)   0.0.0.0:3001->3001/tcp
ispagent-ispagent-db-1       Up (healthy)   0.0.0.0:5433->5432/tcp
ispagent-ispagent-redis-1    Up (healthy)   0.0.0.0:6380->6379/tcp
ispagent-ispagent-web-1      Up (healthy)   0.0.0.0:3010->3000/tcp   (porta local ajustada, ver DECISIONS.md)
ispagent-ispagent-worker-1   Up (healthy)
```

`GET /health` (api) e `GET /api/health` (web) confirmados via curl real contra os containers.

Três bugs reais encontrados e corrigidos durante a validação (todos registrados em `DECISIONS.md`):
1. `nest build` colocava `dist/main.js` no caminho errado (`rootDir`/`include` do `tsconfig.json`
   incompletos, `prisma/seed.ts` sendo arrastado para dentro do build da API).
2. Prisma engine incompatível com OpenSSL 3.x do Alpine (`libssl.so.1.1` ausente) — corrigido com
   `binaryTargets` explícito + `apk add openssl`.
3. Server Next.js "standalone" escutando só no hostname do container (não em `0.0.0.0`) — corrigido
   fixando `HOSTNAME=0.0.0.0` no `docker-compose.yml`.

Entregue:
- Monorepo pnpm (`@ispagent/web`, `@ispagent/api`, `@ispagent/shared`), decisões em `DECISIONS.md`.
- Contratos normativos da seção 3.4 em `packages/shared`.
- `docker-compose.yml` com os 5 serviços (`ispagent-web`, `ispagent-api`, `ispagent-worker`,
  `ispagent-db`, `ispagent-redis`) e healthchecks reais (não `sleep`/placeholder).
- `apps/api`: esqueleto NestJS com `/health` consultando o Postgres de verdade.
- `apps/web`: esqueleto Next.js/Tailwind com `/api/health`.
- `apps/api/src/worker.main.ts`: processo separado do worker, conectado a Redis via BullMQ de verdade
  (fila `system`), com endpoint de health próprio.
- `.env.example` com todo o contrato de variáveis (prefixo `ISPAGENT_`), nada obrigatório para DEMO.
- `docs/integration-capability-matrix.md` (todas as integrações externas honestamente `NÃO VALIDADO` ou
  `INDISPONÍVEL` — sem credencial/documentação oficial acessível nesta sessão).
- `docs/architecture.md`.

Gate: `docker compose up -d --wait` — resultado registrado abaixo após a execução.

---

## Fase 2 — Banco e tenancy

**Status:** ✅ APROVADO. Gate `pnpm db:migrate && pnpm db:seed && pnpm test tenancy`:
- `prisma migrate dev --name init` aplicado (migration `20260914195727_init`), banco em sincronia com o schema.
- Seed rodou limpo: `2 tenants, 3 usuários, 4 planos, 9 clientes/contratos`.
- `apps/api/test/tenancy.spec.ts`: **8/8 testes verdes** (P0.8).
- Smoke test manual via curl contra a API real: login com `admin@alpha.ispagent.local` / `Demo!2026`
  devolve JWT válido; senha errada devolve `401`.

Um bug real encontrado e corrigido durante a validação (registrado em `DECISIONS.md`): `runWithTenant`
não aguardava `fn()` internamente, e como o Prisma Client devolve um thenable preguiçoso, o contexto do
`AsyncLocalStorage` já tinha sido restaurado antes da query disparar de fato — 5 dos 8 testes falhavam
com "nenhum contexto de tenant ativo" mesmo dentro de `runWithTenant(...)`. Um segundo bug (mascaramento
silencioso ao invés de bloqueio quando `where.tenantId` diverge do contexto em `TenantPolicyConfig`,
cuja PK é o próprio `tenantId`) também foi corrigido.

Entregue (parte do trabalho, ver STATE.md para o que já passou no gate):
- `prisma/schema.prisma`: tenants, users, refresh tokens, policy config, customers, contracts, plans,
  invoices, support tickets, knowledge documents, audit log, e as entidades de conversa/agente/handoff
  que a Fase 3/4 vão usar (schema desenhado em conjunto para reduzir migrations fragmentadas).
- Seed determinístico (`prisma/seed.ts`) seguindo exatamente a seção 9: 2 tenants, 3 usuários DEMO,
  4 planos, 9 registros de cliente/contrato (os 8 oficiais `cus_demo_a`..`h` + `cus_demo_g2`, criado só
  para tornar real a ambiguidade de telefone de `cus_demo_g` — ver comentário no seed).
- Auth JWT + refresh (`apps/api/src/auth`), RBAC (`Roles`/`RolesGuard`, hierarquia em
  `packages/shared/src/types/rbac.ts`).
- Isolamento de tenant na camada de dados via extensão do Prisma
  (`apps/api/src/prisma/tenant-scoped.extension.ts`) + `AsyncLocalStorage`
  (`apps/api/src/common/tenant-context.ts`) — não é checagem de controller.
- Teste P0.8 (`apps/api/test/tenancy.spec.ts`).

Gate: `pnpm db:migrate && pnpm db:seed && pnpm test tenancy` — resultado abaixo.

---

## Fase 3 — Conversa e identidade

**Status:** ✅ APROVADO. Gate `pnpm test identity conversation` → **19/19 testes verdes** (11 novos +
8 de tenancy, sem regressão).

Entregue:
- `IdentityResolutionService` (`apps/api/src/identity/`): resolução por telefone, desambiguação por
  CPF/CNPJ, e os três resultados de primeira classe da seção 5.1 — resolvido (`PHONE_EXACT`/`DOCUMENT`,
  `HIGH`/`MEDIUM` conforme o cliente tenha exatamente um contrato ativo ou não), `AMBIGUOUS` (lista de
  candidatos, nunca resolve sozinho) e `NOT_FOUND`.
- `ConversationService` (`apps/api/src/conversation/`): `findOrCreateConversation` idempotente (não
  duplica conversa por canal+usuário), `resolveIdentity` idempotente (não reexecuta a resolução uma vez
  persistida — provado com spy contando exatamente 1 chamada), `appendMessage`.
- `test/identity.spec.ts` (6 testes) e `test/conversation.spec.ts` (5 testes): cobrem P0.1 (cliente
  conhecido resolvido no contrato certo), P0.7 (`cus_demo_g`/`cus_demo_g2` — telefone ambíguo nunca
  resolve sozinho; telefone não cadastrado nunca vincula a ninguém — nem na tabela `Customer`, nem
  persistido na `Conversation`), e reafirma isolamento de tenant no contexto de identidade.

Nenhum bug de infraestrutura novo nesta fase — os três já corrigidos na Fase 1/2 continuam válidos.
Único ajuste: `tenantId` passado explicitamente em todo `create()` de domínio (além da extensão do
Prisma injetar em runtime), porque o tipo gerado pelo Prisma exige o campo no `data` — a extensão vira
defesa em profundidade, não a única fonte da garantia.

---

## Fase 4 — Tool layer e policy

**Status:** ✅ APROVADO. Gate `pnpm test tools policy idempotency` → **14/14 testes verdes** (33/33 no
total, sem regressão nas fases anteriores).

Entregue:
- `PolicyEngineService` (`apps/api/src/policy/`): catálogo de ações → tier/flag em `policy-actions.ts`,
  bloqueio estático de tier `ADMIN` (nunca depende de config de tenant — fora de escopo do MVP, seção
  14), confirmação obrigatória por padrão em `WRITE_SENSITIVE`, decisão sempre rastreável
  (tenantId/policyVersion/evaluatedAt).
- `ToolExecutorService` (`apps/api/src/tools/`): pipeline completo da seção 4 — Schema Validation (Zod)
  → Policy Engine → Confirmation Check → Execução com timeout → `ToolResult` → `ToolCall`/`AuditLog`
  persistidos. **P0.6 provado**: teste com espião no adapter mostrando zero chamadas quando a policy
  bloqueia.
- Idempotência (princípio 1.7): retry com a mesma `idempotencyKey` nunca reexecuta a ferramenta nem
  duplica o `ToolCall` — devolve o resultado (incluindo `data`) já persistido da primeira execução.
  Isolada por tenant (a mesma chave em tenants diferentes não colide).
- `test/tools.spec.ts` (5), `test/policy.spec.ts` (6), `test/idempotency.spec.ts` (3).

Um bug real encontrado e corrigido (registrado em `DECISIONS.md`): `ToolCall` não persistia o campo
`data` do `ToolResult`, então um replay idempotente devolvia `status` correto mas `data: undefined` —
corrigido com a migration `20260914202237_add_tool_call_data`.

Ferramentas usadas nos testes (`TestLookupTool`, `TestCreateTicketTool`, `TestUnlockTool`) são fixtures
só para exercitar o pipeline — as ferramentas reais (`BillingTool`, `SupportTool`, etc., ligadas a um
`ERPAdapter`) são entregável da Fase 5.

---

## Fase 5 — ERP

**Status:** ✅ APROVADO. Gate `pnpm test erp billing support` → **16/16 testes verdes** (49/49 no total,
sem regressão).

Entregue:
- `ERPAdapter` (interface, `apps/api/src/integrations/erp/`) com as capacidades da seção 6.1:
  `findCustomer`, `getCustomer`, `getContracts`, `getPlans`, `getInvoices`, `getFinancialStatus`,
  `getSupportTickets`, `createSupportTicket`, `getServiceStatus`.
- `MockERPAdapter`: **dado real do Postgres seedado**, não payload fabricado — todas as 9 capacidades
  testadas contra os cenários do seed (`cus_demo_a` saudável, `cus_demo_b` fatura vencida, `cus_demo_e`
  plano legado, `cus_demo_f` chamado aberto).
- `IXCAdapter`/`SGPAdapter`: estruturados (implementam `ERPAdapter`) mas todo método lança erro explícito
  — sem documentação oficial acessível nesta sessão, nunca fingem retornar dado real (seção 6.1 passo 4).
- `ERPModule`: seleciona o adapter ativo por `ISPAGENT_ERP_PROVIDER` (token `ERP_ADAPTER`), nenhum
  consumidor conhece IXC/SGP/Mock diretamente.
- Ferramentas reais rodando pelo `ToolExecutorService` da Fase 4: `BillingTool`, `SupportTool` (consulta
  + criação, ambas), `PlanTool` — `apps/api/src/tools/erp-tools.ts`.
- `test/erp.spec.ts` (8), `test/billing.spec.ts` (4, inclui P0.2), `test/support.spec.ts` (4).

Capability matrix atualizada: ERP DEMO passa de "planejado" para `VALIDADO` nas 4 capacidades de negócio;
IXC/SGP continuam honestamente `ESTRUTURADO, NÃO VALIDADO`.

---

## Fase 6 — Inteligência

**Status:** ✅ APROVADO. Gate `pnpm test agent claims knowledge` → **agent (8) + claims (7) + knowledge
(6) = 21 testes verdes** (68/68 no total, sem regressão).

Entregue:
- `AIProvider` (interface): `MockAIProvider` (sempre disponível, classificação por palavra-chave +
  resposta por template, `RunMode=DEMO`, **é o que roda de fato nesta sessão** —
  `ISPAGENT_ANTHROPIC_API_KEY` vazia), `AnthropicProvider` (real, SDK oficial, lógica testável mas sem
  chave para validar ponta a ponta), `OpenAIProvider` (stub estruturado, não implementado).
- `AgentOrchestratorService`: turno completo — identidade → intenção → ferramenta permitida pela policy
  → `ToolResult` → `Claim`s → resposta → auditoria. Documentado em `docs/agent-runtime.md`.
- **Invariante de `Claim`/evidence (seção 3.4) implementado e testado isoladamente**
  (`ClaimValidatorService`, `test/claims.spec.ts`, 7 testes): FACT sem evidência ou com evidência que não
  resolve para um `facts.path` real é erro de runtime — testado com FACT válido, FACT sem evidência, FACT
  apontando para `toolCallId` inexistente, FACT apontando para `facts.path` inexistente,
  INFERENCE/RECOMMENDATION/UNKNOWN sem evidência (ok), e violação single-claim derrubando a validação
  inteira.
- Knowledge Base via full-text search real do Postgres (`KnowledgeService`, `KnowledgeTool`) — 3
  documentos DEMO seedados. Documentado em `docs/knowledge-base.md`.
- `test/agent.spec.ts` (8) cobre, ponta a ponta com dado real: P0.2 (pergunta financeira →
  `BillingTool` → resposta com fato real), P0.7 (telefone ambíguo nunca chama ferramenta de conta,
  outcome `HANDOFF`), consulta e criação de chamado real (`ACTION_EXECUTED`), bloqueio por policy
  (`BLOCKED`), isolamento de tenant no fluxo completo.

Dois bugs reais encontrados e corrigidos (registrados em `DECISIONS.md`):
1. Testes rodando em paralelo (workers padrão do Jest) alternavam a mesma linha de
   `TenantPolicyConfig` no Postgres real entre arquivos diferentes, causando falha não-determinística —
   corrigido com `jest --runInBand` (suíte serializada).
2. `resetConversationsFor` (helper de `conversation.spec.ts`) violava FK ao tentar apagar uma
   `Conversation` que já tinha `AgentRun`/`ToolCall` (criados por `agent.spec.ts` usando o mesmo telefone
   real do seed) — corrigido para apagar a árvore inteira na ordem certa.

Limitações documentadas honestamente em `docs/agent-runtime.md`: sem loop multi-tool por turno ainda
(`maxToolCallsPerTurn` não tem o que enforçar de verdade nesta fase), sem compactação de histórico.

---

## Fase 7 — PulseISP

**Status:** ✅ APROVADO. Gate `pnpm test pulseisp` → **9/9 testes verdes** (77/77 no total, sem
regressão), cobrindo os dois modos da flag (P0.4).

Entregue:
- `PulseISPAdapter` (interface) consumindo só `CustomerNetworkHealth` (contrato já travado na seção
  3.4) — `MockPulseISPAdapter` (telemetria determinística por contrato, sempre funciona) e
  `RealPulseISPAdapter` (stub — sem OpenAPI validado nesta sessão).
- `PulseISPTool`: monta `facts` de forma diferente para incidente coletivo (`ctt_demo_d`, escopo `PON`,
  `affectedCustomers > 1`) vs degradação individual (`ctt_demo_c`, sinal óptico em piora) —
  estruturalmente, não por prompt, garante que a resposta nunca cita um fato que não veio do
  `ToolResult` (**P0.3**, testado diretamente com o cenário coletivo: facts sem `rxDbm`, resposta do
  `MockAIProvider` nunca menciona "óptico").
- `AgentOrchestratorService` ganhou roteamento para intenções de rede
  (`SEM_CONEXAO`/`INTERNET_LENTA`/`QUEDAS`/`SUPORTE_INTERNET`): com `ISPAGENT_PULSEISP_ENABLED=true` e
  identidade confirmada, chama `PulseISPTool`; desligada (default), cai para `KnowledgeTool` — **mesma
  conversa testada nos dois modos** (**P0.4**), sem nenhuma regressão do comportamento da Fase 6.
- `test/pulseisp.spec.ts` (9): adapter (4), tool/P0.3 (2), orchestrator com flag ligada/desligada (3).
- `docs/pulseisp-integration.md`. Capability matrix: Health Score passa a `VALIDADO` (mock).

Nenhum bug novo nesta fase — só ajuste de assinatura em `test/agent.spec.ts` (novo parâmetro do
constructor do orchestrator).

---

*(Fases 8–10 ainda não iniciadas nesta sessão — continuam conforme `STATE.md`.)*
