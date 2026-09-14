# STATE
Fase atual: 4 — Tool layer e policy (não iniciada)
Última fase com gate APROVADO: 3 — Conversa e identidade (commit: ver próximo commit após este arquivo)
Último comando executado com sucesso: `pnpm --filter @ispagent/api test identity conversation` (11/11 verde, 19/19 no total) e `docker compose up -d --wait` (exit 0, 5/5 healthy)
Próxima ação concreta: escrever os testes de aceitação da Fase 4 (ToolResult/pipeline de execução de ferramentas, Policy Engine, idempotência) antes de implementar, seguindo o loop da seção 0.6.
Arquivos em edição incompleta: nenhum
Bloqueios ativos: nenhum bloqueio técnico. Limitação estrutural (não bloqueio): sem credenciais/documentação oficial de IXC, SGP, PulseISP ou WhatsApp Cloud API nesta sessão — ver docs/integration-capability-matrix.md. Todas as integrações externas seguirão o padrão adapter+DEMO das seções 6 e 0.3, nunca "fingindo" validação que não ocorreu.
Invariantes que já passam: P0.8 (isolamento de tenant, 8/8 testes), P0.1/P0.7 (identidade — cliente conhecido resolve certo, ambíguo/não encontrado nunca vincula a ninguém, 11/11 testes)

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
  chamar a resolução de novo — mesma lógica que a Fase 4 (tool calls) e a Fase 5 (chamados) devem seguir
  para não duplicar efeito (seção 1.7).
