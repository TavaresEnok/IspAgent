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

*(Fases 5–10 ainda não iniciadas nesta sessão — continuam conforme `STATE.md`.)*
