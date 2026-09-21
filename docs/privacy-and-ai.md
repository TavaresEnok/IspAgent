# Privacidade e AI Provider

## Status nesta sessão

`ISPAGENT_ANTHROPIC_API_KEY` está vazia neste ambiente → o sistema roda inteiro com `MockAIProvider`
(`RunMode` = `DEMO`), como a seção 6.4 exige. `AnthropicProvider` está implementado e testável quanto à
lógica de parsing/prompt (ver `apps/api/src/integrations/ai/anthropic.provider.ts`), mas **não foi
exercitado contra a API real da Anthropic nesta sessão** — não há como validar isso sem uma chave. Se uma
chave for configurada depois, `AiProviderModule` passa a selecioná-lo automaticamente, sem mudar nenhuma
regra de negócio (a interface `AIProvider` é a mesma).

`OpenAIProvider` é um stub estruturado (lança erro explícito se chamado) — não implementado nesta sessão,
ver `DECISIONS.md`.

## O que vai para o modelo

O `AgentOrchestratorService` nunca manda a "extração de dados" completa de um cliente para o
`AIProvider`. Ele manda:

- A mensagem do cliente (texto livre, já é o que o cliente digitou).
- A intenção classificada e o `toolStatus`.
- Uma lista curta de **fatos já resolvidos** (`label` + `value`) vindos de `ToolResult.facts` — nunca o
  objeto de dados inteiro do ERP, nunca a fatura inteira, nunca o CPF do cliente. Exemplo real do que é
  enviado: `{label: "Fatura em atraso", value: true}`, não o array de faturas completo com valores,
  datas, código de barras etc.

O prompt do `AnthropicProvider` (ver `composeReply` em `anthropic.provider.ts`) instrui explicitamente o
modelo a usar **apenas** os fatos fornecidos e a admitir quando não há informação suficiente — mas a
garantia estrutural real, que não depende de o modelo "obedecer" à instrução, é o invariante de
`Claim`/`evidence` da seção 3.4 (`apps/api/src/agent/claim-validator.service.ts` — ver também
`docs/agent-runtime.md`): toda afirmação de fato (`Claim.type === 'FACT'`) do `AgentDecision` é
construída pelo próprio orquestrador diretamente a partir de `ToolResult.facts`, não a partir de texto
livre gerado pelo modelo. O modelo só fraseia a resposta ao cliente; ele não decide o que conta como
fato.

## Prompts versionados

`promptVersion` (constante `PROMPT_VERSION` em `agent-orchestrator.service.ts`, formato
`agent-v<n>-<data>`) entra em todo `AgentDecision` e em todo `AgentRun` persistido — mudanças no prompt
do sistema (seja no `MockAIProvider`, seja no `AnthropicProvider`) devem incrementar essa versão.

## Minimização e mascaramento

- CPF/CNPJ (`Customer.document`) nunca é enviado ao `AIProvider`.
- Nenhum dado de outro cliente é acessível: o isolamento de tenant (ver `docs/architecture.md`) já
  impede isso na camada de dados, antes mesmo de chegar ao agente.
- Identidade não verificada (`AMBIGUOUS`/`NOT_FOUND`) nunca expõe dado de conta nenhuma — o orquestrador
  não chama `BillingTool`/`PlanTool`/`SupportTool` sem `customerId`/`contractId` confirmados (P0.7).

## Registro de custo/uso

Ainda não implementado nesta sessão (fica para quando houver um provider real medido em produção — o
SDK da Anthropic expõe `usage` na resposta; `AnthropicProvider` pode ser estendido para registrar
tokens/latência por tenant quando isso for priorizado).
