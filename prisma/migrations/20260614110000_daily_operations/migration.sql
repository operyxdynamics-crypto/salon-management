-- POS, inventory, refunds, and daily closing foundation.
ALTER TABLE "InventoryItem"
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "vendorId" TEXT,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Invoice"
  ADD COLUMN "parentInvoiceId" TEXT,
  ADD COLUMN "voidReason" TEXT;

CREATE TABLE "Vendor" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "gstin" TEXT,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseEntry" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "vendorId" TEXT,
  "invoiceNumber" TEXT,
  "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "note" TEXT,
  "purchasedAt" TIMESTAMP(3) NOT NULL,
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseLine" (
  "id" TEXT NOT NULL,
  "purchaseEntryId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "quantity" DECIMAL(10,2) NOT NULL,
  "unitCost" DECIMAL(12,2) NOT NULL,
  "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 18,
  "total" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "PurchaseLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockTransfer" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "fromBranchId" TEXT NOT NULL,
  "toBranchId" TEXT NOT NULL,
  "quantity" DECIMAL(10,2) NOT NULL,
  "note" TEXT,
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Stocktake" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "note" TEXT,
  "countedAt" TIMESTAMP(3) NOT NULL,
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Stocktake_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StocktakeLine" (
  "id" TEXT NOT NULL,
  "stocktakeId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "expectedQty" DECIMAL(10,2) NOT NULL,
  "countedQty" DECIMAL(10,2) NOT NULL,
  "varianceQty" DECIMAL(10,2) NOT NULL,
  CONSTRAINT "StocktakeLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceConsumptionRecipe" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "quantity" DECIMAL(10,2) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceConsumptionRecipe_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Vendor_tenantId_name_key" ON "Vendor"("tenantId", "name");
CREATE INDEX "InventoryItem_vendorId_idx" ON "InventoryItem"("vendorId");
CREATE UNIQUE INDEX "PurchaseEntry_idempotencyKey_key" ON "PurchaseEntry"("idempotencyKey");
CREATE INDEX "PurchaseEntry_tenantId_purchasedAt_idx" ON "PurchaseEntry"("tenantId", "purchasedAt");
CREATE INDEX "PurchaseEntry_branchId_purchasedAt_idx" ON "PurchaseEntry"("branchId", "purchasedAt");
CREATE UNIQUE INDEX "StockTransfer_idempotencyKey_key" ON "StockTransfer"("idempotencyKey");
CREATE INDEX "StockTransfer_tenantId_createdAt_idx" ON "StockTransfer"("tenantId", "createdAt");
CREATE UNIQUE INDEX "Stocktake_idempotencyKey_key" ON "Stocktake"("idempotencyKey");
CREATE INDEX "Stocktake_branchId_countedAt_idx" ON "Stocktake"("branchId", "countedAt");
CREATE UNIQUE INDEX "ServiceConsumptionRecipe_serviceId_inventoryItemId_key" ON "ServiceConsumptionRecipe"("serviceId", "inventoryItemId");
CREATE INDEX "ServiceConsumptionRecipe_tenantId_idx" ON "ServiceConsumptionRecipe"("tenantId");

ALTER TABLE "InventoryItem"
  ADD CONSTRAINT "InventoryItem_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_parentInvoiceId_fkey"
  FOREIGN KEY ("parentInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Vendor"
  ADD CONSTRAINT "Vendor_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseEntry"
  ADD CONSTRAINT "PurchaseEntry_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseEntry"
  ADD CONSTRAINT "PurchaseEntry_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseLine"
  ADD CONSTRAINT "PurchaseLine_purchaseEntryId_fkey"
  FOREIGN KEY ("purchaseEntryId") REFERENCES "PurchaseEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseLine"
  ADD CONSTRAINT "PurchaseLine_inventoryItemId_fkey"
  FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer"
  ADD CONSTRAINT "StockTransfer_fromBranchId_fkey"
  FOREIGN KEY ("fromBranchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockTransfer"
  ADD CONSTRAINT "StockTransfer_toBranchId_fkey"
  FOREIGN KEY ("toBranchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Stocktake"
  ADD CONSTRAINT "Stocktake_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StocktakeLine"
  ADD CONSTRAINT "StocktakeLine_stocktakeId_fkey"
  FOREIGN KEY ("stocktakeId") REFERENCES "Stocktake"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StocktakeLine"
  ADD CONSTRAINT "StocktakeLine_inventoryItemId_fkey"
  FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceConsumptionRecipe"
  ADD CONSTRAINT "ServiceConsumptionRecipe_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceConsumptionRecipe"
  ADD CONSTRAINT "ServiceConsumptionRecipe_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceConsumptionRecipe"
  ADD CONSTRAINT "ServiceConsumptionRecipe_inventoryItemId_fkey"
  FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
