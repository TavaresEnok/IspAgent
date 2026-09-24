/**
 * Artigos técnicos genéricos de suporte FTTH com que todo provedor começa na Base de Conhecimento. São
 * documentos NORMAIS do tenant (editáveis/removíveis na tela Base de Conhecimento), não um "fallback"
 * escondido no código: gravados pelo seed e, para tenants que já existiam, pela migration
 * 20260924130000_default_kb_articles. O id é `kbdef_<tenant>_<slug>` (idempotente).
 */
export interface DefaultKbArticle {
  slug: string;
  title: string;
  content: string;
  source: string;
}

export const defaultKbArticleId = (tenantId: string, slug: string) => `kbdef_${tenantId}_${slug}`;

export const DEFAULT_KB_ARTICLES: DefaultKbArticle[] = [
  {
    slug: 'los_vermelha',
    title: 'Luz LOS vermelha na ONU / Rompimento de Fibra',
    content:
      'A luz LOS (Loss of Signal) em vermelho ou piscando na ONU/modem óptico indica perda do sinal de luz da fibra óptica. ' +
      'Oriente o cliente a verificar se o conector verde (SC-APC) atrás da ONU está firmemente encaixado e se o cordão amarelo ' +
      'não está dobrado ou prensado por móveis. Se persistir, trata-se de atenuação excessiva ou rompimento externo na rede de fibra.',
    source: 'Engenharia de Redes & Suporte Óptico FTTH',
  },
  {
    slug: 'wifi_frequencias',
    title: 'Diferença entre redes Wi-Fi 2.4 GHz e 5 GHz',
    content:
      'A rede 5 GHz entrega altíssima velocidade e menor latência, ideal para streaming 4K e jogos, porém possui alcance reduzido ' +
      'e sofre atenuação por paredes e espelhos. A rede 2.4 GHz possui maior alcance físico e atravessa obstáculos, mas sua velocidade ' +
      'máxima é de cerca de 40-70 Mbps devido à congestão de canais.',
    source: 'Suporte Técnico N1 / Boas Práticas Wi-Fi',
  },
  {
    slug: 'reboot_30s',
    title: 'Regra dos 30 segundos para reinicialização da ONU/Roteador',
    content:
      'Ao reiniciar os equipamentos, oriente o cliente a retirar o cabo da tomada e aguardar 30 segundos antes de religar. ' +
      'Isso descarrega completamente os capacitores de energia, limpa tabelas de conexões NAT/ARP travadas e solicita novo lease DHCP/PPPoE.',
    source: 'Procedimento Operacional Padrão de Suporte',
  },
  {
    slug: 'jogos_latencia',
    title: 'Dicas de estabilidade e latência (ping baixo) para jogos online',
    content:
      'Para jogar online sem perdas de pacotes (packet loss) ou variações bruscas de ping (jitter), o dispositivo deve estar conectado ' +
      'diretamente via cabo de rede RJ45 (Cat5e ou superior). O Wi-Fi é sujeito a interferência de redes vizinhas e micro-ondas.',
    source: 'Guia de Alta Performance para Gamers',
  },
  {
    slug: 'teste_velocidade',
    title: 'Como realizar um teste de velocidade homologado',
    content:
      'Para medir a velocidade contratada com precisão: 1) Conectar computador via cabo de rede na porta Gigabit; ' +
      '2) Pausar downloads, torrents e streamings em outros aparelhos da casa; 3) Acessar velocímetro homologado como SIMET ou Speedtest.',
    source: 'Central de Ajuda ao Assinante',
  },
];
