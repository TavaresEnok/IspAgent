# Segurança

Status honesto do que está implementado, do que depende de configuração e do que ainda **não** existe.
Última revisão completa: 2026-09-21 (auditoria de segurança + correções; ver `DECISIONS.md`).

## Modo de operação: `ISPAGENT_ENV`

| | `development` / `test` / `demo` | `production` |
|---|---|---|
| Segredos JWT / chave de criptografia | aviso no log se forem de exemplo | **a API recusa subir** se fracos, curtos (<32), de exemplo ou iguais entre si |
| CORS | `localhost` liberado + `ISPAGENT_CORS_ORIGINS` | só `ISPAGENT_CORS_ORIGINS` (obrigatório) |
| Web Chat público (`/public/webchat/*`) | ligado | **desligado** (404) salvo `ISPAGENT_WEBCHAT_PUBLIC_ENABLED=true` |
| Rotas DEMO ("Resetar conversa" sem login) | ligadas | desligadas (só supervisor logado apaga) |
| Telefone digitado no Web Chat identifica o cliente | sim (demonstração) | **não** — só o documento informado no chat |
| Sessão do Web Chat | id livre | id aleatório + token de sessão obrigatório |
| URL do PulseISP | http/https, host interno permitido | só https, sem rede interna (salvo `ISPAGENT_OUTBOUND_ALLOWED_HOSTS`) |
| `db:seed` (contas DEMO com senha conhecida) | roda | **recusa rodar** |

## Implementado

- **JWT + refresh** (`apps/api/src/auth/`): access token curto (15m), refresh de 7 dias guardado só como
  hash (`sha256`), **rotação a cada uso** (atômica), **detecção de reuso** (reapresentar um token já
  rotacionado fora de uma janela de 10 s derruba todas as sessões do usuário) e **revalidação no banco**
  a cada refresh (usuário desativado ou papel alterado vale no próximo refresh). Algoritmo fixo HS256.
- **Login sem ambiguidade entre tenants**: o mesmo e-mail em dois provedores com a mesma senha devolve
  `409 TENANT_REQUIRED` e exige o `tenantId`; senhas diferentes entram cada uma no seu tenant. O tempo de
  resposta não revela quais e-mails existem. Rate limit de 5 tentativas/min por IP no login.
- **RBAC**: `Role` com hierarquia (`SUPER_ADMIN` > `TENANT_ADMIN` > `SUPERVISOR` > `AGENT` > `ANALYST` >
  `READ_ONLY`) e `@Roles(...)` (papel mínimo) em **todos** os endpoints sensíveis:
  leitura de conversas/clientes/fila ≥ `ANALYST`; assumir/devolver handoff e responder ao cliente ≥ `AGENT`;
  escrever na Knowledge Base e ler auditoria ≥ `SUPERVISOR`; usuários, políticas, tela "IA" e PulseISP ≥
  `TENANT_ADMIN`. CPF/CNPJ aparece completo só para `SUPERVISOR`+ (abaixo disso, só os 2 últimos dígitos).
- **Isolamento multi-tenant na camada de dados** (`tenant-scoped.extension.ts`): filtro de `tenantId`
  injetado em toda leitura/escrita; **fail-closed** — operação que a extensão não sabe escopar
  (`createManyAndReturn` já foi uma brecha, escritas aninhadas de relação, mudar `tenantId` num `update`,
  `upsert` cruzando tenant) é recusada em vez de passar sem filtro. `$queryRaw` não passa pela extensão:
  o único uso (busca da KB) filtra `tenantId` à mão e tem teste.
- **Identificação de cliente** (`AgentOrchestratorService.identifyByDocument`): só **CPF/CNPJ completo,
  exato e único**; nunca por nome, código de cliente ou trecho de texto; com telefone ambíguo o documento
  precisa bater também com um dos telefones candidatos; exige exatamente **um** contrato ativo (senão vai
  para um atendente); confiança no máximo `MEDIUM` quando só o documento prova. Tentativas erradas são
  contadas por conversa (`identity.failed_attempt`, sem gravar o documento) e, ao atingir
  `handoffAfterFailures` da policy, bloqueiam a identificação e abrem handoff (anti-adivinhação de CPF).
- **Web Chat público**: sem rotas que busquem/gravem clientes do PulseISP (o simulador é do painel, com
  login de admin); canal reservado `pulse:*` só aceita JWT de admin do **mesmo** tenant; mensagem ≤ 2000
  caracteres; `GET` não cria conversa; reset auditado; rate limit por IP.
- **Segredos de terceiros cifrados em repouso** (`secret-cipher.ts`): chaves de IA e senha do PulseISP são
  gravadas com AES-256-GCM (`enc:v1:`); a UI só vê máscara; valor legado em texto puro é regravado cifrado
  no primeiro acesso. A chave é `ISPAGENT_ENCRYPTION_KEY`.
- **Proteção contra SSRF** (`outbound-url.ts`): a URL do PulseISP (configurável por tenant) nunca pode
  apontar para metadata de nuvem/link-local; em produção exige https e bloqueia rede interna (com DNS
  resolvido antes de chamar).
- **IA — dados pessoais**: antes de qualquer texto do cliente sair para um provedor de IA, CPF, CNPJ,
  e-mail, telefone e números longos são mascarados (`pii-mask.ts`); só o primeiro nome vai para o prompt.
