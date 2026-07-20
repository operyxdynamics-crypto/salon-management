-- CreateEnum
CREATE TYPE "SubscriptionEventKind" AS ENUM ('CREATED', 'TRIAL_STARTED', 'TRIAL_EXTENDED', 'CONVERTED', 'UPGRADED', 'DOWNGRADED', 'RENEWED', 'PAYMENT_FAILED', 'RECOVERED', 'CANCELLED', 'REACTIVATED', 'PRICE_CHANGED');

-- CreateTable
CREATE TABLE "SubscriptionEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "SubscriptionEventKind" NOT NULL,
    "fromValuePaise" INTEGER,
    "toValuePaise" INTEGER,
    "fromPlanCode" TEXT,
    "toPlanCode" TEXT,
    "billingPeriod" TEXT,
    "reason" TEXT,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscriptionEvent_tenantId_createdAt_idx" ON "SubscriptionEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_kind_createdAt_idx" ON "SubscriptionEvent"("kind", "createdAt");

-- AddForeignKey
ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
