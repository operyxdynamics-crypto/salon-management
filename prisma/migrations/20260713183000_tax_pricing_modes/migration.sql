CREATE TYPE "TaxPricingMode" AS ENUM ('EXCLUSIVE', 'INCLUSIVE');

ALTER TABLE "Service"
ADD COLUMN "priceTaxMode" "TaxPricingMode" NOT NULL DEFAULT 'EXCLUSIVE';

ALTER TABLE "BranchService"
ADD COLUMN "priceTaxMode" "TaxPricingMode";

ALTER TABLE "AppointmentServiceLine"
ADD COLUMN "priceTaxMode" "TaxPricingMode" NOT NULL DEFAULT 'EXCLUSIVE';

ALTER TABLE "InvoiceLine"
ADD COLUMN "priceTaxMode" "TaxPricingMode" NOT NULL DEFAULT 'EXCLUSIVE';

ALTER TABLE "InventoryItem"
ADD COLUMN "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 18,
ADD COLUMN "priceTaxMode" "TaxPricingMode" NOT NULL DEFAULT 'EXCLUSIVE';
