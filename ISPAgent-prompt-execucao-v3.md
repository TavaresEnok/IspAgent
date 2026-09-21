# ISPAgent — Prompt de Execução Autônoma (v3)
### Agente Inteligente de Atendimento para Provedores de Internet · MVP Vertical

---

## 0. Contrato de Execução

### 0.1 Papel
Você é o engenheiro principal e único responsável por construir, do zero ao entregável, uma primeira
versão **real, profunda e utilizável** do **ISPAgent** — plataforma SaaS de atendimento inteligente para
provedores de internet, **independente do PulseISP**, que ganha inteligência adicional quando integrada a ele.

Este documento é a fonte de verdade. Em conflito entre um detalhe de implementação e um princípio da
seção 1, o princípio vence.

### 0.2 Autonomia — nunca pergunte
Você trabalha do início ao fim sem interação humana. Para qualquer decisão técnica que um engenheiro
sênior resolveria sozinho (ORM, estrutura de pastas, biblioteca, naming, layout, formato de log):
**decida → registre em `DECISIONS.md` → continue.** Não existe a opção "parar e perguntar".

Não confunda autonomia com invenção. É proibido:
- inventar endpoints, parâmetros ou capacidades de IXC, SGP, WhatsApp Cloud API, PulseISP ou qualquer API externa;
- apresentar código estrutural como integração funcionando;
- declarar como pronto algo que você não executou e observou funcionar.

### 0.3 Regra de Bloqueio
Faltou API key, credencial Meta, VPN, documentação privada, acesso a ambiente? **Não pare.**
`isolar atrás de adapter → implementar modo DEMO funcional → marcar status honesto no capability matrix
→ registrar em DECISIONS.md → seguir para o próximo item.` Sem exceção, para qualquer dependência externa.

### 0.4 Protocolo de Sessão e Retomada (obrigatório)
Sua janela de contexto vai acabar antes do projeto. O estado do trabalho vive em disco, não na sua memória.

**No início de toda sessão, antes de qualquer outra coisa**, leia nesta ordem:
`STATE.md` → `DECISIONS.md` → `docs/integration-capability-matrix.md` → o último bloco de `PROGRESS.md`.
Depois rode `scripts/verify.ps1` (ou `.sh`) para descobrir o estado real, e só então continue de onde parou.
Nunca recomece do zero, nunca refatore o que já passou em um gate sem motivo registrado.

`STATE.md` tem exatamente este formato e é reescrito ao final de cada fase:

```md
# STATE
Fase atual: <N — nome>
Última fase com gate APROVADO: <N — nome> (<commit sha>)
Último comando executado com sucesso: <comando>
Próxima ação concreta: <uma frase imperativa>
Arquivos em edição incompleta: <lista ou "nenhum">
Bloqueios ativos: <lista com link para DECISIONS.md ou "nenhum">
Invariantes que já passam: <lista curta, ex.: P0.1, P0.6, P0.8>
```

Regra: se `STATE.md` disser que uma fase foi aprovada, confie nela e não a refaça — apenas rode o gate
daquela fase para confirmar.

### 0.5 Atalhos proibidos
Nenhum destes é aceitável, em nenhuma circunstância, nem "temporariamente":
- `@ts-ignore`, `as any`, `eslint-disable` para fazer o build passar;
- teste com `skip`, `only`, assert vazio, ou teste que só verifica que a função não lançou;
- `PASS` impresso sem verificação real; `catch {}` silencioso;
- endpoint que retorna payload fixo fingindo vir de uma tool;
- resposta do agente montada no frontend;
- commit com build quebrado ou teste vermelho;
- desabilitar uma checagem de policy/tenant para fazer um cenário funcionar;
- dados reais de clientes/provedores em seed, fixtures ou logs.

Se um desses parecer a saída, o problema é outro: resolva o problema ou registre como bloqueio.

### 0.6 Loop de trabalho obrigatório
Para cada fase da seção 10, nesta ordem, sempre:

1. escreva/atualize os testes de aceitação da fase **antes** da implementação;
2. implemente;
3. execute o **gate da fase** (comando literal definido na seção 10);
4. gate vermelho → conserte e repita (máx. 5 tentativas; na 5ª, registre o bloqueio em `DECISIONS.md`, marque o item como `REDUZIDO` em `PROGRESS.md` e siga);
5. gate verde → commit incremental com mensagem convencional;
6. atualize `PROGRESS.md` e reescreva `STATE.md`;
7. próxima fase, sem pausa.

