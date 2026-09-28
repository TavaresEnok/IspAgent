# Atendimento inteligente — pesquisa, arquitetura e plano de evolução

Setembro/2026. Documento de engenharia: o que as referências dizem, como isso se aplica ao ISPAgent, o
que já foi implementado e o que vem a seguir. Cada conclusão importante aponta a fonte.

## 1. Ponto de partida: as conversas reais de 28/09

Teste no WhatsApp da Vibe (número conectado por QR Code). O que deu errado e a causa:

| Sintoma | Causa |
|---|---|
| "Eita poxa", "Kkkkk" → "Não entendi. Responda com o número de uma das opções" (repetido) | O menu do fluxo só aceitava número/rótulo exato. |
| Depois de "Vou te passar para um atendente", o bot continuou falando ("Que loop é esse" recebeu saudação) | A IA só silenciava em `HUMAN_ACTIVE`; em `HANDOFF_PENDING` (fila) seguia respondendo. |
| Dois "robôs": o fluxo dizia "Vibe Telecom", a IA dizia "assistente do seu provedor de internet" | Texto fixo de reserva sem o nome da marca. |
| "Tá tudo certo" recebeu a mesma apresentação duas vezes, palavra por palavra | A reserva por regras não olhava o histórico. |
| "Só quero conversar com seu operador" → "Compreendo e peço desculpas…" | Desculpa fixa em qualquer pedido de atendente. |
| Respostas por regras em vez da IA | O Gemini (`gemini-3.5-flash-lite`) deu timeout de 15 s várias vezes e o sistema caiu para `rule-based-v1` (a reserva). |
| Contatos pessoais do número receberam o menu da Vibe | Todo privado era atendido; não havia modo teste nem descarte de mensagem antiga. |

## 2. O que as referências dizem (e o que foi efetivamente consultado)

Consultado nesta etapa (página oficial, resumo ou documentação — não leitura integral de livros):

- **ABCD — Action-Based Conversations Dataset** (Chen, Chen, Yang, Lin, Yu — NAACL 2021).
  https://aclanthology.org/2021.naacl-main.239/ — 10 mil+ diálogos humanos de suporte, 55 intenções. O
  atendimento é uma **sequência de ações exigida pela política da empresa**, não só texto; propõe medir
  *Action State Tracking* e *Cascading Dialogue Success*. Modelos neurais ficaram ~50 pontos abaixo do
  humano. Consequência para nós: a IA não deve "decidir o processo"; o processo é explícito e verificável.
- **Rasa CALM** — https://rasa.com/docs/learn/concepts/calm/ e padrões de reparo
  https://rasa.com/docs/reference/primitives/patterns/. O LLM faz *dialogue understanding* (vira comandos)
  e a lógica de negócio fica em *flows* determinísticos — "evita o LLM adivinhar a regra de negócio".
  Padrões de reparo nomeados: continuar fluxo interrompido, correção, cancelamento, pular pergunta,
  conversa solta (*chitchat*), concluído, esclarecimento, erro interno, "não consigo lidar", transferência
  humana, repetir mensagem, satisfação.
- **Dialogflow CX — Playbook best practices** —
  https://docs.cloud.google.com/dialogflow/cx/docs/concept/playbook/best-practices. Agentes focados por
  tarefa; exemplos valem mais que instruções perfeitas; "se a ferramenta não devolver dado, diga que não
  sabe"; evitar laços entre playbooks; respostas fixas onde velocidade importa; respostas concisas.
- **Chatwoot — Agent Bots** — https://www.chatwoot.com/hc/user-guide/articles/1677497472-how-to-use-agent-bots.
  Conversa nasce `pending` com o bot; na transferência vira `open` e o bot sai de cena; o atendente pode
  devolver ao bot voltando para `pending`.
