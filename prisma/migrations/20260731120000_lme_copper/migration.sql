-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "defaultExtraCostUsdPerKg" TEXT,
ADD COLUMN     "defaultPremiumUsdPerKg" TEXT,
ADD COLUMN     "lmeCoefficient" TEXT,
ADD COLUMN     "pricingNote" TEXT,
ADD COLUMN     "pricingType" TEXT NOT NULL DEFAULT 'FIXED';

-- CreateTable
CREATE TABLE "LmeRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "priceDate" TIMESTAMP(3) NOT NULL,
    "usdPerTon" TEXT NOT NULL,
    "source" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LmeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LmeRecord_tenantId_priceDate_idx" ON "LmeRecord"("tenantId", "priceDate");

-- CreateIndex
CREATE INDEX "LmeRecord_tenantId_status_idx" ON "LmeRecord"("tenantId", "status");