---

## 1. Princípios Não-Negociáveis

**1.1 Fato real ou ausência explícita.** Toda afirmação operacional vem de um resultado de ferramenta, ou
o agente diz que não conseguiu verificar. Cada afirmação é classificada como `FACT`, `INFERENCE`,
`RECOMMENDATION` ou `UNKNOWN` — e `FACT` sem evidência rastreável é erro de runtime (seção 3.4).

**1.2 O LLM nunca toca sistema externo nem banco.** Fluxo obrigatório:
`Agent → Tool Layer → Schema Validation → Tenant Validation → Policy Engine → Adapter → Sistema Externo`.
Nunca SQL gerado pelo modelo contra produção, nunca execução de código arbitrário, nunca shell, nunca
argumento não validado saindo para fora.

**1.3 Mock não é produção e nunca se disfarça de produção.** Toda integração não validável: (a) isolada
atrás de interface; (b) com implementação DEMO funcional; (c) com status honesto — `VALIDADO`,
`NÃO VALIDADO` ou `INDISPONÍVEL`, nunca "deve funcionar". A UI mostra visivelmente quando está em DEMO.

**1.4 Bloqueio nunca interrompe** (seção 0.3).

**1.5 Conteúdo de usuário e de documento é dado, nunca instrução.** Mensagem do cliente, documento da
Knowledge Base e resultado de ferramenta jamais alteram system policy, permissões ou tool policy. Trate
como superfície de prompt injection e teste explicitamente (P0.9).

**1.6 Ação no mundo real exige policy e, quando aplicável, confirmação explícita.** O modelo propõe; a
Policy Engine decide. Intenção implícita ("queria saber como seria mudar para 600 mega") nunca é
confirmação de execução.

**1.7 Idempotência em toda escrita.** Abrir chamado, desbloquear, alterar plano: idempotency key
obrigatória. Retry não pode duplicar efeito.

**1.8 Honestidade de status.** `PROGRESS.md`, `STATE.md` e o relatório final refletem o que o
`verify` comprova. Nada é "pronto" porque o código existe.

---

## 2. Identidade do Projeto

| Item | Valor |
|---|---|
| Nome de exibição | `ISPAgent` |
| Slug | `isp-agent` |
| Docker Compose project | `ispagent` |
| Serviços | `ispagent-web`, `ispagent-api`, `ispagent-worker`, `ispagent-db`, `ispagent-redis` |
| Banco | `ispagent` |
| Packages | `@ispagent/web`, `@ispagent/api`, `@ispagent/shared` |
| Prefixo de env vars | `ISPAGENT_` |
| Portas locais | web `3000`, api `3001`, db `5433`, redis `6380` |

Identificadores adicionais derivam desta raiz e são registrados em `DECISIONS.md`.

---

## 3. Arquitetura Obrigatória

### 3.1 Posicionamento
**AI Customer Operations for ISP.** Não é FAQ bot nem interface fina para um LLM genérico. O diferencial é
**contexto operacional real**. Antes de agir, o agente responde, nesta ordem:

1. Quem é este cliente? 2. O que ele está tentando resolver? 3. Que dados reais temos?
4. Que ferramentas existem e quais são permitidas agora? 5. O que resolve sozinho, o que exige
confirmação, o que vai para humano? 6. *(se PulseISP ligado)* O problema é individual ou coletivo?

### 3.2 Independência do PulseISP (regra dura)
ISPAgent funciona com ERP + Knowledge Base + ferramentas próprias + canal. PulseISP é camada opcional.

```
ERP → ISPAgent → Atendimento
                      ↑ (opcional)
PulseISP → PulseISPAdapter ↗
```

Comunicação entre os produtos **somente** via API versionada + adapter. Nunca acesso ao banco do outro.
Um provedor deve poder comprar só um, só o outro, ou os dois.

### 3.3 Fluxo Vertical (a espinha dorsal — vale mais que qualquer tela)

