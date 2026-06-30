CREATE TYPE "InvoiceTaxMode" AS ENUM ('GST', 'NON_GST');

ALTER TABLE "Customer"
  ADD COLUMN "walletBalance" DECIMAL(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE "Invoice"
  ADD COLUMN "taxMode" "InvoiceTaxMode" NOT NULL DEFAULT 'GST';

ALTER TABLE "InvoiceSequence"
  ADD COLUMN "taxMode" "InvoiceTaxMode" NOT NULL DEFAULT 'GST';

ALTER TABLE "InvoiceSequence"
  DROP CONSTRAINT IF EXISTS "InvoiceSequence_branchId_financialYear_key";

ALTER TABLE "InvoiceSequence"
  ADD CONSTRAINT "InvoiceSequence_branchId_financialYear_taxMode_key" UNIQUE ("branchId", "financialYear", "taxMode");

ALTER TABLE "Membership"
  ADD COLUMN "discountPercent" DECIMAL(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "rewardMultiplier" DECIMAL(5, 2) NOT NULL DEFAULT 1;

ALTER TABLE "PackagePurchase"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "RewardRule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "pointsPerAmount" DECIMAL(10, 4) NOT NULL DEFAULT 0.01,
  "amountPerPoint" DECIMAL(10, 2) NOT NULL DEFAULT 1,
  "earnOnTax" BOOLEAN NOT NULL DEFAULT false,
  "minRedeemPoints" INTEGER NOT NULL DEFAULT 0,
  "maxRedeemPercent" DECIMAL(5, 2) NOT NULL DEFAULT 20,
  "expiryDays" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RewardRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BenefitTransaction" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT,
  "customerId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT,
  "amount" DECIMAL(12, 2),
  "points" INTEGER,
  "note" TEXT,
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BenefitTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RewardRule_tenantId_isActive_idx" ON "RewardRule"("tenantId", "isActive");
CREATE INDEX "BenefitTransaction_tenantId_customerId_kind_idx" ON "BenefitTransaction"("tenantId", "customerId", "kind");
CREATE UNIQUE INDEX "BenefitTransaction_idempotencyKey_key" ON "BenefitTransaction"("idempotencyKey");

ALTER TABLE "RewardRule"
  ADD CONSTRAINT "RewardRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BenefitTransaction"
  ADD CONSTRAINT "BenefitTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "BenefitTransaction_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "BenefitTransaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

