-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "brandColor" TEXT,
ADD COLUMN     "brandLogo" TEXT,
ADD COLUMN     "brandName" TEXT,
ADD COLUMN     "customDomain" TEXT,
ADD COLUMN     "maxUsers" INTEGER,
ADD COLUMN     "monthlyConversationLimit" INTEGER,
ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'basic',
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "erp_connections" (
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'demo',
    "baseUrl" TEXT,
    "app" TEXT,
    "token" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "erp_connections_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "whatsapp_connections" (
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'evolution',
    "instanceName" TEXT,
    "webhookSecret" TEXT,
    "phoneNumberId" TEXT,
    "accessToken" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_connections_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "chatwoot_connections" (
    "tenantId" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "publicUrl" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "botToken" TEXT NOT NULL,
    "webhookToken" TEXT NOT NULL,
    "webhookTokenHash" TEXT NOT NULL,
    "widgetToken" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatwoot_connections_pkey" PRIMARY KEY ("tenantId")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_connections_instanceName_key" ON "whatsapp_connections"("instanceName");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_connections_phoneNumberId_key" ON "whatsapp_connections"("phoneNumberId");

-- CreateIndex
CREATE UNIQUE INDEX "chatwoot_connections_webhookTokenHash_key" ON "chatwoot_connections"("webhookTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_customDomain_key" ON "tenants"("customDomain");

-- AddForeignKey
ALTER TABLE "erp_connections" ADD CONSTRAINT "erp_connections_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatwoot_connections" ADD CONSTRAINT "chatwoot_connections_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Provedores existentes: apelido público a partir do id (tnt_vibe → vibe) e nome da marca sem sufixos técnicos.
UPDATE "tenants" SET "slug" = regexp_replace(lower(regexp_replace("id", '^tnt_', '')), '[^a-z0-9]+', '-', 'g') WHERE "slug" IS NULL;
UPDATE "tenants" SET "brandName" = trim(regexp_replace("name", '\s*\(.*\)\s*$', '')) WHERE "brandName" IS NULL;