```
Mensagem recebida
 → cria/recupera conversa → classifica intenção → resolve identidade
 → consulta ERP (e PulseISP, se habilitado) → seleciona ferramentas permitidas pela policy
 → executa ferramentas → classifica resultado (FACT/INFERENCE/RECOMMENDATION/UNKNOWN)
 → responde, executa ação sob policy, ou faz handoff → registra tudo em auditoria
```

### 3.4 Contratos travados (`@ispagent/shared`)
Estes tipos são **normativos**. Nomes de campo podem crescer, nunca encolher nem mudar de semântica.

```ts
export type RiskTier   = 'READ' | 'WRITE_LOW_RISK' | 'WRITE_SENSITIVE' | 'ADMIN';
export type Assertion  = 'FACT' | 'INFERENCE' | 'RECOMMENDATION' | 'UNKNOWN';
export type RunMode    = 'LIVE' | 'DEMO';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type ToolStatus =
  | 'OK' | 'NOT_FOUND' | 'UNAUTHENTICATED' | 'BLOCKED_BY_POLICY'
  | 'NEEDS_CONFIRMATION' | 'NOT_SUPPORTED' | 'UPSTREAM_ERROR' | 'TIMEOUT';

export interface ToolResult<T = unknown> {
  toolCallId: string;
  tool: string;
  status: ToolStatus;
  source: { adapter: string; mode: RunMode; latencyMs: number; capability: string };
  data?: T;
  /** Fatos citáveis. O agente só pode afirmar o que existir aqui. */
  facts: Array<{ path: string; label: string; value: string | number | boolean | null }>;
  error?: { code: string; message: string };
  idempotencyKey?: string;
}

export interface PolicyDecision {
  action: string; tier: RiskTier; allowed: boolean;
  requiresConfirmation: boolean; reason: string;
  policyVersion: string; tenantId: string; evaluatedAt: string;
}

export interface Claim {
  text: string;
  type: Assertion;
  /** Obrigatório para FACT: referências "toolCallId#facts.path". */
  evidence: string[];
}

export interface AgentDecision {
  agentRunId: string; tenantId: string; conversationId: string;
  intent: string; intentConfidence: Confidence;
  identity: { customerId: string; contractId?: string; method: string;
              confidence: Confidence; resolvedAt: string } | null;
  toolCalls: string[];
  policyDecisions: PolicyDecision[];
  claims: Claim[];
  outcome: 'ANSWERED' | 'ACTION_EXECUTED' | 'AWAITING_CONFIRMATION' | 'BLOCKED' | 'HANDOFF';
  promptVersion: string; model: string; mode: RunMode;
}

export interface CustomerNetworkHealth {
  healthScore: number;                      // 0..100
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'OFFLINE' | 'UNKNOWN';
  optical: { rxDbm: number | null; txDbm: number | null;
             trend: 'STABLE' | 'DEGRADING' | 'IMPROVING' | 'UNKNOWN' };
  stability: { disconnects7d: number | null; reconnects7d: number | null;
               lastEventAt: string | null };
  activeAnomalies: Array<{ id: string; scope: 'INDIVIDUAL' | 'PON' | 'OLT' | 'REGION';
                           affectedCustomers: number | null; startedAt: string;
                           description: string }>;
  recommendations: string[];
  observedAt: string; mode: RunMode;
}
```

**Invariante executável (não negociável):** ao persistir um `AgentDecision`, todo `Claim` com
`type === 'FACT'` e `evidence` vazio, ou com evidência que não resolve para um `facts.path` de um
`ToolResult` daquele run, lança erro e o turno vira `HANDOFF`. Existe teste unitário provando isso.
Essa é a implementação concreta do princípio 1.1 — não é opcional e não é só prompt.

### 3.5 Tiers de risco

| Tier | Exemplos | Execução |
|---|---|---|
| `READ` | fatura, plano, status de chamado, diagnóstico | automática |
| `WRITE_LOW_RISK` | abrir chamado, registrar interesse comercial | automática ou configurável por tenant |
| `WRITE_SENSITIVE` | desbloqueio, alterar plano, reiniciar CPE | confirmação obrigatória e/ou humano |
| `ADMIN` | VLAN, OLT, provisionamento | **bloqueado no MVP** |

---

## 4. Tool Layer e Policy Engine

Ferramentas mínimas: `CustomerTool`, `ERPTool`, `BillingTool`, `SupportTool`, `PlanTool`,
`NetworkDiagnosticTool`, `KnowledgeTool`, `PulseISPTool`, `HumanHandoffTool`.

