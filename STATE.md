# STATE
Fase atual: 3 — Conversa e identidade (não iniciada)
Última fase com gate APROVADO: 2 — Banco e tenancy (commit: ver `git log` — commit "Fases 1-2" logo após este arquivo)
Último comando executado com sucesso: `pnpm --filter @ispagent/api test tenancy` (8/8 verde) e `docker compose up -d --wait` (exit 0, 5/5 healthy)
Próxima ação concreta: escrever os testes de aceitação da Fase 3 (Conversation Engine + Identity Resolution, incluindo o caso ambíguo `cus_demo_g`/`cus_demo_g2`) antes de implementar, seguindo o loop da seção 0.6.
Arquivos em edição incompleta: nenhum
Bloqueios ativos: nenhum bloqueio técnico. Limitação estrutural (não bloqueio): sem credenciais/documentação oficial de IXC, SGP, PulseISP ou WhatsApp Cloud API nesta sessão — ver docs/integration-capability-matrix.md. Todas as integrações externas seguirão o padrão adapter+DEMO das seções 6 e 0.3, nunca "fingindo" validação que não ocorreu.
Invariantes que já passam: P0.8 (isolamento de tenant, 8/8 testes em apps/api/test/tenancy.spec.ts)

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
  registrada: schema desenhado em conjunto para reduzir migrations fragmentadas nesta fase inicial). A
  Fase 3 deve usá-las como estão, só criando migration adicional se precisar ALTERAR algo.
