ALTER TABLE "Attendance"
  ADD COLUMN "branchId" TEXT,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'CLOCK',
  ADD COLUMN "note" TEXT,
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "Attendance_idempotencyKey_key" ON "Attendance"("idempotencyKey");
CREATE INDEX "Attendance_branchId_clockIn_idx" ON "Attendance"("branchId", "clockIn");
CREATE INDEX "Attendance_staffId_clockIn_idx" ON "Attendance"("staffId", "clockIn");

ALTER TABLE "Attendance"
  ADD CONSTRAINT "Attendance_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