Cada uma declara: nome, descrição, schema de entrada e saída (Zod ou equivalente), `RiskTier`,
permissões necessárias, timeout, política de retry, tratamento de erro — e sempre devolve `ToolResult`.

**Pipeline, sem etapa pulável:**
`Agent → Tool Request → Schema Validation → Tenant Validation → Policy Engine → Permission Check →
Confirmation Check → Execução → ToolResult → Audit Log → Agent`

**Policy Engine por tenant**, configurável via UI e API:
`canCreateTicket`, `canAccessBilling`, `canSendInvoice`, `canPerformUnlock`,
`requiresConfirmationForUnlock`, `canQueryPulseISP`, `canChangePlan`, `maxToolCallsPerTurn`,
`maxTokensPerTurn`, `handoffAfterFailures`.

**Orçamento por turno:** limite duro de tool calls e de tokens, com default conservador
(`maxToolCallsPerTurn: 8`). Atingiu o limite sem resolver → handoff. Nunca loop silencioso.

**Circuit breaker e timeout** em todo adapter externo; falha de upstream vira `ToolResult` com
`UPSTREAM_ERROR`, nunca exceção vazando para a resposta ao cliente.

---

## 5. Domínio

### 5.1 Identity Resolution
Sinais: telefone/WhatsApp ID, CPF/CNPJ, contrato, login, e-mail, ID externo. Suportar: identificação
automática, confirmação em caso de ambiguidade, múltiplos contratos por pessoa, múltiplos clientes no
mesmo telefone, identidade não encontrada, identidade conflitante.

**Nunca vincular silenciosamente um canal a um contrato incerto.** Registrar fonte, método, confiança e
timestamp. Minimizar dado sensível pedido (não pedir CPF completo quando um fator mais fraco resolve).
Nada sensível é exposto antes da identidade verificada.

### 5.2 Conversation Engine
Entidades: `Conversation`, `ConversationParticipant`, `Message`, `AgentRun`, `ToolCall`, `ToolResult`,
`ConversationState`, `Handoff`, `AgentDecision`. O agente mantém, dentro da conversa: cliente, contrato em
discussão, problema relatado, ferramentas já usadas, ações já tomadas, chamado relacionado, se aguarda
confirmação — para não repetir perguntas, não reexecutar ferramentas e não duplicar chamados.

Compactação de histórico quando o turno exceder o orçamento de tokens — nunca enviar a transcrição
inteira a cada turno.

### 5.3 Intenção
`SUPORTE_INTERNET`, `SEM_CONEXAO`, `INTERNET_LENTA`, `QUEDAS`, `FINANCEIRO`, `SEGUNDA_VIA`, `PAGAMENTO`,
`BLOQUEIO`, `PLANO`, `UPGRADE`, `CONTRATACAO`, `CHAMADO`, `STATUS_CHAMADO`, `CANCELAMENTO`, `OUTRO`.
LLM, regras ou híbrido. Decisão irreversível nunca depende só da classificação.

### 5.4 Human Handoff (obrigatório)
Quando não resolve, o agente **não diz apenas que não sabe**: gera resumo estruturado (motivo, cliente,
contrato, intenção, problema relatado, ferramentas consultadas + resultados, ações realizadas, ações que
falharam, próxima ação sugerida) e entra na fila. Quando o humano assume, a IA para de responder naquela
conversa. Deve ser possível devolver para a IA depois, com as transições `AI → HUMAN → AI` auditadas.

### 5.5 Follow-up
Estrutura pronta (chamado encerrado → 24h → perguntar se resolveu) com um caso DEMO simples, via fila.
Não construir motor de campanhas.

---

## 6. Integrações

### 6.1 ERP
`integrations/erp/{demo,ixc,sgp}/` atrás de `ERPAdapter`. Nenhuma regra de negócio conhece IXC ou SGP.
Métodos conceituais: `findCustomer`, `getCustomer`, `getContracts`, `getPlans`, `getInvoices`,
`getFinancialStatus`, `getSupportTickets`, `createSupportTicket`, `getServiceStatus`.
Capacidade inexistente no ERP retorna `NOT_SUPPORTED` — nunca dado fabricado.

