# Capability Matrix — Integrações

Cruzamento capacidade × integração × status, conforme seção 6.1 do prompt de execução. Atualizado a
cada fase que toca uma integração. Status possíveis: `VALIDADO` (implementado e comprovado contra
documentação oficial ou ambiente real), `NÃO VALIDADO` (implementado em modo DEMO, sem credencial/API
real para comprovar), `INDISPONÍVEL` (não implementado nesta fase).

**Nesta sessão não há acesso a credenciais de IXC, SGP, PulseISP ou WhatsApp Business/Meta.** Nenhuma
dessas integrações pode, portanto, ser marcada `VALIDADO` — isso exigiria uma API real ou documentação
oficial acessível para conferência ponto a ponto, o que a seção 0.2 proíbe presumir.

| Capacidade | ERP DEMO (Mock) | IXC | SGP | PulseISP | WhatsApp |
|---|---|---|---|---|---|
| Buscar cliente | ✅ VALIDADO (real contra Postgres seedado, `test/erp.spec.ts`) | ESTRUTURADO, NÃO VALIDADO (sem doc oficial acessível) | ESTRUTURADO, NÃO VALIDADO (idem) | — | — |
| Consultar plano | ✅ VALIDADO (`test/erp.spec.ts`, `PlanTool`) | ESTRUTURADO, NÃO VALIDADO | ESTRUTURADO, NÃO VALIDADO | — | — |
| Fatura / segunda via | ✅ VALIDADO (`BillingTool`, `test/billing.spec.ts` — inclui P0.2) | ESTRUTURADO, NÃO VALIDADO | ESTRUTURADO, NÃO VALIDADO | — | — |
| Abrir chamado | ✅ VALIDADO (`SupportTool`, idempotente, `test/support.spec.ts`) | ESTRUTURADO, NÃO VALIDADO | ESTRUTURADO, NÃO VALIDADO | — | — |
| Health Score | — | — | — | NÃO VALIDADO (fase 7, mock apenas — sem OpenAPI real do PulseISP disponível) | — |
| Receber mensagem | — | — | — | — | INDISPONÍVEL (fase 9 estrutura o adapter/webhook; sem credencial Meta, fica `NÃO VALIDADO end-to-end` mesmo depois de implementado) |

"ESTRUTURADO, NÃO VALIDADO" (IXC/SGP) = a classe implementa `ERPAdapter` (`IXCAdapter`/`SGPAdapter`,
seção 6.1 passo 4) mas todo método lança erro explicando a ausência de documentação — nunca retorna dado
fabricado se fosse chamado por engano.

## AI Provider (seção 6.4)

| Provider | Status |
|---|---|
| `MockAIProvider` | ✅ VALIDADO — é o que roda de fato nesta sessão (`ISPAGENT_ANTHROPIC_API_KEY` vazia), testado em `test/agent.spec.ts`, `test/claims.spec.ts` |
| `AnthropicProvider` | ESTRUTURADO, NÃO VALIDADO end-to-end — implementado contra a documentação oficial do SDK `@anthropic-ai/sdk`, lógica de prompt/parsing testável, mas nenhuma chave real disponível nesta sessão para chamar a API de verdade |
| `OpenAIProvider` | INDISPONÍVEL — stub que lança erro explícito, não implementado (ver DECISIONS.md) |

## Fonte da validação

| Integração | Fonte consultada | Resultado |
|---|---|---|
| IXC | nenhuma documentação oficial fornecida/acessível nesta sessão | sem base para validar endpoints reais; `ERPAdapter` + `MockERPAdapter` seguirão a interface conceitual da seção 6.1, sem inventar payloads específicos do IXC |
| SGP | nenhuma documentação oficial fornecida/acessível nesta sessão | idem |
| PulseISP | produto irmão citado no prompt, sem OpenAPI compartilhado nesta sessão | `PulseISPAdapter` consumirá apenas o contrato `CustomerNetworkHealth` (seção 3.4); `RealPulseISPAdapter` fica como stub que lança `NOT_SUPPORTED` até o OpenAPI real chegar |
| WhatsApp Cloud API | documentação pública da Meta existe e é consultável, mas nenhuma credencial (App Secret, token, verify token) foi fornecida nesta sessão para validar ponta a ponta | adapter/webhook handler serão estruturados seguindo o formato público conhecido da Cloud API (payloads de webhook, verificação de assinatura), mas o rótulo fica `NÃO VALIDADO end-to-end` até haver credencial real para testar |
| Anthropic (Claude) | documentação oficial do `@anthropic-ai/sdk` | SDK integrado e lógica testável, mas sem `ISPAGENT_ANTHROPIC_API_KEY` nesta sessão para uma chamada real — ver `docs/privacy-and-ai.md` |

## Regra de atualização

Sempre que uma fase implementar ou validar uma capacidade nova, esta tabela é editada no mesmo commit —
nunca depois, nunca por lembrança. Se uma linha continuar `NÃO VALIDADO`/`INDISPONÍVEL` ao final do
projeto, isso é reportado como limitação real no relatório final (seção 16), não escondido.
