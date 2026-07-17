-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "accuracyMeters" INTEGER,
ADD COLUMN     "distanceMeters" INTEGER,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'ON_SITE',
ADD COLUMN     "lateMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "latitude" DECIMAL(10,7),
ADD COLUMN     "longitude" DECIMAL(10,7),
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT;

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "geofenceRadiusMeters" INTEGER NOT NULL DEFAULT 150,
ADD COLUMN     "lateGraceMinutes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "monthlySalary" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Attendance_branchId_status_idx" ON "Attendance"("branchId", "status");

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