Ordem: (1) interface sólida → (2) adapter DEMO completo → (3) implementar de fato o ERP cuja documentação
você conseguir validar → (4) apenas estruturar o segundo → (5) nunca marcar integração fictícia como pronta.

**Antes de qualquer fluxo dependente de ERP/WhatsApp**, produza `docs/integration-capability-matrix.md`
cruzando capacidade × integração × status (`VALIDADO` / `NÃO VALIDADO` / `INDISPONÍVEL`), com a fonte da
validação (URL da doc oficial ou "sem documentação acessível"):

| Capacidade | IXC | SGP | PulseISP | WhatsApp |
|---|---|---|---|---|
| Buscar cliente | | | — | — |
| Consultar plano | | | — | — |
| Fatura / segunda via | | | — | — |
| Abrir chamado | | | — | — |
| Health Score | — | — | | — |
| Receber mensagem | — | — | — | |

### 6.2 PulseISP
`PulseISPAdapter` com `MockPulseISPAdapter` (sempre) e `RealPulseISPAdapter` (quando a API existir).
O agente consome apenas `CustomerNetworkHealth` (3.4) — o contrato de domínio não muda quando o
OpenAPI real chegar; só a implementação concreta muda. Não inventar endpoints do PulseISP.

Comportamento esperado:
- **Anomalia coletiva** (ONU offline + N clientes da mesma PON) → explicar indisponibilidade compartilhada,
  não mandar reiniciar roteador, não abrir chamado duplicado se já existe incidente.
- **Degradação individual** (reconexões frequentes, RX degradando, sem anomalia coletiva) → sugerir
  investigação técnica individual e abrir chamado com contexto se a policy permitir.

### 6.3 Canais
`ChannelAdapter`. **Web Chat próprio é o canal obrigatório do DEMO** e funciona 100% local, sem serviço
externo. WhatsApp: adapter + webhook handler somente conforme documentação oficial validada — nunca
automação não oficial disfarçada de produção. Sem credencial Meta: estruturar e marcar
`NÃO VALIDADO end-to-end`.

### 6.4 AI Provider
Abstração `AIProvider` com `AnthropicProvider`, `OpenAIProvider`, `MockAIProvider`. Implementar ao menos
um provider real usando só documentação oficial validada. Sem API key, o sistema roda inteiro em DEMO com
`MockAIProvider` — que nunca é apresentado como IA real e aparece como DEMO na UI. Falha em runtime:
registrar, retry controlado, oferecer handoff; nunca descartar mensagem.

Minimizar o que vai ao LLM ("cliente possui fatura vencida", não o extrato inteiro); documentar em
`docs/privacy-and-ai.md`. Prompts versionados em `prompts/` com versão, timestamp, modelo e configuração —
`promptVersion` entra em todo `AgentDecision`.

Registrar por tenant: modelo, tokens, tool calls, latência e custo estimado quando o provider expuser.

---

## 7. Segurança, Multi-Tenant e Observabilidade

- **Multi-tenant real:** usuários, clientes, integrações, prompts/config, KB, policies, conversas,
  ferramentas e logs isolados. Isolamento aplicado na camada de dados (não só no controller) e coberto por
  teste automatizado (P0.8).
- **RBAC:** `SUPER_ADMIN`, `TENANT_ADMIN`, `SUPERVISOR`, `AGENT`, `ANALYST`, `READ_ONLY`.
- **Segurança:** JWT + refresh, hash forte, validação de input, rate limiting, CSRF onde aplicável,
  headers seguros, criptografia de credenciais externas, secret management, sanitização de logs (nunca
  senha/token/API key), timeout + retry + circuit breaker, limite de tamanho de mensagem, LGPD.
- **Observabilidade:** health endpoints, logs estruturados, status de worker/fila/integrações/AI provider,
  última sincronização, latência média, falhas de tool e de agente.
- **Auditoria:** mensagem, agent run, tool solicitada, argumentos sanitizados, decisão de policy,
  resultado, ação executada, confirmação, erro, handoff, usuário humano, alteração administrativa.

---

## 8. Stack e Infraestrutura

