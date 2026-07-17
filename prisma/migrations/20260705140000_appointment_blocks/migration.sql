-- Appointment blocked time for branch closures, staff breaks, and resource holds.
CREATE TABLE "BlockedTime" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "staffId" TEXT,
  "resourceId" TEXT,
  "createdById" TEXT,
  "title" TEXT NOT NULL,
  "reason" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "isAllDay" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BlockedTime_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BlockedTime_branchId_startsAt_endsAt_idx" ON "BlockedTime"("branchId", "startsAt", "endsAt");
CREATE INDEX "BlockedTime_staffId_startsAt_endsAt_idx" ON "BlockedTime"("staffId", "startsAt", "endsAt");
CREATE INDEX "BlockedTime_resourceId_startsAt_endsAt_idx" ON "BlockedTime"("resourceId", "startsAt", "endsAt");

ALTER TABLE "BlockedTime" ADD CONSTRAINT "BlockedTime_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlockedTime" ADD CONSTRAINT "BlockedTime_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BlockedTime" ADD CONSTRAINT "BlockedTime_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BlockedTime" ADD CONSTRAINT "BlockedTime_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
