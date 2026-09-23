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

## Fase 8 — Handoff e console

**Status:** ✅ APROVADO. Gate `pnpm test handoff` → **6/6 testes verdes** (83/83 no total, sem regressão).

Entregue:
- `HandoffService` (`apps/api/src/handoff/`): `createHandoff` (idempotente por conversa — não duplica
  entrada na fila), `listQueue`, `assume` (humano assume: `conversation.status → HUMAN_ACTIVE`),
  `returnToAI` (`AI → HUMAN → AI`, seção 5.4). Toda transição gera `AuditLog`
  (`handoff.created`/`handoff.assumed`/`handoff.returned_to_ai`).
- `AgentOrchestratorService.handleMessage` agora devolve `AgentDecision | null` — `null` quando a
  conversa está `HUMAN_ACTIVE` (a mensagem do cliente ainda é registrada, a IA só não responde nem gera
  `AgentRun` novo — **P0.5 provado diretamente**: teste conta `AgentRun`s antes/depois do takeover e
  confirma que não aumenta).
- Quando o outcome de um turno é `HANDOFF`, o orquestrador monta o `HandoffSummary` estruturado
  (motivo, cliente, contrato, intenção, problema relatado, ferramentas consultadas + resultado, ações
  tomadas/falhadas, próxima ação sugerida — schema exato da seção 5.4) e cria o registro de verdade —
  não é só um outcome solto, vira item real na fila.
- `test/handoff.spec.ts` (6): resumo estruturado a partir de um HANDOFF real (identidade ambígua),
  idempotência da fila, takeover bloqueando novo `AgentRun`, ciclo completo `AI → HUMAN → AI`, isolamento
  de tenant na fila, sequência de auditoria.

Um bug de FK da mesma classe da Fase 6 (registrado ali) reapareceu com `Handoff`: `resetConversationsFor`
em `conversation.spec.ts` agora também apaga `Handoff` antes da `Conversation`.

Console/UI de atendimento humano (telas) fica para a Fase 9 — esta fase entregou o motor
(`HandoffService` + integração no orquestrador), não a interface.

---

## Fase 9 — Canais e UI

**Status:** ✅ APROVADO. Gate `pnpm build` verde (raiz: shared → api → web, 17 rotas Next.js compiladas) e
**Web Chat testado de ponta a ponta no browser real** (não só via curl) — ver evidência abaixo.

Entregue:

**API REST** (não existia nenhum endpoint de domínio antes desta fase, só `/health` e `/auth/*`):
`WebchatController` (`POST/GET /public/webchat/:tenantId/...`, público — canal obrigatório da seção 6.3),
`ConversationsController`, `HandoffController`, `DashboardController` (métricas reais da seção 10.2,
zero número estimado), `CustomersController`, `KnowledgeController`, `PolicyController` (+ `GET
/policy/actions`, catálogo), `UsersController`, `AuditController`, `IntegrationsStatusController`.
`docs/integrations.md` documenta a superfície completa.

