-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingPeriod" AS ENUM ('MONTHLY', 'ANNUAL');

-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "annualPricePaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "monthlyPricePaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "setupFeePaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trialDays" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "TenantSubscription" ADD COLUMN     "agreedPricePaise" INTEGER,
ADD COLUMN     "billingPeriod" "BillingPeriod" NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "pastDueSince" TIMESTAMP(3),
ADD COLUMN     "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "TenantSubscription_status_idx" ON "TenantSubscription"("status");
