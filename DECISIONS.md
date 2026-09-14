# DECISIONS

Registro de decisões técnicas tomadas de forma autônoma, conforme seção 0.2 do prompt de execução.
Formato por entrada: data, fase, decisão, alternativas consideradas, justificativa, reversibilidade.

---

## 2026-09-14 — Fase 1 — Gerenciador de pacotes: pnpm workspaces

**Alternativas:** npm workspaces, yarn workspaces, pnpm workspaces, Turborepo/Nx completo.
**Decisão:** pnpm workspaces simples (sem Turborepo/Nx) com 3 pacotes: `@ispagent/web`, `@ispagent/api`, `@ispagent/shared`.
**Justificativa:** pnpm já disponível no ambiente, instalação mais rápida e com menos duplicação de node_modules,
suficiente para 2 apps + 1 pacote compartilhado sem a complexidade adicional de um build-system dedicado.
**Reversibilidade:** alta — migrar para Turborepo depois é incremental, não quebra contratos.

## 2026-09-14 — Fase 1 — ORM: Prisma

**Alternativas:** Prisma, TypeORM, Drizzle.
**Decisão:** Prisma.
**Justificativa:** melhor DX para migrations versionadas e determinísticas (necessário para o seed determinístico
da seção 9), tipagem gerada automaticamente reduz risco de dessincronia com `@ispagent/shared`, e integra bem
com NestJS via `@prisma/client` injetável.
**Reversibilidade:** média — schema Prisma pode ser portado para TypeORM/Drizzle, mas exigiria reescrever
repositórios.

## 2026-09-14 — Fase 1 — Backend: NestJS (conforme seção 8, sem alternativa avaliada)

**Decisão:** NestJS + TypeScript, módulos por domínio (auth, tenancy, conversation, identity, tools, policy,
agent, erp, pulseisp, channels, handoff, audit).
**Justificativa:** imposto pela seção 8 do prompt; NestJS dá DI, guards (tenant/RBAC) e pipes (validação Zod)
de forma nativa, o que mapeia diretamente no pipeline obrigatório da seção 4.

## 2026-09-14 — Fase 1 — Worker como processo separado dentro de `@ispagent/api`

**Alternativas:** pacote `@ispagent/worker` dedicado; worker embutido no mesmo processo da API.
**Decisão:** o container `ispagent-worker` roda o mesmo código-fonte de `@ispagent/api` (`apps/api`), com um
entrypoint alternativo (`src/worker.main.ts`) que só inicializa os processors BullMQ, sem HTTP.
**Justificativa:** a seção 2 exige um serviço `ispagent-worker` distinto, mas a seção 8 só lista os pacotes
`web`, `api`, `shared` — não `worker`. Compartilhar o código evita duplicar tipos/DTOs/regras de negócio entre
dois pacotes TypeScript separados. Dockerfile do worker usa o mesmo build, comando diferente.
**Reversibilidade:** alta — extrair para pacote próprio depois é um refactor mecânico.

## 2026-09-14 — Fase 1 — AI Provider real: Anthropic (Claude)

**Alternativas:** OpenAI, Anthropic, nenhum (só Mock).
**Decisão:** implementar `AnthropicProvider` como provider real primário, com `MockAIProvider` sempre disponível
como fallback quando `ISPAGENT_ANTHROPIC_API_KEY` não estiver setada. `OpenAIProvider` fica estruturado
(interface implementada) mas não é o caminho testado no `verify`, dado que só uma chave será validada nesta
sessão.
**Justificativa:** documentação oficial da Anthropic é a que pode ser validada com mais confiança neste
ambiente; usar o SDK oficial `@anthropic-ai/sdk`.
**Reversibilidade:** alta — troca de provider é config, a interface `AIProvider` já abstrai isso.

## 2026-09-14 — Fase 1 — Knowledge Base: PostgreSQL full-text search (sem pgvector nesta fase)

**Alternativas:** pgvector com embeddings, busca full-text nativa do Postgres (`tsvector`/`tsquery`).
**Decisão:** busca full-text nativa do Postgres para o MVP; interface do `KnowledgeTool` desenhada para trocar
por embeddings depois sem mudar o contrato de domínio.
**Justificativa:** embeddings dependem de um serviço externo (ou de rodar um modelo local), o que violaria a
regra de "nada exige instalação local além de Docker" se não houver fallback robusto; full-text já é
"utilizável" e determinístico para o seed DEMO.
**Reversibilidade:** média — trocar o mecanismo de busca no `KnowledgeTool` sem mudar a assinatura pública.

