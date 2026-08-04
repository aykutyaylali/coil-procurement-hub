-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'TR',
    "industry" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "salesRepId" TEXT,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'EUR',
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesRFQ" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "industry" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUEST',
    "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetDate" TIMESTAMP(3),
    "salesRepId" TEXT,
    "coilType" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SalesRFQ_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOffer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "salesRfqId" TEXT,
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "offerDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "deliveryDate" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "totalAmount" TEXT NOT NULL DEFAULT '0',
    "revisionNo" INTEGER NOT NULL DEFAULT 0,
    "revisionDate" TIMESTAMP(3),
    "invoiced" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "salesRepId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SalesOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOfferTechnicalDetail" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "manufacturer" TEXT,
    "type" TEXT,
    "power" TEXT,
    "voltage" TEXT,
    "numberOfPole" INTEGER,
    "numberOfCoils" INTEGER,
    "numberOfSlot" INTEGER,
    "numberOfSet" INTEGER,
    "numberOfTurns" INTEGER,
    "insulationType" TEXT,
    "typeOfCoil" TEXT,
    "wireWidth" TEXT,
    "wireThickness" TEXT,
    "lmeRecordId" TEXT,

    CONSTRAINT "SalesOfferTechnicalDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOfferNote" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesOfferNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOfferDocument" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "attachmentId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesOfferDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_tenantId_idx" ON "Customer"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenantId_code_key" ON "Customer"("tenantId", "code");

-- CreateIndex
CREATE INDEX "SalesRFQ_tenantId_status_idx" ON "SalesRFQ"("tenantId", "status");

-- CreateIndex
CREATE INDEX "SalesRFQ_customerId_idx" ON "SalesRFQ"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesRFQ_tenantId_number_key" ON "SalesRFQ"("tenantId", "number");

-- CreateIndex
CREATE INDEX "SalesOffer_tenantId_status_idx" ON "SalesOffer"("tenantId", "status");

-- CreateIndex
CREATE INDEX "SalesOffer_customerId_idx" ON "SalesOffer"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOffer_tenantId_number_key" ON "SalesOffer"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOfferTechnicalDetail_offerId_key" ON "SalesOfferTechnicalDetail"("offerId");

-- CreateIndex
CREATE INDEX "SalesOfferNote_offerId_idx" ON "SalesOfferNote"("offerId");

-- CreateIndex
CREATE INDEX "SalesOfferDocument_offerId_idx" ON "SalesOfferDocument"("offerId");

-- AddForeignKey
ALTER TABLE "SalesRFQ" ADD CONSTRAINT "SalesRFQ_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOffer" ADD CONSTRAINT "SalesOffer_salesRfqId_fkey" FOREIGN KEY ("salesRfqId") REFERENCES "SalesRFQ"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOffer" ADD CONSTRAINT "SalesOffer_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOfferTechnicalDetail" ADD CONSTRAINT "SalesOfferTechnicalDetail_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "SalesOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOfferNote" ADD CONSTRAINT "SalesOfferNote_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "SalesOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOfferDocument" ADD CONSTRAINT "SalesOfferDocument_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "SalesOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
