-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "requiresDedicatedDb" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TenantEnvironment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appUrl" TEXT,
    "hostedBy" TEXT,
    "databaseUrlEncrypted" TEXT NOT NULL,
    "lastCheckedAt" TIMESTAMP(3),
    "lastCheckOk" BOOLEAN,
    "lastMigration" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantEnvironment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantEnvironment_tenantId_key" ON "TenantEnvironment"("tenantId");

-- AddForeignKey
ALTER TABLE "TenantEnvironment" ADD CONSTRAINT "TenantEnvironment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
