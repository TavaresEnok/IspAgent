-- Índices para os caminhos quentes do atendimento (identificação por telefone/documento, histórico da
-- conversa, contagem de tentativas de identificação falhas) e busca full-text da Knowledge Base.
-- Só cria índices: não altera nem apaga nenhum dado.

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_action_entityId_idx" ON "audit_logs"("tenantId", "action", "entityId");

-- CreateIndex
CREATE INDEX "customers_tenantId_document_idx" ON "customers"("tenantId", "document");

-- CreateIndex
CREATE INDEX "customers_phones_idx" ON "customers" USING GIN ("phones");

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");

-- Índice de expressão da busca da KB (knowledge.service.ts usa exatamente esta expressão). O Prisma não
-- modela índices de expressão; por isso está só aqui, no SQL da migration.
CREATE INDEX "knowledge_documents_fts_idx" ON "knowledge_documents"
  USING GIN (to_tsvector('portuguese', "title" || ' ' || "content"));
