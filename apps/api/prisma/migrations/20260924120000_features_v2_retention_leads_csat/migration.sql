-- AlterTable
ALTER TABLE "tenant_policy_configs" ADD COLUMN     "assistantName" TEXT NOT NULL DEFAULT 'Assistente Virtual',
ADD COLUMN     "companyName" TEXT,
ADD COLUMN     "customRules" TEXT,
ADD COLUMN     "readOnlyMode" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "supportHours" TEXT DEFAULT 'Segunda a Sexta, 08h às 18h',
ADD COLUMN     "tone" TEXT NOT NULL DEFAULT 'caloroso, educado, empático e resolutivo (2 a 4 frases)',
ALTER COLUMN "canCreateTicket" SET DEFAULT false;

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "summary" TEXT;

-- AlterTable
ALTER TABLE "handoffs" ADD COLUMN     "department" TEXT NOT NULL DEFAULT 'SUPORTE_TECNICO';

-- CreateTable
CREATE TABLE "cancellation_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "customerId" TEXT,
    "contractId" TEXT,
    "reason" TEXT,
    "discountOffered" BOOLEAN NOT NULL DEFAULT false,
    "acceptedRetention" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cancellation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_leads" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "desiredPlan" TEXT,
    "originChannel" TEXT NOT NULL DEFAULT 'WEBCHAT',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commercial_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "satisfaction_surveys" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "satisfaction_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cancellation_requests_tenantId_idx" ON "cancellation_requests"("tenantId");

-- CreateIndex
CREATE INDEX "cancellation_requests_conversationId_idx" ON "cancellation_requests"("conversationId");

-- CreateIndex
CREATE INDEX "commercial_leads_tenantId_idx" ON "commercial_leads"("tenantId");

-- CreateIndex
CREATE INDEX "commercial_leads_tenantId_status_idx" ON "commercial_leads"("tenantId", "status");

-- CreateIndex
CREATE INDEX "satisfaction_surveys_tenantId_idx" ON "satisfaction_surveys"("tenantId");

-- CreateIndex
CREATE INDEX "satisfaction_surveys_conversationId_idx" ON "satisfaction_surveys"("conversationId");

-- CreateIndex
CREATE INDEX "handoffs_tenantId_department_idx" ON "handoffs"("tenantId", "department");

-- AddForeignKey
ALTER TABLE "cancellation_requests" ADD CONSTRAINT "cancellation_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancellation_requests" ADD CONSTRAINT "cancellation_requests_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_leads" ADD CONSTRAINT "commercial_leads_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "satisfaction_surveys" ADD CONSTRAINT "satisfaction_surveys_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "satisfaction_surveys" ADD CONSTRAINT "satisfaction_surveys_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

