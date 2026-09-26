-- CreateTable
CREATE TABLE "incident_notifications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "anomalyId" TEXT NOT NULL,
    "scopeName" TEXT,
    "notifiedPhones" TEXT[],
    "resolvedNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "incident_notifications_tenantId_anomalyId_key" ON "incident_notifications"("tenantId", "anomalyId");

-- AddForeignKey
ALTER TABLE "incident_notifications" ADD CONSTRAINT "incident_notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
