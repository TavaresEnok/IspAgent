# Arquitetura — ISPAgent

## Visão geral

```
                         ┌──────────────────────────┐
                         │        ispagent-web        │  Next.js/React/Tailwind
                         │  (painel admin + Web Chat)  │
                         └──────────────┬──────────────┘
                                        │ REST (OpenAPI)
                         ┌──────────────▼──────────────┐
                         │        ispagent-api          │  NestJS
                         │  Auth · Tenancy · Conversation │
                         │  Identity · Tool Layer · Policy│
                         │  Agent Orchestrator · Handoff  │
                         └───┬──────────────┬───────────┘
                             │              │
                ┌────────────▼───┐   ┌──────▼───────────┐
                │  ispagent-db     │   │  ispagent-redis    │
                │  PostgreSQL      │   │  filas BullMQ       │
                └──────────────────┘   └──────┬───────────┘
                                               │
                                     ┌─────────▼─────────┐
                                     │   ispagent-worker    │  mesmo código de ispagent-api,
                                     │  (BullMQ processors)  │  entrypoint dedicado (worker.main.ts)
                                     └───────────────────────┘

Adapters (atrás de interface, nunca regra de negócio direta):
  ERPAdapter        → integrations/erp/{demo,ixc,sgp}
  PulseISPAdapter    → integrations/pulseisp/{mock,real}
  ChannelAdapter     → integrations/channels/{webchat,whatsapp}
  AIProvider         → integrations/ai/{anthropic,openai,mock}
```

## Multi-tenant — isolamento na camada de dados

Todo modelo que carrega dado de um provedor (`Customer`, `Contract`, `Invoice`, `SupportTicket`,
`Conversation`, `Message`, `AgentRun`, `ToolCall`, `Handoff`, `AuditLog`, `KnowledgeDocument`,
`TenantPolicyConfig`, `User`) é filtrado por `tenantId` **na extensão do Prisma**
(`apps/api/src/prisma/tenant-scoped.extension.ts`), não apenas em cada service/controller.

O `tenantId` da requisição vem de um `AsyncLocalStorage`
(`apps/api/src/common/tenant-context.ts`), preenchido por `TenantContextMiddleware`
(`apps/api/src/tenancy/tenant-context.middleware.ts`) a partir do JWT de acesso, antes de guards,
interceptors e handler rodarem. Qualquer leitura/escrita num modelo tenant-scoped sem contexto ativo
lança erro — não retorna silenciosamente uma lista vazia nem "vaza" dado de outro tenant por esquecimento
de `WHERE tenantId = ...` em algum service. Ver P0.8 em `apps/api/test/tenancy.spec.ts`.

Única exceção deliberada: leitura de `User` por e-mail durante o login, quando o tenant ainda não é
conhecido (ver comentário em `tenant-scoped.extension.ts`).

## Pipeline de execução de ferramentas (seção 4)

```
Agent → Tool Request → Schema Validation (Zod) → Tenant Validation (ALS) → Policy Engine
      → Permission Check → Confirmation Check → Execução (Adapter) → ToolResult → Audit Log → Agent
```

Implementado a partir da Fase 4. Cada etapa é um componente isolado e testável — nenhuma é pulada nem
colapsada "para simplificar".

## Contratos travados

`packages/shared/src/types/*.ts` espelha literalmente a seção 3.4 do prompt de execução. Consumido por
`@ispagent/api` e `@ispagent/web`. Mudança de semântica em um campo existente é proibida; só se cresce.

## Worker como processo compartilhado

Ver `DECISIONS.md` (2026-09-14) — `ispagent-worker` roda `apps/api/src/worker.main.ts`, o mesmo
código-fonte de `ispagent-api`, empacotado na mesma imagem Docker (`apps/api/Dockerfile`), com `command`
diferente no `docker-compose.yml`.
