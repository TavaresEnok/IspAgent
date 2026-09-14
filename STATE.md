# STATE
Fase atual: 6 — Inteligência (não iniciada)
Última fase com gate APROVADO: 5 — ERP (commit: ver próximo commit após este arquivo)
Último comando executado com sucesso: `pnpm --filter @ispagent/api test erp billing support` (16/16 verde, 49/49 no total) e `docker compose up -d --wait` (exit 0, 5/5 healthy)
Próxima ação concreta: escrever os testes de aceitação da Fase 6 (AIProvider + MockAIProvider, Agent Orchestrator, invariante de Claim/evidence — P0.3, Knowledge Base) antes de implementar, seguindo o loop da seção 0.6. `ISPAGENT_ANTHROPIC_API_KEY` provavelmente vazia nesta sessão — MockAIProvider é o caminho testável; documentar honestamente se o AnthropicProvider real não puder ser validado ponta a ponta.
Arquivos em edição incompleta: nenhum
Bloqueios ativos: nenhum bloqueio técnico. Limitação estrutural (não bloqueio): sem credenciais/documentação oficial de IXC, SGP, PulseISP ou WhatsApp Cloud API nesta sessão — ver docs/integration-capability-matrix.md. Todas as integrações externas seguirão o padrão adapter+DEMO das seções 6 e 0.3, nunca "fingindo" validação que não ocorreu.
Invariantes que já passam: P0.8 (tenant, 8/8), P0.1/P0.7 (identidade, 11/11), P0.6 (policy bloqueia de fato, tools.spec.ts), idempotência (princípio 1.7, 3/3), ERP DEMO real contra Postgres seedado (erp/billing/support, 16/16)

## Notas para a próxima sessão

- Ambiente local: Docker Desktop no Windows, stack sobe com `docker compose up -d --wait` (todos os 5
  serviços saudáveis). Porta web local ajustada para 3010 em `.env` (não em `.env.example`) por conflito
  com outro projeto (`pulseisp-web`) já rodando nesta máquina — ver DECISIONS.md.
- Login DEMO funcionando de ponta a ponta via HTTP real: `admin@alpha.ispagent.local` / `Demo!2026`.
- Banco: rodar `pnpm --filter @ispagent/api prisma:migrate:dev` (não `deploy`) só é necessário ao criar
  uma NOVA migration; para reaplicar em um ambiente novo, usar `pnpm db:migrate` (= `prisma migrate
  deploy`, aplica migrations já commitadas em `apps/api/prisma/migrations/`).
- Testes rodam no HOST (fora do Docker), usando a porta publicada do Postgres (5433), configurado via
  `apps/api/test/jest.setup.ts` + `.env` na raiz.
- Três armadilhas de infraestrutura já resolvidas e documentadas em `DECISIONS.md` — não as reintroduzir:
  `tsconfig.json` da API precisa de `rootDir`/`include` restritos a `src/**/*.ts`; imagem Docker precisa
  de `apk add openssl` para o Prisma funcionar em `node:20-alpine`; container `ispagent-web` precisa de
  `HOSTNAME=0.0.0.0` explícito (o server "standalone" do Next herda o `HOSTNAME` do Docker e escuta só
  nesse endereço).
- `runWithTenant(...)` (em `apps/api/src/common/tenant-context.ts`) SEMPRE aguarda `fn()` internamente —
  qualquer novo código que chame Prisma dentro de `runWithTenant` deve confiar nisso, não reintroduzir a
  versão sem `await` interno (quebra o isolamento de tenant silenciosamente com o Prisma Client).
- Schema Prisma já inclui as tabelas de conversa/agente/handoff que a Fase 3/4 vão usar (decisão
  registrada: schema desenhado em conjunto para reduzir migrations fragmentadas nesta fase inicial).
  A Fase 4 (ToolCall, AgentRun.policyDecisions/claims) já tem tabela — só migration adicional se precisar
  ALTERAR algo.
- Todo `create()` de domínio passa `tenantId: requireTenantId()` explicitamente no `data` (ver
  `apps/api/src/conversation/conversation.service.ts`), porque o tipo gerado pelo Prisma exige o campo —
  a extensão de tenant-scoping ainda injeta em runtime como defesa extra, mas não resolve o erro de tipo
  sozinha. Repetir esse padrão em qualquer novo `create()` (ex.: Fase 4 vai criar `ToolCall`, `AgentRun`).
- `IdentityResolutionService.resolveByPhone` usa `phones: { has: phone }` (filtro de array do Postgres via
  Prisma) — funciona só porque `Customer.phones` é `String[]`, não uma tabela separada.
- `ConversationService.resolveIdentity` é idempotente checando `conversation.identityMethod` antes de
  chamar a resolução de novo — mesma lógica que `ToolExecutorService` (idempotencyKey) e a Fase 5
  (chamados) devem seguir para não duplicar efeito (seção 1.7).
- `ToolExecutorService.run(def, input, opts)` é o único caminho para uma ferramenta tocar um adapter
  externo (seção 4). A Fase 5 deve criar `ToolDefinition`s reais (`BillingTool`, `SupportTool`,
  `PlanTool`) cujo `execute` chama `ERPAdapter`/`MockERPAdapter` — não reimplementar o pipeline.
  `policy-actions.ts` já tem as ações `billing.view`, `support.create_ticket`, `support.get_ticket`,
  `plan.view`, `plan.change` catalogadas; só falta as ferramentas reais.
- `ToolCall.data` (Json?) persiste o payload de retorno para idempotência funcionar de verdade (migration
  `20260914202237_add_tool_call_data`) — qualquer `execute()` novo deve devolver `data` populado quando
  fizer sentido, não só `facts`.
- `ERP_ADAPTER` (token, `apps/api/src/integrations/erp/erp-adapter.interface.ts`) já resolve
  Mock/IXC/SGP por `ISPAGENT_ERP_PROVIDER`. `ErpToolsService` expõe `billingTool`, `supportGetTicketsTool`,
  `supportCreateTicketTool`, `planViewTool` prontos — a Fase 6 (Agent Orchestrator) deve injetar esse
  serviço para saber quais ferramentas oferecer ao LLM, não reconstruir `ToolDefinition`s.
- Class fields que dependem de um parâmetro de constructor (`@Inject(...) erp: ERPAdapter`) NÃO podem
  usar `this.erp` em inicializador de campo (`readonly x = f(this.erp)`) — a ordem de inicialização do
  JS roda os field initializers ANTES da atribuição de parameter properties. Atribuir dentro do corpo do
  constructor, não como field initializer (ver `erp-tools.service.ts`).
- `packages/shared`: `ToolStatus` ganhou `INVALID_INPUT` (Fase 4). Contrato só cresce, nunca muda
  semântica de valor existente (seção 3.4) — se a Fase 6 precisar de outro status novo, mesma regra.
