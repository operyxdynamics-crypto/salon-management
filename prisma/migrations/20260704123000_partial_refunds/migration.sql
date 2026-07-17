ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED';

ALTER TABLE "InvoiceLine" ADD COLUMN IF NOT EXISTS "refundSourceLineId" TEXT;
CREATE INDEX IF NOT EXISTS "InvoiceLine_refundSourceLineId_idx" ON "InvoiceLine"("refundSourceLineId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InvoiceLine_refundSourceLineId_fkey') THEN
    ALTER TABLE "InvoiceLine"
      ADD CONSTRAINT "InvoiceLine_refundSourceLineId_fkey"
      FOREIGN KEY ("refundSourceLineId") REFERENCES "InvoiceLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
