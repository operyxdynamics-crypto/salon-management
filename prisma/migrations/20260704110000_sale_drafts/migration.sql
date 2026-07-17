CREATE TABLE "SaleDraft" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "customerId" TEXT,
  "appointmentId" TEXT,
  "createdById" TEXT,
  "title" TEXT NOT NULL,
  "taxMode" "InvoiceTaxMode" NOT NULL DEFAULT 'GST',
  "cart" JSONB NOT NULL,
  "payments" JSONB NOT NULL,
  "tip" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "total" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'HELD',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SaleDraft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SaleDraft_tenantId_status_updatedAt_idx" ON "SaleDraft"("tenantId", "status", "updatedAt");
CREATE INDEX "SaleDraft_branchId_status_updatedAt_idx" ON "SaleDraft"("branchId", "status", "updatedAt");
CREATE INDEX "SaleDraft_customerId_idx" ON "SaleDraft"("customerId");

ALTER TABLE "SaleDraft"
  ADD CONSTRAINT "SaleDraft_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SaleDraft_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SaleDraft_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SaleDraft_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SaleDraft_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
