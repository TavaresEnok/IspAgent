import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { currentTenantId } from '../common/tenant-context';

export interface KnowledgeSearchResult {
  id: string;
  title: string;
  content: string;
  source: string | null;
  rank: number;
}

/**
 * Knowledge Base via full-text search nativo do Postgres (DECISIONS.md, 2026-09-14: sem pgvector nesta
 * fase — evita depender de um serviço externo de embeddings para o DEMO funcionar).
 *
 * IMPORTANTE: `$queryRaw` NÃO passa pela extensão de tenant-scoping do Prisma (ela só intercepta
 * operações de modelo, não SQL cru) — o filtro `"tenantId" = ${tenantId}` abaixo é manual e
 * obrigatório, não opcional. Sem ele, esta seria a única brecha de isolamento entre tenants do sistema.
 */
@Injectable()
export class KnowledgeService {
  constructor(private readonly db: TenantPrismaService) {}

  async search(query: string, limit = 5): Promise<KnowledgeSearchResult[]> {
    const tenantId = currentTenantId();
    if (!tenantId) throw new Error('[KnowledgeService] busca requer contexto de tenant ativo.');

    const rows = await this.db.client.$queryRaw<KnowledgeSearchResult[]>(Prisma.sql`
      SELECT
        id,
        title,
        content,
        source,
        ts_rank(
          to_tsvector('portuguese', title || ' ' || content),
          plainto_tsquery('portuguese', ${query})
        ) AS rank
      FROM knowledge_documents
      WHERE "tenantId" = ${tenantId}
        AND to_tsvector('portuguese', title || ' ' || content) @@ plainto_tsquery('portuguese', ${query})
      ORDER BY rank DESC
      LIMIT ${limit}
    `);

    return rows;
  }
}