- **IA — a resposta é conferida** (`reply-guard.ts`): valor, data ou número na resposta do LLM que **não**
  esteja nos fatos das ferramentas, ou afirmação de "abri o chamado" sem ferramenta que o tenha aberto,
  descarta o texto do modelo e usa a resposta determinística. O `ClaimValidator` sozinho **não** garante
  isso: ele valida que os fatos têm procedência, não o texto final.
- **Policy Engine**: `maxToolCallsPerTurn` (executor), `handoffAfterFailures` (identificação) e
  `maxTokensPerTurn` (teto de saída do LLM) agora são **aplicados**, não só configuráveis.
- **Auditoria**: `ToolCall.args` grava os argumentos reais (valores de chaves como `password`/`token`/
  `apiKey` são redigidos); handoff, mensagens humanas, resets e falhas de identificação são auditados.
- **Handoff atômico**: transições `PENDING → ASSUMED → RETURNED_TO_AI` validadas e em transação; dois
  atendentes não assumem a mesma conversa; só quem assumiu (ou supervisor+) devolve à IA.
- **HTTP**: `helmet`, sem `X-Powered-By`, CORS por allowlist, `trust proxy` configurável
  (`ISPAGENT_TRUST_PROXY`), limite de tamanho nos DTOs (`MaxLength`), `ISPAGENT_LOG_LEVEL` efetivo.
- **Infra**: containers rodam como `node` (não root); banco e Redis publicados só em `127.0.0.1`; Redis
  com senha; `.env` fora do contexto de build do Docker; migrations aplicadas por um job dedicado
  (`ispagent-migrate`) antes da API; `pnpm audit` sem vulnerabilidades conhecidas.
- **Testes isolados**: a suíte roda **sempre** em `<banco>_test` (criado, migrado e semeado sozinho) e
  recusa qualquer banco cujo nome não termine em `_test`. `verify.sh`/`verify.ps1` exigem
  `ISPAGENT_VERIFY_ALLOW_DESTROY=1` (criam contas DEMO e, com `--fresh`, apagam volumes).

## Não implementado / decisões conscientes

- **Sem WhatsApp verificado**: enquanto não houver um canal que prove o número (WhatsApp Cloud API), o
  documento digitado é a única prova de identidade no chat — um segredo **fraco** (CPF vaza com
  facilidade). Por isso a identificação por documento fica em `MEDIUM` e há bloqueio por tentativas. Para
  produção real, considere um segundo fator (ex.: data de nascimento, ou código enviado ao telefone
  cadastrado) antes de expor dados de fatura.
- **Clientes reais do PulseISP não se identificam pelo chat**: o Customer 360 do PulseISP não traz o
  documento, então não há como conferir um CPF digitado. Eles só entram pelo **simulador do painel**
  (admin) — até haver canal verificado.
- **Tokens do painel em `localStorage`** (expostos a XSS). Mitigações: access token de 15 min, refresh
  rotacionado com detecção de reuso, cabeçalhos de segurança. Migrar para cookie `httpOnly` exige
  proteção CSRF explícita.
- **CSP de `script-src` estrito no painel**: o Next injeta scripts inline; um CSP estrito exige nonces por
  requisição. Hoje o CSP cobre `frame-ancestors`, `base-uri`, `object-src` e `form-action`.
- **Rate limit em memória do processo**: com mais de uma instância da API, trocar o storage do
  `@nestjs/throttler` por Redis.
- **Row-Level Security no Postgres**: seria uma segunda camada sob a extensão do Prisma; não implementada
  (exige `SET LOCAL` do tenant por transação em cada consulta).
- **`Customer.document` em texto puro no banco** (a busca por documento precisa dele): avaliar
  criptografia de coluna + índice cego (hash) para LGPD.
- **Rotação de `ISPAGENT_ENCRYPTION_KEY`**: trocar a chave torna as credenciais gravadas ilegíveis (é
  preciso digitá-las de novo no painel). Não há re-cifragem automática com chave antiga.
- **`@google/generative-ai` está descontinuado** pelo Google (migrar para `@google/genai`); mantido por
  ora porque o provider e seus testes dependem dele.
- **LGPD**: não há rotina de exclusão/anonimização de dados de cliente.
- **Sanitização de log**: mantida por convenção (nenhum log de payload bruto de login/token), não por filtro.

## Como colocar em produção (checklist)

1. `ISPAGENT_ENV=production`.
2. Gerar segredos: `openssl rand -base64 48` para `ISPAGENT_JWT_SECRET`, `ISPAGENT_JWT_REFRESH_SECRET` e
   `ISPAGENT_ENCRYPTION_KEY` (guarde a última em cofre — perdê-la invalida as credenciais salvas).
3. Trocar a senha do banco e do Redis (`ISPAGENT_DB_PASSWORD` só vale para um volume **novo**; num banco
   existente use `ALTER USER ... PASSWORD ...` e depois atualize o `.env`).
4. `ISPAGENT_CORS_ORIGINS=https://painel.seudominio`, `ISPAGENT_TRUST_PROXY=1` e um proxy reverso com TLS.
5. Não rodar `db:seed`/`verify` no ambiente de produção.
6. `docker compose up -d --build` — o serviço `ispagent-migrate` aplica as migrations antes da API.

## Tenant isolation — cobertura de teste

`apps/api/test/tenancy.spec.ts` (leitura sem contexto, cross-tenant por id, `findMany`, criação com
`tenantId` divergente, `TenantPolicyConfig`) e `apps/api/test/hardening.spec.ts` (fail-closed:
`createManyAndReturn`, `upsert`, escrita aninhada, mover linha de tenant), além de
`apps/api/test/http-security.spec.ts` (isolamento e RBAC via HTTP com tokens reais).
