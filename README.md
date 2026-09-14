# ISPAgent

Agente Inteligente de Atendimento para Provedores de Internet — MVP vertical, independente do PulseISP.

Ver `ISPAgent-prompt-execucao-v3.md` para o documento normativo completo, `STATE.md` para o estado atual
da build, `PROGRESS.md` para o histórico por fase e `DECISIONS.md` para decisões técnicas registradas.

## Subir o projeto do zero

Pré-requisitos: Docker Desktop rodando (Windows/macOS/Linux), `pnpm` instalado (`npm i -g pnpm`).

```bash
cp .env.example .env
pnpm install
docker compose up -d --wait
pnpm db:migrate
pnpm db:seed
```

- Web: http://localhost:3000
- API: http://localhost:3001 (health: `GET /health`)
- Postgres: `localhost:5433` (db `ispagent`)
- Redis: `localhost:6380`

## Login DEMO

| Usuário | Papel | Tenant |
|---|---|---|
| `admin@alpha.ispagent.local` / `Demo!2026` | TENANT_ADMIN | Provedor Alpha |
| `operador@alpha.ispagent.local` / `Demo!2026` | AGENT | Provedor Alpha |
| `admin@beta.ispagent.local` / `Demo!2026` | TENANT_ADMIN | Provedor Beta (existe só para provar isolamento) |

## Verificação end-to-end

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
