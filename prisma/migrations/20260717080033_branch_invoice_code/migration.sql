/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,invoiceCode]` on the table `Branch` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "invoiceCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Branch_tenantId_invoiceCode_key" ON "Branch"("tenantId", "invoiceCode");
