-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'DEMO_BOOKED', 'QUOTED', 'WON', 'LOST');

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "salonName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "city" TEXT,
    "branchCount" INTEGER NOT NULL DEFAULT 1,
    "staffCount" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "interestedPlanId" TEXT,
    "notes" TEXT,
    "followUpAt" TIMESTAMP(3),
    "ownerUserId" TEXT,
    "convertedTenantId" TEXT,
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lead_convertedTenantId_key" ON "Lead"("convertedTenantId");

-- CreateIndex
CREATE INDEX "Lead_status_followUpAt_idx" ON "Lead"("status", "followUpAt");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_interestedPlanId_fkey" FOREIGN KEY ("interestedPlanId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