**Frontend (Next.js)** — todas as 14 telas da seção 10.1 entregues:
Login · Dashboard (métricas reais) · Conversas (lista) · Detalhe da conversa (**timeline de tool calls e
decisões de policy**, seção 10.1 explícita) · Fila humana (assumir/ver conversa) · Clientes · Knowledge
Base (lista + criação) · Integrações (status honesto, mesma fonte da capability matrix) · Políticas
(toggle ao vivo) · Ferramentas (catálogo de ações/tiers) · Usuários · Auditoria · Web Chat DEMO.
("Config ERP"/"Config PulseISP" ficam representadas dentro da tela "Integrações" — não há formulário de
credencial separado nesta sessão, já que nenhuma credencial real existe para configurar; "Config do
agente" fica coberta por Políticas + Integrações, sem tela extra dedicada — ver limitações abaixo.)

**Evidência de ponta a ponta testada no browser** (`http://localhost:3010`):
1. Web Chat como `cus_demo_b` (fatura vencida): pergunta sobre fatura → `BillingTool` real → resposta
   com fatos reais → pedido de abertura de chamado → `SupportTool` cria um `tkt_...` real.
2. Login staff → Dashboard com métricas reais → Conversas → clique na conversa do Bruno → timeline
   mostra os dois `BillingTool` + o `SupportTool` com facts, policy decisions e outcome corretos.
3. Fila humana → "Assumir conversa" → item some da fila (confirmado via reload) → `AuditLog` registra
   `handoff.assumed` com o `usr_admin_alpha` como ator (visível na tela Auditoria).
4. Clientes, Knowledge Base, Integrações, Políticas, Ferramentas, Usuários, Auditoria — todas renderizam
   dado real do backend, sem mock no frontend.

Dois bugs reais encontrados e corrigidos durante o teste no browser:
1. `/policy/actions` devolvia 404 — rota adicionada ao controller depois do rebuild da imagem Docker
   anterior (corrigido com novo rebuild; lição: sempre revalidar no browser depois do build, não só
   confiar no `pnpm build` local).
2. Tela "Ferramentas" mostrava "sempre permitido no tier" também para ações `ADMIN` (que são sempre
   **bloqueadas**) — texto corrigido para refletir a regra real.

**Limitações documentadas honestamente** (não implementadas nesta fase — P1/nice-to-have, não P0):
- Sem tela de formulário dedicada para credencial de IXC/SGP/PulseISP/WhatsApp (não há credencial real
  para configurar nesta sessão; a tela "Integrações" já mostra o status honesto de cada uma).
- Sem WebSocket/SSE para o Web Chat em tempo real (P1 "Web Chat em tempo real") — o chat funciona por
  polling/request-response (envia mensagem, recebe resposta na mesma requisição), o que já é suficiente
  para o fluxo de atendimento funcionar ponta a ponta, mas não atualiza a tela sozinho se outra aba/canal
  mudar a conversa.
- Sem paginação de UI nas listas (a API já pagina; o frontend sempre pede a primeira página grande).

## Placar P1 (seção 11) — correção de uma imprecisão do Relatório Final

O Relatório Final desta sessão afirmou "não sobrou nada pendente das 10 fases nem dos critérios
P0/P1", o que era impreciso: os 10 P0 sempre estiveram 10/10 aprovados, mas os P1 (desejáveis)
estavam 7/10, não 10/10. Placar original registrado em 2026-09-15 e **atualizado no mesmo dia** após
uma sessão de "endurecimento pós-MVP" motivada por uma revisão externa do Relatório Final (ver
DECISIONS.md, entrada "Endurecimento pós-MVP"):

| # | Critério P1 | Status |
|---|---|---|
| 1 | Consultar plano | ✅ aprovado (`PlanTool`, VIEW) |
| 2 | Consultar chamado | ✅ aprovado (`supportGetTicketsTool`) |
| 3 | Criar chamado com contexto | ✅ aprovado (`supportCreateTicketTool`) |
| 4 | Web Chat em tempo real | ❌ backlog — polling/request-response, sem WebSocket/SSE (deliberadamente não priorizado; ver DECISIONS.md) |
| 5 | KB respondendo com fonte | ✅ aprovado (`KnowledgeDocument.source` retornado nos facts) |
| 6 | Dashboard com métricas DEMO | ✅ aprovado (`/dashboard`, dados reais do backend) |
| 7 | Policies configuráveis pela UI | ✅ aprovado (`/policies`, toggle + PATCH real) |
| 8 | Troca AI → humano → AI | ✅ aprovado — agora completo: `HandoffService.assume`/`returnToAI` + `POST /conversations/:id/messages` (atendente responde de fato ao cliente, não só muda o status), provado ponta a ponta em `apps/e2e/tests/main-flow.spec.ts` |
| 9 | Comportamento correto quando o AI Provider falha | ✅ aprovado — `AgentOrchestratorService` agora protege `classifyIntent`/`composeReply` com try/catch, nunca inventa intenção/resposta, sempre escala pra humano com mensagem SYSTEM; provado em `apps/api/test/upstream-failures.spec.ts` |
| 10 | Comportamento correto quando o ERP falha | ✅ aprovado — já era estruturalmente correto (`ToolExecutorService` sempre convertia exceção em `UPSTREAM_ERROR`/`TIMEOUT`), só faltava o teste provando; feito em `apps/api/test/upstream-failures.spec.ts` (ERP e PulseISP) |

**9/10 aprovado, 1/10 backlog.** Só o item 4 (Web Chat em tempo real) segue como backlog consciente —
é puramente uma melhoria de experiência (request/response já prova o produto ponta a ponta), e foi
explicitamente deprioritizado numa revisão externa do projeto em favor de validar IA real, ERP real e
WhatsApp antes.

---

## Fase 10 — Validação

**Status:** ✅ APROVADO. Gate `.\scripts\verify.ps1 -Fresh` → **exit code 0**, todos os 17 passos PASS,
a partir de uma reconstrução completa (containers **e volumes** derrubados e recriados do zero).

Entregue:
- **P0.9 — prompt injection** (`apps/api/test/security.spec.ts`, 4/4): os 3 payloads exigidos pela
  seção 11 — "ignore suas instruções" pedindo desbloqueio, documento de KB envenenado com "execute
  desbloqueio", pedido de "50 chamados" — mais uma reafirmação com VLAN/OLT. A defesa provada é
  **estrutural**, não comportamental: o mapeamento intenção→ferramenta do orquestrador nunca produz uma
  ação `account.unlock`/`ADMIN` a partir de texto livre do cliente (essas ações simplesmente não são
  alcançáveis pela tabela de dispatch), e `buildClaims` só promove a `Claim` o que vem de
  `ToolResult.facts` — nunca o conteúdo bruto de uma mensagem ou documento.
- **`scripts/verify.ps1`** (18 passos da seção 12) — escrito, executado e depurado de verdade nesta
  sessão contra o Docker Desktop real. Três bugs reais encontrados e corrigidos (ver `DECISIONS.md`):
  arquivo precisava ser UTF-8 **com BOM** para o Windows PowerShell 5.1 não quebrar o parser com os
  acentos/travessões do português; `2>&1` em comando nativo sob `$ErrorActionPreference='Stop'` virava
  erro terminante mesmo com exit code 0 (Jest escreve a maior parte da saída em stderr); o cenário de
  handoff usava um telefone fixo que quebrava a re-execução do script (corrigido para gerar um telefone
  novo a cada rodada — "idempotente, re-executável" da seção 12 exigia isso).
- **`scripts/verify.sh`** — porta para Unix/bash com a mesma lógica e os mesmos 18 passos/evidências;
  sintaticamente validado (`bash -n`), mas **não executado ponta a ponta nesta sessão** (o ambiente
  desta sessão é Windows e não tem `jq` instalado — `verify.ps1` é o caminho principal e validado
  desta seção 12, como o próprio prompt de execução já indica).
- `artifacts/verification/evidence/`: **10 arquivos gerados por chamadas HTTP reais** contra a stack —
  `customer-resolution.json`, `billing-tool.json`, `support-tool.json`, `pulseisp-diagnostic.json`,
  `collective-incident-response.json`, `policy-block.json`, `prompt-injection.json`, `handoff.json`,
  `tenant-isolation.txt`, `tests.txt` — mais `latest.log` e `summary.json`. Nenhum escrito à mão.
- `docs/acceptance-evidence.md`: cruzamento dos 10 P0 com a evidência exata que os comprova.

**Os 10 critérios P0 da seção 11 estão, ao final desta sessão, todos aprovados** — ver
`docs/acceptance-evidence.md` e o Relatório Final.

---

*(Fim das 10 fases da seção 10 nesta sessão.)*