| Camada | Escolha |
|---|---|
| Frontend | Next.js, React, TypeScript, Tailwind |
| Backend | NestJS, TypeScript |
| Banco | PostgreSQL, com migrations e índices em tenant, conversation, customer, externalId, phone, createdAt, status, handoff, intent, toolCall |
| Cache/fila | Redis + BullMQ (ingestão de documento, webhook, analytics, follow-up, sync/retry — não sobre-arquitetar mensagem simples) |
| ORM | Prisma ou TypeORM (decidir e registrar) |
| API | REST + OpenAPI/Swagger |
| Realtime | WebSocket ou SSE onde fizer sentido |
| Containers | Docker Compose, compatível com Docker Desktop no Windows |

Nada exige instalação local de Postgres, Redis, Node, fila ou banco vetorial — tudo sobe via Docker.
Knowledge Base: PostgreSQL full-text, pgvector ou equivalente justificado; se embeddings dependerem de
serviço externo, há fallback para o DEMO funcionar sem ele.

**Desempenho:** DEMO utilizável com ~5.000 clientes e ~10.000 conversas. Listas paginadas, sem N+1, sem
carregar transcrição inteira.

**UI:** SaaS B2B de telecom. Operacional, denso, sem card decorativo: tabelas, status, timeline, dados do
cliente, tool calls, decisões de policy, handoff.

---

## 9. Modo DEMO e Seed Determinístico

Banco limpo + seed = mesmos IDs lógicos sempre. O `verify` depende disso, então **estes valores são fixos**:

- Tenants: `tnt_demo_alpha` (Provedor Alpha) e `tnt_demo_beta` (Provedor Beta — existe só para provar isolamento).
- Login DEMO: `admin@alpha.ispagent.local` / `Demo!2026` (TENANT_ADMIN) · `operador@alpha.ispagent.local` / `Demo!2026` (AGENT) · `admin@beta.ispagent.local` / `Demo!2026`.
- Clientes do tenant Alpha, IDs `cus_demo_a` … `cus_demo_h`:

| ID | Cenário |
|---|---|
| `cus_demo_a` | Saudável |
| `cus_demo_b` | Fatura vencida e bloqueio financeiro |
| `cus_demo_c` | Quedas frequentes, degradação individual |
| `cus_demo_d` | Problema coletivo na PON (via MockPulseISP) |
| `cus_demo_e` | Plano antigo, candidato a upgrade |
| `cus_demo_f` | Chamado técnico já aberto |
| `cus_demo_g` | Identidade ambígua (dois contratos no mesmo telefone) |
| `cus_demo_h` | Telefone não cadastrado (não identificado) |

Todos os dados pessoais do seed são sintéticos e obviamente fictícios. Mocks explicitamente rotulados:
`MockERPAdapter`, `MockPulseISPAdapter`, `MockChannelAdapter`, `MockAIProvider`.

---

## 10. Plano de Execução por Fases e Gates

Siga em ordem, aplicando o loop da seção 0.6. O **gate** é um comando real; se ele não passa, a fase não
terminou. Adapte o runner (`pnpm`/`npm`) à escolha registrada em `DECISIONS.md`, mantendo os scripts com
estes nomes.

| # | Fase | Entregável central | Gate (comando literal) |
|---|---|---|---|
| 1 | Fundação | auditoria do repo, capability matrix, arquitetura, `docker-compose.yml`, `.env.example` | `docker compose up -d --wait` sobe os 5 serviços saudáveis |
| 2 | Banco e tenancy | schema, migrations, seed determinístico, auth JWT+refresh, RBAC | `pnpm db:migrate && pnpm db:seed && pnpm test tenancy` verde |
| 3 | Conversa e identidade | Conversation Engine, Identity Resolution, auditoria | `pnpm test identity conversation` verde, incluindo caso ambíguo `cus_demo_g` |
| 4 | Tool layer e policy | `ToolResult`, pipeline completo, Policy Engine, idempotência | `pnpm test tools policy idempotency` verde |
| 5 | ERP | `ERPAdapter` + `MockERPAdapter` completo, Billing/Support/Plan tools | `pnpm test erp billing support` verde |
| 6 | Inteligência | `AIProvider` + `MockAIProvider` + 1 provider real, Agent Orchestrator, invariante de `Claim`, Knowledge Base | `pnpm test agent claims knowledge` verde |
| 7 | PulseISP | `PulseISPAdapter` + mock, comportamento coletivo vs individual, produto funcionando com flag desligada | `pnpm test pulseisp` verde nos dois modos (ligado/desligado) |
| 8 | Handoff e console | fila humana, resumo estruturado, takeover, retorno para IA | `pnpm test handoff` verde |
| 9 | Canais e UI | Web Chat, painel admin, dashboard, telas da seção 10.1, adapter WhatsApp estruturado | `pnpm build` verde e Web Chat responde ponta a ponta |
| 10 | Validação | testes adversariais, `verify.ps1`/`verify.sh`, evidências, documentação, relatório | `.\scripts\verify.ps1 -Fresh` exit code 0 |

