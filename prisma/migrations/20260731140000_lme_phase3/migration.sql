-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "invoiceUsdTryRate" TEXT,
ADD COLUMN     "invoicedQtyKg" TEXT,
ADD COLUMN     "lmeMode" TEXT,
ADD COLUMN     "lmeRecordId" TEXT,
ADD COLUMN     "receiptId" TEXT;

