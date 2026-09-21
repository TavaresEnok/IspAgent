-- CreateTable
CREATE TABLE "pulseisp_connections" (
    "tenantId" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pulseisp_connections_pkey" PRIMARY KEY ("tenantId")
);

-- AddForeignKey
ALTER TABLE "pulseisp_connections" ADD CONSTRAINT "pulseisp_connections_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
