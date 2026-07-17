-- CreateEnum
CREATE TYPE "LegalEntityType" AS ENUM ('COMPANY', 'FRANCHISEE');

-- CreateEnum
CREATE TYPE "BranchOwnershipModel" AS ENUM ('COCO', 'FOCO', 'FOFO');

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "gstRegistrationId" TEXT,
ADD COLUMN     "operatorEntityId" TEXT,
ADD COLUMN     "ownerEntityId" TEXT,
ADD COLUMN     "ownershipModel" "BranchOwnershipModel" NOT NULL DEFAULT 'COCO';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "gstRegistrationId" TEXT,
ADD COLUMN     "legalEntityId" TEXT,
ADD COLUMN     "placeOfSupplyState" TEXT,
ADD COLUMN     "supplierGstin" TEXT,
ADD COLUMN     "supplierName" TEXT,
ADD COLUMN     "supplierStateCode" TEXT;

-- AlterTable
ALTER TABLE "PurchaseEntry" ADD COLUMN     "cgst" DECIMAL(12,2),
ADD COLUMN     "gstRegistrationId" TEXT,
ADD COLUMN     "igst" DECIMAL(12,2),
ADD COLUMN     "sgst" DECIMAL(12,2),
ADD COLUMN     "vendorGstin" TEXT;

-- CreateTable
CREATE TABLE "LegalEntity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "LegalEntityType" NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "panNumber" TEXT,
    "cin" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GstRegistration" (
    "id" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "gstin" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GstRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegalEntity_tenantId_type_idx" ON "LegalEntity"("tenantId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "GstRegistration_legalEntityId_state_key" ON "GstRegistration"("legalEntityId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "GstRegistration_gstin_key" ON "GstRegistration"("gstin");

-- CreateIndex
CREATE INDEX "Branch_operatorEntityId_idx" ON "Branch"("operatorEntityId");

-- CreateIndex
CREATE INDEX "Branch_gstRegistrationId_idx" ON "Branch"("gstRegistrationId");

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_ownerEntityId_fkey" FOREIGN KEY ("ownerEntityId") REFERENCES "LegalEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_operatorEntityId_fkey" FOREIGN KEY ("operatorEntityId") REFERENCES "LegalEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_gstRegistrationId_fkey" FOREIGN KEY ("gstRegistrationId") REFERENCES "GstRegistration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalEntity" ADD CONSTRAINT "LegalEntity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GstRegistration" ADD CONSTRAINT "GstRegistration_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_legalEntityId_fkey" FOREIGN KEY ("legalEntityId") REFERENCES "LegalEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_gstRegistrationId_fkey" FOREIGN KEY ("gstRegistrationId") REFERENCES "GstRegistration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseEntry" ADD CONSTRAINT "PurchaseEntry_gstRegistrationId_fkey" FOREIGN KEY ("gstRegistrationId") REFERENCES "GstRegistration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
