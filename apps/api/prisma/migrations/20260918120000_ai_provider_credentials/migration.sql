-- CreateTable
CREATE TABLE "ai_provider_credentials" (
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "apiKey" TEXT,
    "model" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_provider_credentials_pkey" PRIMARY KEY ("tenantId","provider")
);

-- AddForeignKey
ALTER TABLE "ai_provider_credentials" ADD CONSTRAINT "ai_provider_credentials_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserva a chave/modelo que já estavam salvos na config única antiga (uma credencial por provider).
INSERT INTO "ai_provider_credentials" ("tenantId", "provider", "apiKey", "model", "updatedAt")
SELECT "tenantId", "provider", "apiKey", "model", "updatedAt"
FROM "ai_provider_configs"
WHERE "provider" <> 'mock' AND ("apiKey" IS NOT NULL OR "model" IS NOT NULL);

-- AlterTable
ALTER TABLE "ai_provider_configs" DROP COLUMN "apiKey",
DROP COLUMN "model";