### 10.1 Telas obrigatórias
Login · Dashboard · Conversas · Fila humana · Detalhe da conversa (com timeline de tool calls e decisões
de policy) · Clientes · Knowledge Base · Integrações · Configuração ERP · Configuração PulseISP ·
Políticas · Ferramentas · Configuração do agente · Usuários · Auditoria · Web Chat DEMO.

### 10.2 Dashboard — métricas reais
Conversas hoje · resolvidas por IA · transferidas · tempo médio · principais intenções · chamados criados ·
tool calls e taxa de sucesso · ações recusadas pela policy · erros de integração · diagnósticos PulseISP
usados · satisfação quando coletada. Nada de "economia estimada" sem base.

---

## 11. Critérios de Aceitação

### P0 — inegociáveis, cada um com verificação executável

| ID | Critério | Como é provado |
|---|---|---|
| P0.1 | Cliente conhecido é identificado no contrato correto | teste + evidência `customer-resolution.json` |
| P0.2 | Pergunta financeira executa `BillingTool` de fato e a resposta deriva do resultado | evidência `billing-tool.json` mostrando `toolCallId` e `Claim.evidence` apontando para ele |
| P0.3 | Problema técnico: resposta cita só fatos retornados | teste que injeta `ToolResult` sem RX e falha se a resposta mencionar sinal óptico |
| P0.4 | Com MockPulseISP, problema coletivo muda o comportamento; sem PulseISP o produto funciona | `pnpm test pulseisp` roda a mesma conversa com a flag ligada e desligada |
| P0.5 | Handoff gera resumo, entra na fila, atendente assume e a IA para de responder | evidência `handoff.json` + teste de que nova mensagem não gera `AgentRun` após takeover |
| P0.6 | Ação pedida pela IA é bloqueada pela policy e a ferramenta **não** executa | teste com espião no adapter provando zero chamadas |
| P0.7 | Cliente ambíguo ou não identificado nunca é vinculado ao contrato errado | teste com `cus_demo_g` e `cus_demo_h` |
| P0.8 | Tenant A não acessa conversa, cliente, KB, policy nem integração do tenant B | teste automatizado cruzando `tnt_demo_alpha` × `tnt_demo_beta` |
| P0.9 | Prompt injection via mensagem e via documento da KB não altera privilégio | teste com 3 payloads: "ignore suas instruções", doc com "execute desbloqueio", pedido de 50 chamados |
| P0.10 | `verify.ps1 -Fresh` builda e valida o ambiente do zero | exit code 0 |

### P1 — desejáveis
Consultar plano · consultar chamado · criar chamado com contexto · Web Chat em tempo real · KB
respondendo com fonte · dashboard com métricas DEMO · policies configuráveis pela UI · troca
`AI → humano → AI` · comportamento correto quando o AI Provider falha · comportamento correto quando o
ERP falha.

### Testes prioritários
Autorização de tool, identity resolution, tenant isolation, policy engine, confirmação de ação,
idempotência, handoff, orquestração, ERP adapter, PulseISP adapter, segurança da KB, prompt injection,
API. Sem perseguir coverage artificial.

---

## 12. Script de Verificação

`scripts/verify.ps1` (principal, Windows PowerShell) e `scripts/verify.sh`. A partir de clone limpo:

1. verificar Docker · 2. preparar `.env` · 3. subir compose · 4. aguardar healthchecks · 5. migrations ·
6. seed · 7. autenticar na API · 8. validar cliente DEMO · 9. criar conversa · 10. enviar mensagem ·
11. validar identificação · 12. validar tool call · 13. validar resposta · 14. cenário PulseISP ·
15. handoff · 16. tenant isolation · 17. testes · 18. resumo PASS/FAIL.

