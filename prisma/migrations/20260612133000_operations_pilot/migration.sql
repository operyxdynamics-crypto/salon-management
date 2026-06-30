CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'PAID', 'PARTIALLY_PAID', 'REFUNDED', 'VOID');
CREATE TYPE "InvoiceType" AS ENUM ('SALE', 'REFUND');
CREATE TYPE "InvoiceLineType" AS ENUM ('SERVICE', 'PRODUCT');

ALTER TABLE "Commission" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "Expense" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Invoice"
  ADD COLUMN "type" "InvoiceType" NOT NULL DEFAULT 'SALE',
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  DROP COLUMN "status",
  ADD COLUMN "status" "InvoiceStatus" NOT NULL DEFAULT 'PAID';

CREATE TABLE "InvoiceLine" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "type" "InvoiceLineType" NOT NULL,
  "description" TEXT NOT NULL,
  "serviceId" TEXT,
  "inventoryItemId" TEXT,
  "staffId" TEXT,
  "quantity" DECIMAL(10,2) NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "taxRate" DECIMAL(5,2) NOT NULL,
  "tax" DECIMAL(12,2) NOT NULL,
  "total" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceSequence" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "financialYear" TEXT NOT NULL,
  "nextNumber" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StaffLeave" (
  "id" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "reason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'APPROVED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffLeave_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvoiceSequence_branchId_financialYear_key" ON "InvoiceSequence"("branchId", "financialYear");
CREATE INDEX "StaffLeave_staffId_startsAt_endsAt_idx" ON "StaffLeave"("staffId", "startsAt", "endsAt");
CREATE UNIQUE INDEX "Commission_idempotencyKey_key" ON "Commission"("idempotencyKey");

ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InvoiceSequence" ADD CONSTRAINT "InvoiceSequence_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffLeave" ADD CONSTRAINT "StaffLeave_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
