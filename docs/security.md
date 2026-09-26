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
  Fontes consultadas, nesta ordem, sempre só pelo documento: banco local → ERP ativo (SGP, que espelha o
  cliente) → PulseISP (login PPPoE = CPF). A decisão é sempre a mesma regra exata do banco local.
- **Web Chat público**: sem rotas que busquem/gravem clientes do ERP ou do PulseISP (busca e simulador são
  rotas de staff: `/sgp/*` e `/pulseisp/*`); canais reservados `pulse:*`/`sgp:*` só aceitam JWT de admin do
  **mesmo** tenant; mensagem ≤ 2000 caracteres; `GET` não cria conversa; reset auditado; rate limit por IP.
  Comprovante, áudio, pesquisa CSAT e aviso de incidente passam pelas mesmas checagens de canal/sessão;
  arquivo em base64 limitado (~6 MB, tipos permitidos) e corpo grande só nessas duas rotas.
- **Mídia não vira conteúdo inventado**: áudio que não transcreve pede para o cliente escrever (nunca uma
  fala fictícia); comprovante é registrado como "leitura automática, não confirmada" e, em falha ou modo
  DEMO, nunca como "válido".
- **Nada de dado de fallback no ERP**: falha do SGP não vira sinal óptico fictício, "online", desbloqueio
  concedido nem preço/velocidade de plano; o que o ERP não informou não vira fato.
- **WhatsApp Cloud API** (`channels/whatsapp*.ts`): desligado até `ISPAGENT_CHANNEL_WHATSAPP_ENABLED=true`;
  o webhook só aceita requisição com `X-Hub-Signature-256` válida (App Secret); o tenant vem de
  `ISPAGENT_WHATSAPP_TENANT_ID`, nunca da URL; a resposta vai pela API da Meta, nunca no corpo HTTP. Aviso
  proativo (`/whatsapp/broadcast-maintenance`) é rota de SUPERVISOR+, só para números com conversa, auditado.
- **Tempo real (SSE)**: o painel pede um ticket curto logado (`POST /events/ticket`, 60 s) para abrir o
  stream; nunca um `tenantId` na URL. Evento sem tenant não vai para ninguém.
- **Credenciais do SGP** só por variável de ambiente (`ISPAGENT_SGP_*`), nunca como valor padrão no código.
- **Segredos de terceiros cifrados em repouso** (`secret-cipher.ts`): chaves de IA e senha do PulseISP são
  gravadas com AES-256-GCM (`enc:v1:`); a UI só vê máscara; valor legado em texto puro é regravado cifrado
  no primeiro acesso. A chave é `ISPAGENT_ENCRYPTION_KEY`.
- **Proteção contra SSRF** (`outbound-url.ts`): a URL do PulseISP (configurável por tenant) nunca pode
  apontar para metadata de nuvem/link-local; em produção exige https e bloqueia rede interna (com DNS
  resolvido antes de chamar).
- **IA — dados pessoais**: antes de qualquer texto do cliente sair para um provedor de IA, CPF, CNPJ,
  e-mail, telefone e números longos são mascarados (`pii-mask.ts`); só o primeiro nome vai para o prompt.
- **IA — a resposta é conferida** (`reply-guard.ts`): valor, data ou número na resposta do LLM que **não**
  esteja nos fatos das ferramentas, link que não esteja nos fatos, afirmação de "abri o chamado" sem
  ferramenta que o tenha aberto ou de "liberei a sua conexão" sem o ERP confirmar, descarta o texto do modelo e usa a resposta determinística. O `ClaimValidator` sozinho **não** garante
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
  recusa qualquer banco cujo nome não termine em `_test`. `verify.sh`/`verify.ps1` rodam numa stack
  Docker isolada (projeto e volumes próprios) e nunca tocam o banco de trabalho.

## Não implementado / decisões conscientes

- **Web Chat sem canal verificado**: no Web Chat o documento digitado é a única prova de identidade — um segredo **fraco** (CPF vaza com
  facilidade). Por isso a identificação por documento fica em `MEDIUM` e há bloqueio por tentativas. Para
  produção real, considere um segundo fator (ex.: data de nascimento, ou código enviado ao telefone
  cadastrado) antes de expor dados de fatura.
- **Identificação via PulseISP depende do login PPPoE ser o CPF**: o Customer 360 não traz o documento;
  quando o login PPPoE do contrato não é o CPF, o cliente só é identificado pelo ERP (SGP) ou por um
  atendente.
- **Promessa de pagamento (liberação em confiança)**: disparada por palavras como "já paguei"/"comprovante";
  as regras de elegibilidade são as do SGP e a ação só roda com `canPerformUnlock` na policy. O comprovante
  enviado não é prova de pagamento.
- **Token do SGP publicado no histórico do Git**: ele constava como valor padrão no código de uma versão
  anterior (repositório público). Foi removido do código, mas **precisa ser revogado e trocado no SGP**.
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