- **TM Forum TMF621 (Trouble Ticket)** — https://www.tmforum.org/resources/specification/tmf621-trouble-ticket-api-rest-specification-r18-0-0/
  (e o OpenAPI em https://github.com/tmforum-apis/TMF621_TroubleTicket). Estados do chamado:
  acknowledged, rejected, pending, held, inProgress, cancelled, resolved, closed — "resolvido" e "fechado"
  são estados distintos.
- **NIST AI 600-1 (Generative AI Profile, jul/2024)** — confabulação ("conteúdo errado dito com
  confiança") é um dos 12 riscos centrais; tratar como problema de calibração e mostrar incerteza em
  decisões consequentes (resumo: https://casrai.org/guides/nist-ai-rmf-generative-ai-profile).

Não consultado nesta etapa (fica no plano): livros *Designing Bots* (Shevat) e *Conversational Design*
(Hall) — só conhecidos por referência; TM Forum eTOM; guias da ANPD; fórum do Rasa; código do Tiledesk
(o repositório está clonado em `projetos/tiledesk-estudo`, usado antes para o construtor de fluxo).

## 3. Arquitetura: princípio → onde está no ISPAgent

| Princípio (fonte) | ISPAgent |
|---|---|
| IA entende, regra executa (CALM) | `classifyIntents` (LLM, com regras de reserva) → orquestrador e fluxo publicados decidem; ferramentas passam pela policy. **Menu do fluxo agora usa a IA só para entender** (`flows/menu-interpreter.ts`). |
| Ação verificável, não texto (ABCD) | `ToolResult` + `Claims` com invariante de evidência (`claim-validator`), auditoria de cada `ToolCall`. |
| Não confabular (NIST) | `reply-guard`: texto do LLM que afirma algo fora dos fatos é descartado e trocado por resposta por regras. |
| Bot sai de cena na transferência (Chatwoot) | **Novo:** em `HANDOFF_PENDING` a IA fica quieta; no máximo um aviso a cada 20 min. |
| Chitchat (CALM) | **Novo:** risada/ok/obrigado/oi/tchau → resposta curta, sem consultar sistema, sem gastar IA, nunca repetida. |
| Esclarecimento / "não consigo lidar" (CALM) | **Novo:** texto livre fora das opções do menu vai para a IA; na reserva por regras, a segunda tentativa pede para reformular e oferece atendente. |
| Correção (CALM) | Já existia: "mandei o CPF errado" / "não sou o Fulano" troca o cadastro vinculado. |
| Cancelamento com retenção (ABCD) | Já existia: pergunta o motivo uma vez e transfere para retenção. |
| Resposta concisa e fixa onde cabe (Dialogflow) | Respostas por regras para fluxos críticos; LLM só fraseia fatos. |
| Resolvido ≠ fechado (TMF621) | **Pendente** (ver plano, item P1-3). |

## 4. Implementado nesta etapa

1. Menu que entende texto livre (IA do provedor → assunto → opção; ambíguo não escolhe por ninguém).
2. Texto que não é opção nenhuma passa para a IA em vez de "responda com o número".
3. Silêncio na fila humana, com aviso único por janela de 20 min.
4. Conversa solta tratada à parte (5 tipos), sem repetir a última fala.
5. Transferência com tom conforme o contexto (irritação reconhecida; pedido simples, sem desculpas).
6. Reserva por regras com o nome da marca e sem repetir a apresentação.
7. WhatsApp: mensagens com mais de 5 min ao chegar são ignoradas; **modo teste** por provedor (a IA só
   responde aos números da lista) na tela "WhatsApp".
8. Regras de reserva entendem mais formas comuns ("minha internet caiu", "sem net", "vive caindo").
9. Bateria `test/conversation-quality.spec.ts` com os casos reais acima.

## 5. Como medir (conversa encerrada ≠ problema resolvido)

- **Resolução efetiva:** atendimento da IA sem transferência **e** sem nova conversa do mesmo cliente sobre
  o mesmo assunto em 7 dias (reabertura). Hoje já temos `agent_runs.outcome`, `handoffs` e CSAT.
- **Taxa de transferência** por assunto e por motivo (identidade, pedido explícito, falha de IA, fluxo).
- **Falha de ferramenta / IA:** `tool_calls` com erro; turnos respondidos pela reserva (`model` contém
  "reserva de") — hoje é o indicador mais importante da qualidade percebida.
- **Interações até resolver** e **repetição** (mesma fala do bot duas vezes na conversa = defeito).
- **Avaliação automatizada:** conversas simuladas (seção 7) rodando como teste a cada mudança.

## 6. Plano de evolução (impacto × complexidade × risco)

| # | Item | Impacto | Complex. | Risco |
|---|---|---|---|---|
| P1-1 | **IA de reserva de outro fornecedor** (ex.: Anthropic/OpenAI) antes das regras quando o Gemini der timeout; timeout de classificação menor com uma nova tentativa | Alto | Baixa | Baixo |
| P1-2 | **Reincidência antes de responder** ("caiu de novo"): consultar chamados recentes e incidente coletivo antes de pedir procedimento; se reincidente, transferir com o histórico (ABCD) | Alto | Média | Médio |
| P1-3 | **Chamado com ciclo TMF621** (aberto → em andamento → resolvido → fechado) e confirmação com o cliente antes de fechar | Alto | Média | Médio |
| P2-1 | **Retomar assunto interrompido** (CALM *continue_interrupted*): cliente muda de assunto no meio da fatura e depois volta | Médio | Média | Baixo |
| P2-2 | **Devolução humano → IA** (Chatwoot `pending`): botão no painel para o atendente devolver a conversa | Médio | Baixa | Baixo |
| P2-3 | Painel de métricas da seção 5 por provedor | Médio | Média | Baixo |
| P2-4 | Avaliação com LLM-juiz sobre conversas simuladas (nota por critério: resolveu? repetiu? inventou?) | Médio | Média | Baixo |
| P3-1 | LGPD/ANPD: política de retenção de conversas por provedor e exportação/eliminação a pedido do titular | Médio | Média | Baixo |
| P3-2 | Leitura dos livros (Shevat, Hall) e eTOM para revisar tom, persona e integração entre setores | Baixo | — | — |

## 7. Casos de conversa para avaliação contínua

Comportamento esperado (os marcados ✓ já estão cobertos por teste automatizado):

1. ✓ "minha internet caiu de novo" no menu → escolhe "Problema na internet".
2. ✓ "quero pagar o boleto" no menu → 2ª via.
3. ✓ "kkkk" / "Eita poxa" no menu → IA conversa, sem "responda com o número".
4. ✓ "Tá tudo certo" duas vezes → respostas curtas e diferentes.
5. ✓ "ok" depois do pedido de CPF → não é conversa solta.
6. ✓ "Só quero falar com o operador" → transfere sem pedir desculpas.
7. ✓ "isso é um absurdo, quero atendente" → reconhece a frustração e transfere.
8. ✓ Mensagens na fila humana → silêncio; após 20 min, um aviso.
9. ✓ Mensagem acumulada ao reconectar → ignorada.
10. ✓ Modo teste → só números liberados recebem resposta.
11. ✓ CPF de outra pessoa / "não sou o Bruno" → troca o cadastro (testes existentes).
12. ✓ Cancelamento → pergunta o motivo uma vez, depois retenção (testes existentes).
13. ✓ Oferta de concorrente → retenção, não lead (testes existentes).
14. ✓ IA fora do ar → nunca inventa, transfere com aviso (testes existentes).
15. ✓ Pedido de "50 chamados" (prompt injection) → no máximo um (testes existentes).
16. "Caiu de novo, já é a terceira vez" → consultar chamados recentes antes de pedir para reiniciar (P1-2).
17. Fatura + internet lenta na mesma mensagem → atende os dois assuntos (multi-intenção existente; ampliar).
18. Cliente muda de assunto no meio da 2ª via e volta → retomar (P2-1).
19. Chamado resolvido pela equipe → perguntar ao cliente se normalizou antes de fechar (P1-3).
20. Queda coletiva na região → aviso coletivo, sem abrir chamado individual (PulseISP, existente).
