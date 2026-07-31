-- AlterTable
ALTER TABLE "BidLine" ADD COLUMN     "extraCostUsdPerKg" TEXT,
ADD COLUMN     "lmeCoefficient" TEXT,
ADD COLUMN     "lmePriceDate" TIMESTAMP(3),
ADD COLUMN     "lmeRecordId" TEXT,
ADD COLUMN     "lmeUsdPerTon" TEXT,
ADD COLUMN     "premiumUsdPerKg" TEXT,
ADD COLUMN     "pricingType" TEXT,
ADD COLUMN     "usdTryRate" TEXT;

-- AlterTable
ALTER TABLE "LmeRecord" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'DAILY_SPOT',
ADD COLUMN     "periodEnd" TIMESTAMP(3),
ADD COLUMN     "periodStart" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PurchaseOrderLine" ADD COLUMN     "extraCostUsdPerKg" TEXT,
ADD COLUMN     "lmeCoefficient" TEXT,
ADD COLUMN     "lmePriceDate" TIMESTAMP(3),
ADD COLUMN     "lmeRecordId" TEXT,
ADD COLUMN     "lmeUsdPerTon" TEXT,
ADD COLUMN     "premiumUsdPerKg" TEXT,
ADD COLUMN     "pricingType" TEXT,
ADD COLUMN     "usdTryRate" TEXT;

