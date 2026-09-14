# Knowledge Base

## Mecanismo: full-text search nativo do Postgres

`KnowledgeService.search` (`apps/api/src/knowledge/knowledge.service.ts`) usa `to_tsvector`/
`plainto_tsquery`/`ts_rank` do Postgres (dicionário `portuguese`), via `$queryRaw`. Decisão registrada em
`DECISIONS.md` (2026-09-14): evita depender de um serviço externo de embeddings para o DEMO funcionar
sem credencial nenhuma. Trocar por `pgvector` depois é possível sem mudar o contrato do `KnowledgeTool`.

## Isolamento de tenant em SQL cru

`$queryRaw` **não passa** pela extensão de tenant-scoping do Prisma (ela só intercepta operações de
modelo, não SQL cru — ver `docs/architecture.md`). `KnowledgeService.search` filtra `"tenantId"`
manualmente, obrigatoriamente, antes de qualquer outra cláusula. É o único lugar do sistema onde o
isolamento não é automático — por isso o comentário no código e este aviso aqui.

## Seed

3 documentos DEMO para `tnt_demo_alpha` (`prisma/seed.ts`): internet lenta, segunda via de fatura, troca
de senha de Wi-Fi. Sintéticos, sem dado real de cliente.

## KnowledgeTool

`apps/api/src/knowledge/knowledge-tool.ts` — `action: 'knowledge.search'` (tier `READ`, sempre
permitido), roda pelo mesmo `ToolExecutorService` de todas as outras ferramentas. `NOT_FOUND` quando a
busca não acha nada — nunca inventa um resultado.
