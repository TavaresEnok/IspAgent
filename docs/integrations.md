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

O provider é resolvido **por turno e por tenant** (`AiProviderResolverService`) a partir da tela "IA" do
painel — a chave fica no banco, cifrada. Sem chave salva o tenant roda no `MockAIProvider`
(ver `docs/privacy-and-ai.md` e `docs/security.md`).

## Canais

- **Web Chat** (obrigatório, seção 6.3): `POST /public/webchat/:tenantId/message`,
  `GET /public/webchat/:tenantId/conversation/:channelUserId` e `GET /public/webchat/config` — públicos
  (sem JWT); o `:tenantId` na URL identifica o provedor. É um canal de **demonstração**: o
  `:channelUserId` (telefone digitado no DEMO, id de sessão aleatório em produção) não prova quem é.
  Detalhes e diferenças por ambiente em `docs/security.md`. Em produção o canal vem **desligado** e, ligado,
  exige token de sessão (`X-Webchat-Token`, devolvido como `sessionToken` na primeira mensagem). O prefixo
  `pulse:` é reservado ao simulador do painel e só aceita JWT de admin do mesmo tenant. Buscar/simular
  cliente do PulseISP é do painel (`/pulseisp/*`), nunca público.
- **WhatsApp**: não implementado nesta sessão (sem credencial Meta) — ver capability matrix.

## `GET /integrations/status`

Endpoint de staff (JWT) que expõe em JSON o mesmo status honesto da capability matrix, para a tela
"Integrações" do painel — nunca diverge do markdown, os dois lêem as mesmas variáveis de ambiente.

## Rotas HTTP — resumo

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/auth/login` | pública | login, devolve JWT + refresh |
| POST | `/auth/refresh` | pública | rotaciona o par de tokens (uso único; reuso derruba as sessões) |
| POST | `/auth/logout` | pública | revoga o refresh token |
| GET | `/auth/me` | JWT | usuário autenticado atual |
| GET | `/public/webchat/config` | pública* | modo do Web Chat (telefone identifica? token exigido?) |
| POST | `/public/webchat/:tenantId/message` | pública* | envia mensagem no Web Chat (≤ 2000 chars) |
| GET | `/public/webchat/:tenantId/conversation/:channelUserId` | pública* | histórico (não cria conversa) |
| DELETE | `/public/webchat/:tenantId/conversation/:channelUserId` | pública* só em DEMO; `SUPERVISOR`+ em produção | reseta a conversa (auditado) |
| GET | `/conversations` | JWT + `ANALYST`+ | lista conversas do tenant |
| GET | `/conversations/:id` | JWT + `ANALYST`+ | detalhe + timeline (CPF mascarado abaixo de `SUPERVISOR`) |
| POST | `/conversations/:id/messages` | JWT + `AGENT`+ | atendente responde (conversa em `HUMAN_ACTIVE`) |
| GET | `/handoff/queue` | JWT + `ANALYST`+ | fila de handoff |
| POST | `/handoff/:id/assume` | JWT + `AGENT`+ | atendente assume (só se `PENDING`; 409 se já assumido) |
| POST | `/handoff/:id/return` | JWT + `AGENT`+ | devolve para a IA (só quem assumiu, ou `SUPERVISOR`+) |
| GET | `/dashboard/metrics` | JWT | métricas reais (seção 10.2) |
| GET | `/customers` / `/customers/:id` | JWT + `ANALYST`+ | clientes do tenant (CPF mascarado abaixo de `SUPERVISOR`) |
| GET | `/knowledge` / `/knowledge/search` | JWT | Knowledge Base |
| POST | `/knowledge` | JWT + `SUPERVISOR`+ | novo documento |
| GET/PATCH | `/ai-config`, `/ai-config/providers/:p`, `/ai-config/active` | JWT + `TENANT_ADMIN` | tela "IA" |
| GET/PATCH | `/pulseisp/connection` | JWT + `TENANT_ADMIN` | conexão com o PulseISP |
| GET | `/pulseisp/customers` | JWT + `TENANT_ADMIN` | busca clientes do PulseISP (simulador) |
| POST | `/pulseisp/simulate` | JWT + `TENANT_ADMIN` | espelha um cliente real para conversar "como" ele |
| GET | `/policy` | JWT | policy config do tenant |
| PATCH | `/policy` | JWT + `TENANT_ADMIN` | atualiza policy |
| GET | `/policy/actions` | JWT | catálogo de ações/tiers |
| GET | `/users` | JWT + `TENANT_ADMIN` | usuários do tenant |
| GET | `/audit-logs` | JWT + `SUPERVISOR`+ | auditoria |
| GET | `/integrations/status` | JWT | status honesto das integrações |

\* Só existe se o Web Chat público estiver ligado (padrão: ligado fora de produção, desligado em produção).
