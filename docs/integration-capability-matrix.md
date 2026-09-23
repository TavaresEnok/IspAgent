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
| Buscar cliente | ✅ VALIDADO (real contra Postgres seedado, `test/erp.spec.ts`) | ESTRUTURADO, NÃO VALIDADO (sem doc oficial acessível) | 🟡 REAL IMPLEMENTADO (`SGPAdapter` + `POST /api/ura/consultacliente/`, testado em `test/sgp.spec.ts`; aguarda liberação de IP no painel do SGP) | — | — |
| Consultar plano | ✅ VALIDADO (`test/erp.spec.ts`, `PlanTool`) | ESTRUTURADO, NÃO VALIDADO | 🟡 REAL IMPLEMENTADO (`GET /api/ura/consultaplano/`, testado em `test/sgp.spec.ts`) | — | — |
| Fatura / segunda via | ✅ VALIDADO (`BillingTool`, `test/billing.spec.ts` — inclui P0.2) | ESTRUTURADO, NÃO VALIDADO | 🟡 REAL IMPLEMENTADO (`POST /api/ura/titulos/` + PIX, testado em `test/sgp.spec.ts`) | — | — |
| Abrir chamado | ✅ VALIDADO (`SupportTool`, idempotente, `test/support.spec.ts`) | ESTRUTURADO, NÃO VALIDADO | 🟡 REAL IMPLEMENTADO (`POST /api/ura/chamado/`, testado em `test/sgp.spec.ts`) | — | — |
| Health Score | — | — | — | ✅ VALIDADO (mock, `test/pulseisp.spec.ts`, P0.3/P0.4). 🟡 REAL IMPLEMENTADO, AINDA NÃO VALIDADO com dados reais (2026-09-18): `RealPulseISPAdapter` + mapeador escritos a partir do OpenAPI/código do próprio PulseISP e testados com fixtures (`test/pulseisp-real.spec.ts`); falta um login de leitura para rodar contra o PulseISP de verdade (botão "Testar" + simulador na tela PulseISP) | — |
| Receber mensagem | — | — | — | — | INDISPONÍVEL (fase 9 estrutura o adapter/webhook; sem credencial Meta, fica `NÃO VALIDADO end-to-end` mesmo depois de implementado) |

"ESTRUTURADO, NÃO VALIDADO" (IXC) = a classe implementa `ERPAdapter` mas todo método lança erro explicando a ausência de documentação.
"REAL IMPLEMENTADO" (SGP) = `SgpClientService` e `SGPAdapter` implementados a partir da documentação oficial (`docs/SGP-API.md`), com testes unitários cobrindo o mapeamento de clientes, contratos, planos, faturas (com PIX) e chamados (`test/sgp.spec.ts`). Validado localmente com mocks; pronto para execução ao vivo contra `vibetelecom.sgp.net.br` assim que o IP for liberado no painel do SGP.

## AI Provider (seção 6.4)

| Provider | Status |
|---|---|
| `MockAIProvider` | ✅ VALIDADO — é o que roda de fato nesta sessão (`ISPAGENT_ANTHROPIC_API_KEY` vazia), testado em `test/agent.spec.ts`, `test/claims.spec.ts` |
| `AnthropicProvider` | ESTRUTURADO, NÃO VALIDADO end-to-end — implementado contra a documentação oficial do SDK `@anthropic-ai/sdk`, lógica de prompt/parsing testável, mas nenhuma chave real disponível nesta sessão para chamar a API de verdade |
| `OpenAIProvider` | INDISPONÍVEL — stub que lança erro explícito, não implementado (ver DECISIONS.md) |

## Canais (seção 6.3)

| Canal | Status |
|---|---|
| Web Chat | ✅ VALIDADO end-to-end — testado no browser real (não só curl): identidade resolvida por telefone, `BillingTool`/`SupportTool` executados a partir de mensagem digitada, chamado real criado, timeline visível no painel. `POST/GET /public/webchat/:tenantId/...` (Fase 9). |
| WhatsApp Cloud API | NÃO VALIDADO end-to-end — sem credencial Meta (ver tabela de integrações acima) |

## Fonte da validação

| Integração | Fonte consultada | Resultado |
|---|---|---|
| IXC | nenhuma documentação oficial fornecida/acessível nesta sessão | sem base para validar endpoints reais; `ERPAdapter` + `MockERPAdapter` seguirão a interface conceitual da seção 6.1, sem inventar payloads específicos do IXC |
| SGP | Documentação oficial em `docs/SGP-API.md`, guia público de autenticação do Bookstack (`autenticacoes-via-api`) e instância real da Vibe Telecom (`https://vibetelecom.sgp.net.br`) | `SgpClientService` e `SGPAdapter` implementados; autenticação via `token` e `app` (`webchatnoc`) nas rotas da URA (`/api/ura/`). Testado unitariamente com mocks dos payloads reais em `test/sgp.spec.ts`. Chamadas ao vivo retornam HTTP 403 enquanto o IP da máquina (`168.194.15.42`) não for inserido na lista de Hosts Permitidos do Token no SGP. |
| PulseISP | produto irmão rodando na mesma máquina (API em `:4000`, OpenAPI em `/api/docs-json`, auth por login/JWT). Tem um tenant real (`vibe-telecom`, ~3.172 clientes via SGP) | `RealPulseISPAdapter` (2026-09-18): lê `GET /customers/{id}` (Customer 360) e `GET /anomalies/{id}` e mapeia para `CustomerNetworkHealth`; só para contratos `pulse_*` (clientes reais escolhidos no simulador do painel), o resto segue no mock. SOMENTE leitura. Limitações reais: o PulseISP não fornece faturas nem chamados nesse formato, então o agente NÃO responde financeiro/chamado de cliente real (escala para humano); escopo de anomalia `CONCENTRATOR` vira `REGION`; `reconnects7d` fica `null` (o PulseISP não separa de quedas) |
| WhatsApp Cloud API | documentação pública da Meta existe e é consultável, mas nenhuma credencial (App Secret, token, verify token) foi fornecida nesta sessão para validar ponta a ponta | adapter/webhook handler serão estruturados seguindo o formato público conhecido da Cloud API (payloads de webhook, verificação de assinatura), mas o rótulo fica `NÃO VALIDADO end-to-end` até haver credencial real para testar |
| Anthropic (Claude) | documentação oficial do `@anthropic-ai/sdk` | SDK integrado e lógica testável, mas sem `ISPAGENT_ANTHROPIC_API_KEY` nesta sessão para uma chamada real — ver `docs/privacy-and-ai.md` |

## Regra de atualização

Sempre que uma fase implementar ou validar uma capacidade nova, esta tabela é editada no mesmo commit —
nunca depois, nunca por lembrança. Se uma linha continuar `NÃO VALIDADO`/`INDISPONÍVEL` ao final do
projeto, isso é reportado como limitação real no relatório final (seção 16), não escondido.
