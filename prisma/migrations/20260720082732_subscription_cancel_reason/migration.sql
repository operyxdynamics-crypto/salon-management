-- AlterTable
ALTER TABLE "TenantSubscription" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3);
