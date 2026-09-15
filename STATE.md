# STATE
Fase atual: 10 — Validação (não iniciada)
Última fase com gate APROVADO: 9 — Canais e UI (commit: ver próximo commit após este arquivo)
Último comando executado com sucesso: `pnpm build` (raiz, verde) + Web Chat e painel testados de ponta a ponta no browser real (não só curl) + `docker compose up -d --wait` (exit 0, 5/5 healthy)
Próxima ação concreta: Fase 10 (final) — testes adversariais (P0.9: prompt injection via mensagem e via documento de KB, 3 payloads exigidos pela seção 11), escrever `scripts/verify.ps1` e `scripts/verify.sh` completos (seção 12, 18 passos), gerar `artifacts/verification/` com as evidências (customer-resolution.json, billing-tool.json, support-tool.json, pulseisp-diagnostic.json, collective-incident-response.json, policy-block.json, prompt-injection.json, handoff.json, tenant-isolation.txt, tests.txt), escrever docs/acceptance-evidence.md, e produzir o Relatório Final (seção 16) com todos os P0/P1 avaliados um a um e honestamente.
Arquivos em edição incompleta: nenhum
Bloqueios ativos: nenhum bloqueio técnico. Limitação estrutural (não bloqueio): sem credenciais/documentação oficial de IXC, SGP, PulseISP ou WhatsApp Cloud API nesta sessão — ver docs/integration-capability-matrix.md. AnthropicProvider implementado mas não validado ponta a ponta (sem API key nesta sessão) — MockAIProvider é o que roda de fato. WebSocket/SSE do Web Chat e telas de credencial de ERP/PulseISP/WhatsApp não implementados (P1, sem credencial real para configurar — ver PROGRESS.md Fase 9).
Invariantes que já passam: P0.1/P0.2/P0.6/P0.7/P0.8 (identidade, billing, policy, ambiguidade, tenant), idempotência (1.7), ERP DEMO real, invariante de Claim/evidence (3.4), P0.3 (fato ausente nunca citado), P0.4 (PulseISP ligado/desligado), P0.5 (handoff completo, AI→HUMAN→AI). **Faltam apenas P0.9 (prompt injection) e P0.10 (verify.ps1 -Fresh) para fechar os 10 P0.** 83/83 testes automatizados verdes; UI completa testada manualmente no browser.

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
  semântica de valor existente (seção 3.4) — se uma fase futura precisar de outro status novo, mesma regra.
- `AgentOrchestratorService.handleMessage(conversationId, message)` é o ponto de entrada de um turno
  completo — a Fase 9 (canais/UI) deve chamar ISSO a partir do webhook/endpoint de mensagem, não
  reimplementar o fluxo. `AI_PROVIDER`/`ERP_ADAPTER` já resolvem Mock vs real por env var.
  `ClaimValidatorService` é instanciado diretamente dentro do orchestrator (não injetado) — se isso
  precisar virar configurável/injetável no futuro, trocar por DI é mecânico.
- Testes de integração contra Postgres real rodam com `jest --runInBand` (serial) desde a Fase 6 — nunca
  remover essa flag sem dar aos testes um tenant efêmero por teste (ver DECISIONS.md).
- `AnthropicProvider`: qualquer novo parâmetro de constructor usado só para injeção manual em teste
  precisa de `@Optional()` (`@nestjs/common`), senão o Nest quebra o boot tentando resolver como
  dependência real (ver DECISIONS.md, Fase 6).
- `PolicyEngineService` já tem os actions `plan.view`/`plan.change` catalogados; `PlanTool` desta sessão
  só implementa VIEW (mudar de plano não está nas prioridades P0/P1 da seção 11) — se uma fase futura
  implementar `plan.change` de verdade, a policy já está pronta, só falta o `execute()`.
- `AgentOrchestratorService` agora recebe 8 argumentos no constructor (`PULSEISP_ADAPTER` é o último) —
  qualquer teste que instancia manualmente (fora do Nest DI) precisa passar um `PulseISPAdapter` (ex.:
  `new MockPulseISPAdapter(db)`), senão TS acusa "Expected 8 arguments".
- `ISPAGENT_PULSEISP_ENABLED` é lido diretamente de `process.env` dentro do orchestrator (função
  `pulseIspEnabled()`), não via config service — testes que precisam alternar o modo mutam
  `process.env.ISPAGENT_PULSEISP_ENABLED` diretamente e restauram no `afterAll` (ver
  `test/pulseisp.spec.ts`). Mesma convenção que `ISPAGENT_ERP_PROVIDER`/`ISPAGENT_AI_PROVIDER`.
- Handoff (Fase 8) deve reaproveitar `AgentDecision.outcome === 'HANDOFF'` como sinal de entrada na fila
  — o orquestrador já marca isso corretamente (identidade ambígua/não encontrada em intenção de conta,
  ou violação do invariante de Claim); a Fase 8 só precisa CRIAR o registro `Handoff` com o resumo
  estruturado quando isso acontece, não redecidir quando um handoff é necessário. **(feito)**
- `AgentOrchestratorService.handleMessage` agora devolve `AgentDecision | null` (`null` = conversa
  `HUMAN_ACTIVE`, IA em silêncio). Qualquer código novo que chame `handleMessage` (a Fase 9 vai chamar
  isso a partir de um controller HTTP) precisa tratar o caso `null` explicitamente — não assumir que
  sempre há uma resposta da IA para devolver ao canal.
- `HandoffService` (`apps/api/src/handoff/`) já tem `listQueue`/`assume`/`returnToAI` prontos — a tela
  "Fila humana" e o botão de assumir/devolver da Fase 9 só precisam de um controller fino chamando isso,
  não reimplementar a lógica de transição de estado.
- Padrão de limpeza de FK em testes que criam `Conversation` ad-hoc: sempre apagar na ordem `ToolCall →
  AgentRun/Handoff → Message → Conversation` (ver `resetConversationsFor` em `conversation.spec.ts`) —
  qualquer novo teste que precisar limpar conversas deve seguir essa ordem.
- **Sempre revalidar no browser depois de reconstruir a imagem Docker** — nesta fase, uma rota
  (`/policy/actions`) foi adicionada DEPOIS de disparar um rebuild em background, e só apareceu como bug
  (404) ao testar a UI de verdade no browser, não no `pnpm build` local (que só verifica compilação, não
  se a imagem rodando tem o código mais recente). Não declarar uma fase de UI aprovada sem abrir o
  browser e clicar em cada tela nova.
- `apps/web/lib/api.ts` usa `NEXT_PUBLIC_API_URL` com fallback `http://localhost:3001` — esse fallback
  funciona porque o browser roda no host, não dentro da rede do compose; não trocar para o hostname
  interno do Docker (`ispagent-api`) por engano, o browser não resolveria isso.
- Rotas HTTP completas documentadas em `docs/integrations.md` — qualquer endpoint novo na Fase 10
  (ex.: para expor evidências de verify.ps1, se for o caso) deve ser adicionado lá também.
- `AgentOrchestratorService` já é consumido via `WebchatController` (`apps/api/src/channels/`) usando
  `runWithTenant(tenantId, ...)` manualmente, já que a rota é pública (sem JWT, sem tenant no token) — o
  `:tenantId` vem da URL e é validado contra a tabela `Tenant` antes de qualquer coisa.
