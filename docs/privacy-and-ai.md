# Privacidade e AI Provider

## Status nesta sessão

O provider de IA é escolhido **por tenant** na tela "IA" do painel (a chave fica no banco, cifrada — ver
`docs/security.md`), não por variável de ambiente. Sem chave salva, o tenant roda com `MockAIProvider`
(`RunMode` = `DEMO`), como a seção 6.4 exige. `AnthropicProvider` e `GeminiProvider` têm timeout e
parsing tolerante a ```` ```json ```` e são cobertos por testes com cliente simulado
(`apps/api/test/ai-safety.spec.ts`); a validação ponta a ponta contra a API real depende de uma chave.

`OpenAIProvider` é um stub estruturado (lança erro explícito se chamado) — não implementado nesta sessão,
ver `DECISIONS.md`.

## O que vai para o modelo

O `AgentOrchestratorService` nunca manda a "extração de dados" completa de um cliente para o
`AIProvider`. Ele manda:

- A mensagem do cliente e as últimas falas da conversa (texto livre) — **com dados pessoais mascarados**
  antes de sair: CPF, CNPJ, e-mail, telefone e sequências longas de dígitos viram `[CPF]`, `[CNPJ]`,
  `[EMAIL]`, `[TELEFONE]`, `[NÚMERO]` (`apps/api/src/integrations/ai/pii-mask.ts`, aplicado dentro dos
  providers, também na classificação de intenção).
- A intenção classificada e o `toolStatus`.
- Só o **primeiro nome** do cliente identificado (para cumprimentar).
- Uma lista curta de **fatos já resolvidos** (`label` + `value`) vindos de `ToolResult.facts` — nunca o
  objeto de dados inteiro do ERP, nunca a fatura inteira, nunca o CPF do cliente. Exemplo real do que é
  enviado: `{label: "Fatura em atraso", value: true}`, não o array de faturas completo com valores,
  datas, código de barras etc.
- O nome do provedor (tenant) e o teto de tokens da policy.

O prompt instrui o modelo a usar **apenas** os fatos fornecidos. Mas instrução não é garantia — as
garantias que **não** dependem de o modelo obedecer são duas, e ambas são código:

1. **Fatos com procedência** (`ClaimValidator`, seção 3.4): toda `Claim` `FACT` do `AgentDecision` é
   construída pelo orquestrador a partir de `ToolResult.facts`, nunca do texto do modelo. Isto prova que
   os *fatos* têm origem — não prova o *texto* enviado ao cliente.
2. **Conferência da resposta** (`agent/reply-guard.ts`): antes de enviar, todo valor numérico, data ou
   moeda da resposta do LLM precisa existir nos fatos (ou na fala do próprio cliente), e a resposta não
   pode dizer que abriu chamado/agendou visita se nenhuma ferramenta fez isso. Se falhar, o texto do
   modelo é descartado e sai a resposta determinística (regras). Só se aplica a providers `LIVE`; o Mock
   já é determinístico.

## Prompts versionados

`promptVersion` (constante `PROMPT_VERSION` em `agent-orchestrator.service.ts`, formato
`agent-v<n>-<data>`) entra em todo `AgentDecision` e em todo `AgentRun` persistido — mudanças no prompt
do sistema (seja no `MockAIProvider`, seja no `AnthropicProvider`) devem incrementar essa versão.

## Minimização e mascaramento

- CPF/CNPJ (`Customer.document`) nunca é enviado ao `AIProvider`, e o que o cliente digita é mascarado
  antes de sair (ver acima). Na tela de staff o CPF só aparece completo para `SUPERVISOR`+.
- Nenhum dado de outro cliente é acessível: o isolamento de tenant (ver `docs/architecture.md`) já
  impede isso na camada de dados, antes mesmo de chegar ao agente.
- Identidade não verificada nunca expõe dado de conta: o orquestrador só chama
  `BillingTool`/`PlanTool`/`SupportTool` com `customerId`/`contractId` confirmados (P0.7) — e a
  confirmação só vem do telefone de um canal verificado (ou de demonstração) ou de um CPF/CNPJ completo,
  exato e único, com no máximo `MEDIUM` de confiança e bloqueio por tentativas (ver `docs/security.md`).
  Nunca por nome ou trecho de texto.

## Registro de custo/uso

Ainda não implementado nesta sessão (fica para quando houver um provider real medido em produção — o
SDK da Anthropic expõe `usage` na resposta; `AnthropicProvider` pode ser estendido para registrar
tokens/latência por tenant quando isso for priorizado).
