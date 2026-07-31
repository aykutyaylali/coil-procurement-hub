-- AlterTable
ALTER TABLE "LmeRecord" ADD COLUMN     "fetchedAt" TIMESTAMP(3),
ADD COLUMN     "isAutoFetched" BOOLEAN NOT NULL DEFAULT false;

