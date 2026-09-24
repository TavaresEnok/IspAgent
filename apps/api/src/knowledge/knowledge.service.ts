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

    // 1ª passada: a frase do cliente como veio (todas as palavras precisam aparecer — mais precisa).
    const rows = await this.db.client.$queryRaw<KnowledgeSearchResult[]>(Prisma.sql`
      SELECT id, title, content, source,
        ts_rank(to_tsvector('portuguese', title || ' ' || content), plainto_tsquery('portuguese', ${query})) AS rank
      FROM knowledge_documents
      WHERE "tenantId" = ${tenantId}
        AND to_tsvector('portuguese', title || ' ' || content) @@ plainto_tsquery('portuguese', ${query})
      ORDER BY rank DESC
      LIMIT ${limit}
    `);

    // 2ª passada (só se faltou resultado): sinônimos do suporte técnico somados com OU. Antes os termos
    // extras entravam no mesmo `plainto_tsquery`, que exige TODOS — e o documento certo sumia.
    const expansion = this.expansionTerms(query);
    if (rows.length >= limit || expansion.length === 0) return rows;

    const orQuery = expansion.join(' | ');
    const extra = await this.db.client.$queryRaw<KnowledgeSearchResult[]>(Prisma.sql`
      SELECT id, title, content, source,
        ts_rank(to_tsvector('portuguese', title || ' ' || content), to_tsquery('portuguese', ${orQuery})) AS rank
      FROM knowledge_documents
      WHERE "tenantId" = ${tenantId}
        AND to_tsvector('portuguese', title || ' ' || content) @@ to_tsquery('portuguese', ${orQuery})
      ORDER BY rank DESC
      LIMIT ${limit}
    `);
    const seen = new Set(rows.map((r) => r.id));
    return [...rows, ...extra.filter((r) => !seen.has(r.id))].slice(0, limit);
  }

  /** Termos técnicos relacionados ao que o cliente descreveu (só letras/dígitos: seguros para `to_tsquery`). */
  private expansionTerms(q: string): string[] {
    const lower = q.toLowerCase();
    const terms: string[] = [];
    if (/\b(los|vermelh[ao]|luz)\b/.test(lower)) terms.push('los', 'alarme', 'fibra', 'rompimento');
    if (/wi-?fi|alcance|sinal fraco/.test(lower)) terms.push('wifi', 'frequencia', 'paredes', 'roteador');
    if (/reinici|reset|deslig|trav/.test(lower)) terms.push('reiniciar', 'tomada', 'roteador');
    if (/\b(ping|lag|jog\w*|latencia|latência)\b/.test(lower)) terms.push('latencia', 'ping', 'jitter', 'cabo');
    if (/velocidade|lent[ao]|medir|speed/.test(lower)) terms.push('velocidade', 'teste', 'cabo');
    return [...new Set(terms)];
  }
}
