# Segurança

Status honesto do que a seção 7 pede — implementado vs. não implementado nesta sessão, sem inflar.

## Implementado

- **JWT + refresh**: `apps/api/src/auth/` — access token curto (15m default), refresh token de 7 dias
  com hash (`sha256`) armazenado em `refresh_tokens`, rotacionado a cada uso (`AuthService.refresh`).
- **RBAC**: `Role` (`SUPER_ADMIN`, `TENANT_ADMIN`, `SUPERVISOR`, `AGENT`, `ANALYST`, `READ_ONLY`) com
  hierarquia (`ROLE_HIERARCHY`), `@Roles(...)` + `RolesGuard` global.
- **Hash de senha**: `bcrypt` (10 rounds).
- **Isolamento multi-tenant na camada de dados**: extensão do Prisma + `AsyncLocalStorage` (ver
  `docs/architecture.md`) — não é só um `WHERE` em cada controller, é estrutural (P0.8).
- **Validação de input**: `class-validator` nos DTOs HTTP (`ValidationPipe` global,
  `whitelist: true` — remove campos não declarados) + Zod em todo `ToolDefinition.inputSchema`.
- **Idempotência em escrita**: seção 1.7, `docs/tools.md`.
- **Auditoria**: `AuditLog` para tool calls, handoff (created/assumed/returned_to_ai), e outras ações de
  escrita — sempre com `actorType`/`actorId`, nunca anônimo quando há um usuário.
- **CORS**: habilitado (`app.enableCors()` em `main.ts`) — sem allowlist de origem restrita nesta sessão
  (aceitável para DEMO local, não para produção — ver "Não implementado").

## Não implementado nesta sessão (limitação real, não escondida)

- **Rate limiting**: nenhum throttle em `/auth/login` nem nas rotas públicas do Web Chat
  (`/public/webchat/*`). Risco real de força bruta/abuso em produção — precisa de
  `@nestjs/throttler` ou equivalente antes de expor publicamente.
- **CSRF**: não aplicável no formato atual (API stateless com Bearer token, sem cookie de sessão), mas
  se o frontend migrar para cookie httpOnly no futuro, precisa de proteção CSRF explícita.
- **Allowlist de CORS por origem**: `enableCors()` está no modo default permissivo.
- **Sanitização de log explícita**: não há um middleware dedicado que garanta que senha/token/API key
  nunca aparecem em log — hoje isso é mantido por convenção (nenhum `console.log` de payload bruto de
  login/token no código), não por um filtro automático. Deveria virar um interceptor antes de produção.
- **Criptografia de credenciais externas em repouso**: `ISPAGENT_IXC_TOKEN`, `ISPAGENT_SGP_TOKEN`, etc.
  ficam em variável de ambiente, não em um secret manager — aceitável para DEMO local, não para produção
  multi-tenant real com credenciais de clientes diferentes.
- **Headers de segurança** (`helmet` ou equivalente): não configurado.
- **LGPD**: dados do seed são sintéticos; não há rotina de exclusão/anonimização de dado de cliente
  implementada (fora de escopo desta sessão).

## Tenant isolation — cobertura de teste

P0.8, 8/8 testes em `apps/api/test/tenancy.spec.ts` — cobre leitura sem contexto, leitura cross-tenant
por id, `findMany`, criação com `tenantId` divergente, e o caso especial de `TenantPolicyConfig` (cuja PK
é o próprio `tenantId`). Reafirmado em `identity.spec.ts` e `agent.spec.ts` (mesma conversa/telefone em
tenants diferentes nunca vaza dado).
