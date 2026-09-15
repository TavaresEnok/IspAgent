# Integrações — visão geral da API

Ver `docs/integration-capability-matrix.md` para o status honesto de cada uma. Este documento cobre a
API HTTP que expõe/consome cada integração.

## ERP

`ERP_ADAPTER` (token) resolve `MockERPAdapter`/`IXCAdapter`/`SGPAdapter` por `ISPAGENT_ERP_PROVIDER`.
Consumido só por `BillingTool`/`SupportTool`/`PlanTool` (`apps/api/src/tools/erp-tools.ts`) — nenhuma
rota HTTP chama o adapter diretamente.

## PulseISP

`PULSEISP_ADAPTER` (token) resolve `MockPulseISPAdapter`/`RealPulseISPAdapter` por
`ISPAGENT_PULSEISP_PROVIDER`. Só é usado quando `ISPAGENT_PULSEISP_ENABLED=true` (ver
`docs/pulseisp-integration.md`).

## AI Provider

`AI_PROVIDER` (token) resolve `MockAIProvider`/`AnthropicProvider`/`OpenAIProvider` por
`ISPAGENT_AI_PROVIDER` + presença de `ISPAGENT_ANTHROPIC_API_KEY` (ver `docs/privacy-and-ai.md`).

## Canais

- **Web Chat** (obrigatório, seção 6.3): `POST /public/webchat/:tenantId/message` e
  `GET /public/webchat/:tenantId/conversation/:channelUserId` — públicos (sem JWT), o `:tenantId` na URL
  identifica o provedor (não há um único "app" multi-tenant sem login; cada provedor teria seu próprio
  link/embed). `:channelUserId` é o telefone digitado no widget — o mesmo sinal que
  `IdentityResolutionService` usa.
- **WhatsApp**: não implementado nesta sessão (sem credencial Meta) — ver capability matrix.

## `GET /integrations/status`

Endpoint de staff (JWT) que expõe em JSON o mesmo status honesto da capability matrix, para a tela
"Integrações" do painel — nunca diverge do markdown, os dois lêem as mesmas variáveis de ambiente.

## Rotas HTTP — resumo

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/auth/login` | pública | login, devolve JWT + refresh |
| POST | `/auth/refresh` | pública | rotaciona o par de tokens |
| POST | `/auth/logout` | pública | revoga o refresh token |
| GET | `/auth/me` | JWT | usuário autenticado atual |
| POST | `/public/webchat/:tenantId/message` | pública | envia mensagem no Web Chat |
| GET | `/public/webchat/:tenantId/conversation/:channelUserId` | pública | histórico do Web Chat |
| GET | `/conversations` | JWT | lista conversas do tenant |
| GET | `/conversations/:id` | JWT | detalhe + timeline |
| GET | `/handoff/queue` | JWT | fila de handoff |
| POST | `/handoff/:id/assume` | JWT | atendente assume |
| POST | `/handoff/:id/return` | JWT | devolve para a IA |
| GET | `/dashboard/metrics` | JWT | métricas reais (seção 10.2) |
| GET | `/customers` / `/customers/:id` | JWT | clientes do tenant |
| GET | `/knowledge` / `/knowledge/search` | JWT | Knowledge Base |
| POST | `/knowledge` | JWT | novo documento |
| GET | `/policy` | JWT | policy config do tenant |
| PATCH | `/policy` | JWT + `TENANT_ADMIN` | atualiza policy |
| GET | `/policy/actions` | JWT | catálogo de ações/tiers |
| GET | `/users` | JWT + `TENANT_ADMIN` | usuários do tenant |
| GET | `/audit-logs` | JWT + `SUPERVISOR`+ | auditoria |
| GET | `/integrations/status` | JWT | status honesto das integrações |