## 2026-09-14 — Fase 2 — `runWithTenant` sempre aguarda `fn()` internamente

**Contexto:** `apps/api/src/common/tenant-context.ts` propaga o tenant via `AsyncLocalStorage`. Primeira
implementação (`tenantAls.run({tenantId}, fn)`, sem `await` interno) falhava silenciosamente com
`Customer`/`TenantPolicyConfig`/etc.: a extensão do Prisma via `[tenant-isolation] ... nenhum contexto de
tenant ativo`, mesmo dentro de `runWithTenant(...)`.
**Causa raiz:** `prisma.model.findX(...)` devolve um thenable **preguiçoso** — nada é despachado até
`.then()`/`await` ser chamado nele. Sem `await` dentro do callback passado a `als.run()`, esse `.then()`
só acontecia no `await runWithTenant(...)` do chamador, já fora da janela síncrona em que o
`AsyncLocalStorage` mantém o contexto ativo.
**Decisão:** `runWithTenant` agora é `async` e faz `return await fn()` dentro do próprio callback de
`als.run()`, garantindo que o despacho da query aconteça enquanto o contexto ainda está ativo.
**Reversibilidade:** alta — é um detalhe de implementação interno, não muda a assinatura pública usada
pelos callers (`middleware`, testes).

## 2026-09-14 — Fase 2 — bloqueio explícito quando `where.tenantId` diverge do contexto

**Contexto:** `TenantPolicyConfig.tenantId` é a própria chave primária do modelo. A extensão de
tenant-scoping originalmente fazia `where: {...args.where, tenantId: contexto}`, o que **sobrescrevia**
silenciosamente um `where.tenantId` explícito e divergente — a query não vazava dado de outro tenant, mas
devolvia o registro do tenant ERRADO (o do contexto) em vez de "não encontrado", mascarando um uso
incorreto da API.
**Decisão:** quando `where.tenantId` é passado explicitamente e diverge do tenant do contexto, a extensão
agora lança erro (`[tenant-isolation] ... tenantId divergente do contexto ativo`) em vez de sobrescrever.
**Justificativa:** falhar alto é mais seguro que mascarar; um caller nunca deveria pedir o tenantId de
outra empresa por engano e receber dado seu próprio como se fosse resposta válida.
**Reversibilidade:** alta.

## 2026-09-14 — Fase 1 — `openssl` instalado explicitamente na imagem `node:20-alpine`

**Contexto:** `ispagent-api`/`ispagent-worker` falhavam no boot com
`PrismaClientInitializationError: ... Error loading shared library libssl.so.1.1`. `node:20-alpine`
(Alpine 3.20+) só traz OpenSSL 3.x; sem o binário `openssl` instalado, o runtime do Prisma não consegue
sniffar a versão de libssl disponível e assume por padrão `openssl-1.1.x` — incompatível com a imagem.
**Decisão:** `RUN apk add --no-cache openssl` no estágio `base` do `apps/api/Dockerfile`, herdado por
build e runtime. Também setado `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]` no generator do
Prisma (`prisma/schema.prisma`) para não depender só da detecção automática.
**Reversibilidade:** alta.

## 2026-09-14 — Fase 1 — `ISPAGENT_WEB_PORT` local ajustada para 3010 (só nesta máquina)

**Contexto:** a porta 3000 já está ocupada nesta máquina de desenvolvimento por outro projeto rodando
(`pulseisp-pulseisp-web-1`, `127.0.0.1:3000->3000/tcp`), não relacionado ao ISPAgent.
**Decisão:** `.env` local usa `ISPAGENT_WEB_PORT=3010`; `.env.example` continua com `3000` (o valor
normativo da seção 2), já que o conflito é específico deste host, não do produto.
**Reversibilidade:** trivial — qualquer ambiente sem esse conflito usa o padrão de `.env.example`.

## 2026-09-14 — Fase 4 — `ToolCall.data` persistido (migration `add_tool_call_data`)

**Contexto:** o teste de idempotência (`test/idempotency.spec.ts`) encontrou que um replay via
`idempotencyKey` devolvia `data: undefined` mesmo quando a primeira execução tinha retornado um payload
real — a tabela `tool_calls` só guardava `facts`/`error`/`status`/`source`, nunca o `data` do
`ToolResult`.
**Decisão:** adicionar coluna `data Json?` a `ToolCall` (migration `20260914202237_add_tool_call_data`) e
persistir/reidratar o campo no `ToolExecutorService`.
**Justificativa:** princípio 1.7 (idempotência em toda escrita) exige que um retry devolva o mesmo
resultado observável da primeira execução — não só o mesmo `status`, mas o mesmo payload que o agente
usaria para responder ao cliente (ex.: o ID do chamado criado).
**Reversibilidade:** alta — coluna aditiva, nenhuma migration anterior precisou mudar.

