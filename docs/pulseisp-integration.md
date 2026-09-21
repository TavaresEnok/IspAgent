# Integração PulseISP

## Independência (seção 3.2)

ISPAgent funciona inteiro sem PulseISP. A flag `ISPAGENT_PULSEISP_ENABLED` (default `false` em
`.env.example`) decide se o `AgentOrchestratorService` chama o `PulseISPTool` para intenções de rede
(`SEM_CONEXAO`, `INTERNET_LENTA`, `QUEDAS`, `SUPORTE_INTERNET`). Desligada, essas intenções caem para o
`KnowledgeTool` — exatamente o comportamento da Fase 6, sem nenhuma regressão. `test/pulseisp.spec.ts`
roda a mesma conversa/mensagem com a flag nos dois estados (P0.4).

## Contrato (seção 3.4 / 6.2)

O agente só conhece `CustomerNetworkHealth` (`packages/shared`). `PulseISPAdapter` tem duas
implementações:

- `MockPulseISPAdapter`: telemetria sintética determinística por contrato (sempre disponível).
- `RealPulseISPAdapter`: stub — sem OpenAPI do PulseISP validado nesta sessão, lança erro explícito se
  chamado (`docs/integration-capability-matrix.md`).

## Comportamento coletivo vs individual

`ctt_demo_c` (seed): degradação individual — `status: DEGRADED`, sinal óptico em piora, sem anomalia
coletiva. `ctt_demo_d`: incidente coletivo — `activeAnomalies` com `scope: 'PON'` e
`affectedCustomers > 1`.

`PulseISPTool` (`apps/api/src/tools/pulseisp-tool.ts`) monta os `facts` de forma diferente conforme o
caso:
- **Coletivo**: cita o escopo do incidente e quantos clientes são afetados — nunca inclui o fact de
  sinal óptico individual (P0.3: a resposta final nunca menciona algo que não veio do `ToolResult`).
- **Individual**: cita o sinal óptico (`rxDbm`) quando disponível.

Isso é o que garante, estruturalmente (não por prompt), que um cliente afetado por um problema coletivo
recebe uma explicação de indisponibilidade compartilhada, e um cliente com degradação individual recebe
um diagnóstico técnico individual — sem depender do modelo de IA "lembrar" de diferenciar os dois casos.

## Fora de escopo nesta fase

- Evitar chamado duplicado quando já existe um incidente coletivo aberto: o orquestrador desta sessão
  não abre chamado automaticamente a partir de intenção de rede (só a intenção `CHAMADO` explícita cria
  ticket) — então o cenário "não duplicar chamado por incidente coletivo" não se aplica ainda com este
  desenho. Registrado como limitação real, não escondida.
