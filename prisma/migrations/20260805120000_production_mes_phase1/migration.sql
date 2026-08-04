-- Üretim Saha Yönetimi (MES / Shop Floor Control) Faz 1 — additive.
-- Elle yazıldı (Vercel `env pull` DATABASE_URL'i [SENSITIVE] gizler; migrate diff
-- çalıştırılamaz). Prisma sözleşmesine uygun; yalnız yeni tablolar oluşturur.

-- CreateTable
CREATE TABLE "ProductionStation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "defaultMinutes" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionStation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionOperator" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "badgeCode" TEXT NOT NULL,
    "line" TEXT,
    "title" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionOperator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "salesOfferId" TEXT,
    "salesRfqId" TEXT,
    "customerId" TEXT,
    "customerName" TEXT,
    "coilType" TEXT,
    "line" TEXT,
    "targetCoils" INTEGER NOT NULL DEFAULT 0,
    "completedCoils" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "scannedBarcode" TEXT,
    "producedQty" INTEGER NOT NULL DEFAULT 0,
    "scrapQty" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "checkInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkOutAt" TIMESTAMP(3),
    "elapsedMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductionStation_tenantId_idx" ON "ProductionStation"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionStation_tenantId_code_key" ON "ProductionStation"("tenantId", "code");

-- CreateIndex
CREATE INDEX "ProductionOperator_tenantId_idx" ON "ProductionOperator"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOperator_tenantId_badgeCode_key" ON "ProductionOperator"("tenantId", "badgeCode");

-- CreateIndex
CREATE INDEX "WorkOrder_tenantId_status_idx" ON "WorkOrder"("tenantId", "status");

-- CreateIndex
CREATE INDEX "WorkOrder_customerId_idx" ON "WorkOrder"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_tenantId_number_key" ON "WorkOrder"("tenantId", "number");

-- CreateIndex
CREATE INDEX "ProductionLog_tenantId_status_idx" ON "ProductionLog"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ProductionLog_workOrderId_idx" ON "ProductionLog"("workOrderId");

-- CreateIndex
CREATE INDEX "ProductionLog_operatorId_idx" ON "ProductionLog"("operatorId");

-- CreateIndex
CREATE INDEX "ProductionLog_stationId_idx" ON "ProductionLog"("stationId");

-- AddForeignKey
ALTER TABLE "ProductionLog" ADD CONSTRAINT "ProductionLog_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionLog" ADD CONSTRAINT "ProductionLog_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "ProductionStation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionLog" ADD CONSTRAINT "ProductionLog_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "ProductionOperator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
