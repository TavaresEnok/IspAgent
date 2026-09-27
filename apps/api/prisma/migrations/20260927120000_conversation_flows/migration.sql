-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "flowState" JSONB;

-- CreateTable
CREATE TABLE "conversation_flows" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "definition" JSONB NOT NULL,
    "publishedDefinition" JSONB,
    "publishedVersion" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_flows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversation_flows_tenantId_idx" ON "conversation_flows"("tenantId");

-- CreateIndex
CREATE INDEX "conversation_flows_tenantId_active_idx" ON "conversation_flows"("tenantId", "active");

-- AddForeignKey
ALTER TABLE "conversation_flows" ADD CONSTRAINT "conversation_flows_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- No máximo um fluxo ativo por tenant (o Prisma não expressa índice único parcial).
CREATE UNIQUE INDEX "conversation_flows_one_active_per_tenant" ON "conversation_flows"("tenantId") WHERE "active";
