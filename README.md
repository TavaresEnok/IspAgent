# ISPAgent

Agente Inteligente de Atendimento para Provedores de Internet — MVP vertical, independente do PulseISP.

Ver `ISPAgent-prompt-execucao-v3.md` para o documento normativo completo, `STATE.md` para o estado atual
da build, `PROGRESS.md` para o histórico por fase e `DECISIONS.md` para decisões técnicas registradas.

## Subir o projeto do zero

Pré-requisitos: Docker Desktop rodando (Windows/macOS/Linux), `pnpm` instalado (`npm i -g pnpm`).

```bash
cp .env.example .env          # depois troque os segredos "change_me" (openssl rand -base64 48)
pnpm install
docker compose up -d --build --wait   # o serviço ispagent-migrate aplica as migrations sozinho
pnpm db:seed                          # só DEMO/desenvolvimento: cria contas com senha conhecida
```

- Web: http://localhost:3000
- API: http://localhost:3001 (health: `GET /health`)
- Postgres: `localhost:5433` (db `ispagent`) — publicado só em `127.0.0.1`
- Redis: `localhost:6380` (com senha `ISPAGENT_REDIS_PASSWORD`) — publicado só em `127.0.0.1`

Todas as portas ficam em `127.0.0.1` por padrão (`ISPAGENT_BIND_ADDR`). **Antes de colocar em produção**,
leia o checklist em [`docs/security.md`](docs/security.md): `ISPAGENT_ENV=production` faz a API recusar
subir com segredos fracos e desliga o Web Chat público por padrão.

## Login DEMO

As credenciais abaixo só existem depois do `pnpm db:seed` e só aparecem pré-preenchidas na tela de login
se o web for construído com `NEXT_PUBLIC_DEMO_MODE=true`.

| Usuário | Papel | Tenant |
|---|---|---|
| `admin@alpha.ispagent.local` / `Demo!2026` | TENANT_ADMIN | Provedor Alpha |
| `operador@alpha.ispagent.local` / `Demo!2026` | AGENT | Provedor Alpha |
| `admin@beta.ispagent.local` / `Demo!2026` | TENANT_ADMIN | Provedor Beta (existe só para provar isolamento) |

## Testes

```bash
pnpm test        # suíte da API — roda SEMPRE no banco <nome>_test (criado, migrado e semeado sozinho)
pnpm lint        # typecheck (tsc --noEmit) de api e web
pnpm audit       # dependências
```

Os testes **nunca** tocam o banco de desenvolvimento (`apps/api/test/test-db.js` recusa qualquer banco cujo
nome não termine em `_test`). O CI (`.github/workflows/ci.yml`) roda typecheck, testes, build e auditoria.

## Verificação end-to-end

Roda numa stack Docker **isolada** (projeto e volumes próprios): nunca toca o banco de trabalho, então
pode rodar no servidor. `-Fresh`/`--fresh` recria só essa stack de verificação.

```powershell
.\scripts\verify.ps1 -Fresh
```

Sobe o ambiente do zero, valida migrations/seed, autentica, testa identificação de cliente, tool calling,
cenário PulseISP, handoff, isolamento de tenant e a suíte de testes. Evidências em
`artifacts/verification/`.

## Desenvolvimento local (sem Docker para os apps)

```bash
pnpm --filter @ispagent/shared build
pnpm dev:api     # requer ispagent-db/ispagent-redis já rodando via docker compose
pnpm dev:web
```

## Estrutura

```
apps/api        NestJS — auth, tenancy, conversation, identity, tools, policy, agent, handoff, audit
apps/web        Next.js — painel admin + Web Chat DEMO
packages/shared Contratos TypeScript compartilhados (seção 3.4 do prompt)
integrations/   Adapters de ERP, PulseISP, canais e AI provider
docs/           Arquitetura, políticas, integrações, segurança, evidências
scripts/        verify.ps1 / verify.sh
```

## Modo DEMO

Sem `ISPAGENT_ANTHROPIC_API_KEY` configurada, o AI Provider roda em `MockAIProvider` (RunMode `DEMO`),
visível na UI. O mesmo vale para ERP, PulseISP e WhatsApp sem credencial: cada integração cai para seu
adapter DEMO/Mock, nunca falha o boot. Ver `docs/integration-capability-matrix.md` para o status real de
cada capacidade.