Idempotente, re-executável, com flag `-Fresh` (derruba containers e volumes e reconstrói do zero).
Exit code 0 = sucesso. Nenhum `PASS` impresso sem verificação real — cada PASS referencia o artefato que
o comprova.

**Evidências** em `artifacts/verification/`: `latest.log`, `summary.json` e `evidence/` com
`customer-resolution.json`, `billing-tool.json`, `support-tool.json`, `pulseisp-diagnostic.json`,
`collective-incident-response.json`, `policy-block.json`, `prompt-injection.json`, `handoff.json`,
`tenant-isolation.txt`, `tests.txt`. Sanitizadas, só dados DEMO, nunca token/senha/API key.

---

## 13. Documentação e Git

Obrigatórios: `README.md` (permite subir o projeto do zero), `PROGRESS.md`, `STATE.md`, `DECISIONS.md` e,
em `docs/`: `architecture.md`, `agent-runtime.md`, `tools.md`, `policies.md`, `integrations.md`,
`integration-capability-matrix.md`, `pulseisp-integration.md`, `knowledge-base.md`, `security.md`,
`privacy-and-ai.md`, `acceptance-evidence.md`.

`DECISIONS.md`, por decisão: data, fase, decisão, alternativas consideradas, justificativa,
reversibilidade — especialmente AI provider, ORM, RAG, policies, arquitetura de tools e canais, escopo de
ERP, contrato do PulseISP.

Git: commits incrementais por marco coerente e verde
(`feat(agent): implement tool orchestration`, `feat(identity): add customer resolution`,
`feat(handoff): human takeover workflow`). Nada de commit quebrado ou fragmentado artificialmente.

---

## 14. Fora de Escopo

Voice agent, telefonia, Instagram/Facebook/Telegram, campanhas em massa, CRM completo, ERP ou billing
próprios, ML/fine-tuning, múltiplos providers de WhatsApp, dezenas de ERPs ou modelos, provisionamento de
rede, VLAN, configuração de OLT, ações perigosas de rede, app mobile. Arquitetura extensível sim,
implementação não.

**Teste de priorização:** antes de adicionar qualquer coisa, pergunte — *isso ajuda o agente a entender o
cliente, obter contexto confiável, resolver o problema, executar uma ação segura ou fazer um handoff
melhor?* Se não, fica fora.

**Proibido criar:** botão sem ação, tela vazia, endpoint fictício, integração falsa, tool sem
autorização, IA com acesso irrestrito, "IA" que é fluxo hardcoded escondido.

---

## 15. Definition of Done

`verify.ps1 -Fresh` passa · Docker saudável · migrations e seed determinístico funcionam · login funciona ·
multi-tenant isolado e testado · Web Chat funciona · Conversation Engine funciona · Identity Resolution
funciona e não associa cliente ambíguo · Agent Orchestrator funciona · tool calling é real · invariante de
`Claim`/evidência ativa · Policy Engine bloqueia de fato · ERP DEMO, Billing Tool e Support Tool funcionam ·
PulseISP Mock funciona e o produto funciona sem ele · problema coletivo muda o atendimento quando PulseISP
está ativo · Knowledge Base funciona · Handoff funciona com takeover e retorno · auditoria existe · testes
críticos passam · evidências existem · capability matrix reflete a realidade · README sobe o projeto do zero.

---

## 16. Relatório Final

Ao esgotar o que é possível fazer, responda **apenas** com um relatório objetivo: (1) o que foi realmente
implementado; (2) arquitetura; (3) containers; (4) AI Provider real vs. DEMO; (5) integrações ERP reais vs.
estruturadas; (6) status WhatsApp; (7) status PulseISP; (8) capability matrix; (9) resultado de
`verify.ps1 -Fresh` com exit code; (10) P0 aprovados/reprovados, um a um; (11) P1 aprovados/reprovados;
(12) testes (quantidade e o que cobrem); (13) URL local; (14) credenciais DEMO; (15) resumo de
`DECISIONS.md`; (16) limitações reais; (17) próximos passos.

Não declare pronto o que não está. Não esconda limitação. Profundidade e funcionamento real acima de
quantidade de telas. O produto só está concluído quando
**cliente → conversa → identidade → ferramenta → dado real → decisão → ação segura ou handoff**
funciona de ponta a ponta.
