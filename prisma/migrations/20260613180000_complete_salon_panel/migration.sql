-- Complete salon operations foundation.
ALTER TABLE "Customer"
  ADD COLUMN "preferences" JSONB,
  ADD COLUMN "allergies" TEXT,
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Service"
  ADD COLUMN "onlineBooking" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "bufferBefore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "bufferAfter" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Appointment"
  ADD COLUMN "cancellationReason" TEXT,
  ADD COLUMN "seriesId" TEXT;

ALTER TABLE "Membership" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Package" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Campaign" ADD COLUMN "scheduledAt" TIMESTAMP(3);
ALTER TABLE "Review"
  ADD COLUMN "reportReason" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Shift" ADD COLUMN "branchId" TEXT;
UPDATE "Shift" SET "branchId" = "Staff"."branchId"
FROM "Staff" WHERE "Shift"."staffId" = "Staff"."id";
ALTER TABLE "Shift" ALTER COLUMN "branchId" SET NOT NULL;

CREATE TABLE "AppointmentSeries" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "frequency" TEXT NOT NULL,
  "interval" INTEGER NOT NULL DEFAULT 1,
  "endsAt" TIMESTAMP(3),
  "occurrences" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppointmentSeries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppointmentServiceLine" (
  "id" TEXT NOT NULL,
  "appointmentId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "staffId" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "durationMinutes" INTEGER NOT NULL,
  "price" DECIMAL(10,2) NOT NULL,
  "taxRate" DECIMAL(5,2) NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "AppointmentServiceLine_pkey" PRIMARY KEY ("id")
);

INSERT INTO "AppointmentServiceLine"
  ("id", "appointmentId", "serviceId", "staffId", "durationMinutes", "price", "taxRate", "sortOrder")
SELECT
  CONCAT('asl_', md5(random()::text || clock_timestamp()::text || "Appointment"."id")),
  "Appointment"."id",
  "Appointment"."serviceId",
  "Appointment"."staffId",
  "Service"."durationMinutes",
  "Service"."price",
  "Service"."taxRate",
  0
FROM "Appointment"
JOIN "Service" ON "Service"."id" = "Appointment"."serviceId";

CREATE TABLE "MessageTemplate" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "channel" "MessageChannel" NOT NULL,
  "category" TEXT NOT NULL,
  "subject" TEXT,
  "body" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GiftCard" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT,
  "customerId" TEXT,
  "code" TEXT NOT NULL,
  "initialValue" DECIMAL(10,2) NOT NULL,
  "balance" DECIMAL(10,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GiftCard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RegisterSession" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "openedById" TEXT NOT NULL,
  "closedById" TEXT,
  "openingBalance" DECIMAL(12,2) NOT NULL,
  "closingBalance" DECIMAL(12,2),
  "expectedBalance" DECIMAL(12,2),
  "variance" DECIMAL(12,2),
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "RegisterSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DashboardPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "widgets" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DashboardPreference_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AppointmentServiceLine_appointmentId_sortOrder_idx"
  ON "AppointmentServiceLine"("appointmentId", "sortOrder");
CREATE INDEX "Shift_branchId_startsAt_endsAt_idx" ON "Shift"("branchId", "startsAt", "endsAt");
CREATE UNIQUE INDEX "MessageTemplate_tenantId_name_channel_key"
  ON "MessageTemplate"("tenantId", "name", "channel");
CREATE UNIQUE INDEX "GiftCard_code_key" ON "GiftCard"("code");
CREATE INDEX "GiftCard_tenantId_status_idx" ON "GiftCard"("tenantId", "status");
CREATE INDEX "RegisterSession_branchId_status_idx" ON "RegisterSession"("branchId", "status");
CREATE UNIQUE INDEX "DashboardPreference_userId_key" ON "DashboardPreference"("userId");

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_seriesId_fkey"
  FOREIGN KEY ("seriesId") REFERENCES "AppointmentSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AppointmentServiceLine"
  ADD CONSTRAINT "AppointmentServiceLine_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppointmentServiceLine"
  ADD CONSTRAINT "AppointmentServiceLine_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Shift"
  ADD CONSTRAINT "Shift_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GiftCard"
  ADD CONSTRAINT "GiftCard_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GiftCard"
  ADD CONSTRAINT "GiftCard_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RegisterSession"
  ADD CONSTRAINT "RegisterSession_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DashboardPreference"
  ADD CONSTRAINT "DashboardPreference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