## 2026-09-14 — Fase 4 — `ToolStatus` ganha `INVALID_INPUT`

**Decisão:** adicionado `INVALID_INPUT` ao union `ToolStatus` em `packages/shared` para representar
entrada rejeitada pela validação de schema (Zod), antes mesmo da Policy Engine avaliar a ação.
**Justificativa:** nenhum dos status existentes (`NOT_SUPPORTED`, `UPSTREAM_ERROR`, etc.) descreve
corretamente "o agente mandou um argumento inválido" — inventar um novo valor é crescer o contrato, não
mudar a semântica de um já existente (permitido pela seção 3.4).
**Reversibilidade:** alta.

## 2026-09-14 — Fase 4 — `tenantId` explícito em todo `create()`, extensão como defesa extra

**Contexto:** o tipo gerado pelo Prisma para `XCreateInput` exige `tenantId` no `data` de qualquer
`create()` em modelo tenant-scoped — a extensão de tenant-scoping injeta o valor em RUNTIME, mas isso não
satisfaz o TYPE CHECK em tempo de compilação.
**Decisão (reafirmada da Fase 3, agora também em `tool-executor.service.ts`):** todo `create()` passa
`tenantId` explicitamente (via `currentTenantId()`), com a extensão do Prisma como camada de segurança
adicional, não a única fonte da garantia.
**Reversibilidade:** alta.

## 2026-09-14 — Fase 6 — testes rodam com `jest --runInBand`

**Contexto:** `tools.spec.ts`, `billing.spec.ts`, `support.spec.ts` e `agent.spec.ts` alternam flags de
`TenantPolicyConfig` (`canCreateTicket`, `canAccessBilling`) temporariamente e restauram no `finally`.
Rodando em paralelo (workers default do Jest), um arquivo podia observar o flag no estado temporário de
OUTRO arquivo (mesma linha na tabela real do Postgres, sem isolamento de transação entre testes) —
`tools.spec.ts` falhava de forma não-determinística com `BLOCKED_BY_POLICY` em vez de `OK`.
**Decisão:** `apps/api/package.json` roda `jest --runInBand` (serial, um processo). Corrige a causa raiz
(estado real compartilhado, não FS/mock), não só sintoma.
**Justificativa:** estes são testes de integração contra um Postgres real e compartilhado — paralelizar
sem isolar transação por teste é inerentemente frágil; serializar é a correção direta e simples para o
tamanho atual da suíte.
**Reversibilidade:** alta — se a suíte crescer a ponto de o tempo serial incomodar, a alternativa é dar a
cada teste seu próprio tenant efêmero (criar/derrubar tenant por teste) em vez de reusar
`tnt_demo_alpha`/`tnt_demo_beta`.

## 2026-09-14 — Fase 6 — `@Optional()` no parâmetro de teste do `AnthropicProvider`

**Contexto:** `ispagent-api` falhava no boot em Docker com `Nest can't resolve dependencies of the
AnthropicProvider`. `AnthropicProvider` recebe um `client?: Pick<Anthropic,'messages'>` opcional no
constructor (só para injeção manual em teste, sem precisar de chave real) — sem `@Optional()`, o Nest
tenta resolver esse parâmetro como uma dependência de DI de verdade e falha, mesmo o parâmetro sendo
opcional em TypeScript.
**Decisão:** `@Optional()` (`@nestjs/common`) no parâmetro.
**Nota lateral (não é bug de produto):** durante a mesma investigação, `pnpm --filter @ispagent/api
build` local passou a emitir um `dist/` incompleto (só os assets copiados, sem `.js` nenhum) — causa foi
um `tsconfig.build.tsbuildinfo` (cache incremental do tsc) dessincronizado depois de várias rodadas de
build/rm manuais nesta sessão. `.gitignore` já exclui `*.tsbuildinfo` e o Dockerfile nunca copia esse
arquivo para dentro da imagem (`.dockerignore`), então isso nunca afetou o build em Docker nem afetaria
uma call limpa — é só um artefato de iteração local, resolvido apagando o arquivo.
**Reversibilidade:** alta.

## 2026-09-14 — Fase 1 — Portas e identidade do projeto

**Decisão:** seguir literalmente a tabela da seção 2 (web 3000, api 3001, db 5433, redis 6380; banco
`ispagent`; prefixo de env `ISPAGENT_`).
**Justificativa:** normativo, sem ambiguidade a resolver.
