# Capability Matrix — Integrações

Cruzamento capacidade × integração × status, conforme seção 6.1 do prompt de execução. Atualizado a
cada fase que toca uma integração. Status possíveis: `VALIDADO` (implementado e comprovado contra
documentação oficial ou ambiente real), `NÃO VALIDADO` (implementado em modo DEMO, sem credencial/API
real para comprovar), `INDISPONÍVEL` (não implementado nesta fase).

**Nesta sessão não há acesso a credenciais de IXC, SGP, PulseISP ou WhatsApp Business/Meta.** Nenhuma
dessas integrações pode, portanto, ser marcada `VALIDADO` — isso exigiria uma API real ou documentação
oficial acessível para conferência ponto a ponto, o que a seção 0.2 proíbe presumir.

| Capacidade | IXC | SGP | PulseISP | WhatsApp |
|---|---|---|---|---|
| Buscar cliente | NÃO VALIDADO (interface + demo planejados, fase 5) | NÃO VALIDADO (interface + demo planejados, fase 5) | — | — |
| Consultar plano | NÃO VALIDADO (fase 5) | NÃO VALIDADO (fase 5) | — | — |
| Fatura / segunda via | NÃO VALIDADO (fase 5) | NÃO VALIDADO (fase 5) | — | — |
| Abrir chamado | NÃO VALIDADO (fase 5) | NÃO VALIDADO (fase 5) | — | — |
| Health Score | — | — | NÃO VALIDADO (fase 7, mock apenas — sem OpenAPI real do PulseISP disponível) | — |
| Receber mensagem | — | — | — | INDISPONÍVEL (fase 9 estrutura o adapter/webhook; sem credencial Meta, fica `NÃO VALIDADO end-to-end` mesmo depois de implementado) |

## Fonte da validação

| Integração | Fonte consultada | Resultado |
|---|---|---|
| IXC | nenhuma documentação oficial fornecida/acessível nesta sessão | sem base para validar endpoints reais; `ERPAdapter` + `MockERPAdapter` seguirão a interface conceitual da seção 6.1, sem inventar payloads específicos do IXC |
| SGP | nenhuma documentação oficial fornecida/acessível nesta sessão | idem |
| PulseISP | produto irmão citado no prompt, sem OpenAPI compartilhado nesta sessão | `PulseISPAdapter` consumirá apenas o contrato `CustomerNetworkHealth` (seção 3.4); `RealPulseISPAdapter` fica como stub que lança `NOT_SUPPORTED` até o OpenAPI real chegar |
| WhatsApp Cloud API | documentação pública da Meta existe e é consultável, mas nenhuma credencial (App Secret, token, verify token) foi fornecida nesta sessão para validar ponta a ponta | adapter/webhook handler serão estruturados seguindo o formato público conhecido da Cloud API (payloads de webhook, verificação de assinatura), mas o rótulo fica `NÃO VALIDADO end-to-end` até haver credencial real para testar |

## Regra de atualização

Sempre que uma fase implementar ou validar uma capacidade nova, esta tabela é editada no mesmo commit —
nunca depois, nunca por lembrança. Se uma linha continuar `NÃO VALIDADO`/`INDISPONÍVEL` ao final do
projeto, isso é reportado como limitação real no relatório final (seção 16), não escondido.
