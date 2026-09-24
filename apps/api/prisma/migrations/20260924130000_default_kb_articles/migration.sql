-- Artigos técnicos padrão (ver src/knowledge/default-articles.ts) para os tenants que já existem.

INSERT INTO "knowledge_documents" ("id", "tenantId", "title", "content", "source")
SELECT 'kbdef_' || t."id" || '_' || 'los_vermelha', t."id", 'Luz LOS vermelha na ONU / Rompimento de Fibra', 'A luz LOS (Loss of Signal) em vermelho ou piscando na ONU/modem óptico indica perda do sinal de luz da fibra óptica. Oriente o cliente a verificar se o conector verde (SC-APC) atrás da ONU está firmemente encaixado e se o cordão amarelo não está dobrado ou prensado por móveis. Se persistir, trata-se de atenuação excessiva ou rompimento externo na rede de fibra.', 'Engenharia de Redes & Suporte Óptico FTTH'
FROM "tenants" t
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "knowledge_documents" ("id", "tenantId", "title", "content", "source")
SELECT 'kbdef_' || t."id" || '_' || 'wifi_frequencias', t."id", 'Diferença entre redes Wi-Fi 2.4 GHz e 5 GHz', 'A rede 5 GHz entrega altíssima velocidade e menor latência, ideal para streaming 4K e jogos, porém possui alcance reduzido e sofre atenuação por paredes e espelhos. A rede 2.4 GHz possui maior alcance físico e atravessa obstáculos, mas sua velocidade máxima é de cerca de 40-70 Mbps devido à congestão de canais.', 'Suporte Técnico N1 / Boas Práticas Wi-Fi'
FROM "tenants" t
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "knowledge_documents" ("id", "tenantId", "title", "content", "source")
SELECT 'kbdef_' || t."id" || '_' || 'reboot_30s', t."id", 'Regra dos 30 segundos para reinicialização da ONU/Roteador', 'Ao reiniciar os equipamentos, oriente o cliente a retirar o cabo da tomada e aguardar 30 segundos antes de religar. Isso descarrega completamente os capacitores de energia, limpa tabelas de conexões NAT/ARP travadas e solicita novo lease DHCP/PPPoE.', 'Procedimento Operacional Padrão de Suporte'
FROM "tenants" t
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "knowledge_documents" ("id", "tenantId", "title", "content", "source")
SELECT 'kbdef_' || t."id" || '_' || 'jogos_latencia', t."id", 'Dicas de estabilidade e latência (ping baixo) para jogos online', 'Para jogar online sem perdas de pacotes (packet loss) ou variações bruscas de ping (jitter), o dispositivo deve estar conectado diretamente via cabo de rede RJ45 (Cat5e ou superior). O Wi-Fi é sujeito a interferência de redes vizinhas e micro-ondas.', 'Guia de Alta Performance para Gamers'
FROM "tenants" t
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "knowledge_documents" ("id", "tenantId", "title", "content", "source")
SELECT 'kbdef_' || t."id" || '_' || 'teste_velocidade', t."id", 'Como realizar um teste de velocidade homologado', 'Para medir a velocidade contratada com precisão: 1) Conectar computador via cabo de rede na porta Gigabit; 2) Pausar downloads, torrents e streamings em outros aparelhos da casa; 3) Acessar velocímetro homologado como SIMET ou Speedtest.', 'Central de Ajuda ao Assinante'
FROM "tenants" t
ON CONFLICT ("id") DO NOTHING;
