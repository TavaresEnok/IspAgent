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
const ISP_DEFAULT_ARTICLES: KnowledgeSearchResult[] = [
  {
    id: 'isp_kb_los_vermelha',
    title: 'Luz LOS vermelha na ONU / Rompimento de Fibra',
    content:
      'A luz LOS (Loss of Signal) em vermelho ou piscando na ONU/modem óptico indica perda do sinal de luz da fibra óptica. ' +
      'Oriente o cliente a verificar se o conector verde (SC-APC) atrás da ONU está firmemente encaixado e se o cordão amarelo ' +
      'não está dobrado ou prensado por móveis. Se persistir, trata-se de atenuação excessiva ou rompimento externo na rede de fibra.',
    source: 'Engenharia de Redes & Suporte Óptico FTTH',
    rank: 0.9,
  },
  {
    id: 'isp_kb_wifi_frequencias',
    title: 'Diferença entre redes Wi-Fi 2.4 GHz e 5 GHz',
    content:
      'A rede 5 GHz entrega altíssima velocidade e menor latência, ideal para streaming 4K e jogos, porém possui alcance reduzido ' +
      'e sofre atenuação por paredes e espelhos. A rede 2.4 GHz possui maior alcance físico e atravessa obstáculos, mas sua velocidade ' +
      'máxima é de cerca de 40-70 Mbps devido à congestão de canais.',
    source: 'Suporte Técnico N1 / Boas Práticas Wi-Fi',
    rank: 0.85,
  },
  {
    id: 'isp_kb_reboot_30s',
    title: 'Regra dos 30 segundos para reinicialização da ONU/Roteador',
    content:
      'Ao reiniciar os equipamentos, oriente o cliente a retirar o cabo da tomada e aguardar 30 segundos antes de religar. ' +
      'Isso descarrega completamente os capacitores de energia, limpa tabelas de conexões NAT/ARP travadas e solicita novo lease DHCP/PPPoE.',
    source: 'Procedimento Operacional Padrão de Suporte',
    rank: 0.8,
  },
  {
    id: 'isp_kb_jogos_latencia',
    title: 'Dicas de estabilidade e latência (ping baixo) para jogos online',
    content:
      'Para jogar online sem perdas de pacotes (packet loss) ou variações bruscas de ping (jitter), o dispositivo deve estar conectado ' +
      'diretamente via cabo de rede RJ45 (Cat5e ou superior). O Wi-Fi é sujeito a interferência de redes vizinhas e micro-ondas.',
    source: 'Guia de Alta Performance para Gamers',
    rank: 0.75,
  },
  {
    id: 'isp_kb_teste_velocidade',
    title: 'Como realizar um teste de velocidade homologado',
    content:
      'Para medir a velocidade contratada com precisão: 1) Conectar computador via cabo de rede na porta Gigabit; ' +
      '2) Pausar downloads, torrents e streamings em outros aparelhos da casa; 3) Acessar velocímetro homologado como SIMET ou Speedtest.',
    source: 'Central de Ajuda ao Assinante',
    rank: 0.7,
  },
];

@Injectable()
export class KnowledgeService {
  constructor(private readonly db: TenantPrismaService) {}

  async search(query: string, limit = 5): Promise<KnowledgeSearchResult[]> {
    const tenantId = currentTenantId();
    if (!tenantId) throw new Error('[KnowledgeService] busca requer contexto de tenant ativo.');

    const expandedQuery = this.expandQuery(query);

    let rows: KnowledgeSearchResult[] = [];
    try {
      rows = await this.db.client.$queryRaw<KnowledgeSearchResult[]>(Prisma.sql`
        SELECT
          id,
          title,
          content,
          source,
          ts_rank(
            to_tsvector('portuguese', title || ' ' || content),
            plainto_tsquery('portuguese', ${expandedQuery})
          ) AS rank
        FROM knowledge_documents
        WHERE "tenantId" = ${tenantId}
          AND to_tsvector('portuguese', title || ' ' || content) @@ plainto_tsquery('portuguese', ${expandedQuery})
        ORDER BY rank DESC
        LIMIT ${limit}
      `);
    } catch {
      rows = [];
    }

    // Se a busca no banco retornar poucos resultados, enriquece com artigos técnicos do ISP
    if (rows.length < limit) {
      const qLower = query.toLowerCase();
      const matchedDefaults = ISP_DEFAULT_ARTICLES.filter((art) => {
        const text = `${art.title} ${art.content}`.toLowerCase();
        const keywords = qLower.split(/\s+/).filter((w) => w.length > 2);
        return keywords.some((k) => text.includes(k));
      });

      const existingIds = new Set(rows.map((r) => r.id));
      for (const def of matchedDefaults) {
        if (!existingIds.has(def.id) && rows.length < limit) {
          rows.push(def);
        }
      }
    }

    return rows;
  }

  private expandQuery(q: string): string {
    const lower = q.toLowerCase();
    const additions: string[] = [];
    if (/los|vermelha|luz/i.test(lower)) additions.push('los optical alarme fibra rompimento sinal');
    if (/wifi|wi-fi|alcance|sinal fraco/i.test(lower)) additions.push('wifi 5ghz 2.4ghz frequencia paredes roteador');
    if (/reinici|reset|deslig|trava/i.test(lower)) additions.push('reiniciar 30 segundos tomada onu roteador');
    if (/ping|lag|jog|latencia|queda/i.test(lower)) additions.push('cabo rj45 latencia ping jitter interferencia');
    if (/velocidade|lenta|medir|speed/i.test(lower)) additions.push('velocidade cabo gigabit teste simet');
    return additions.length > 0 ? `${q} ${additions.join(' ')}` : q;
  }
}
