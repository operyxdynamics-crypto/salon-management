CREATE TABLE "ServiceCategoryTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServiceCategoryTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "copiedFromTemplateId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServiceCategory_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Service" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "AppointmentServiceLine" ADD COLUMN "startsAt" TIMESTAMP(3);
ALTER TABLE "AppointmentServiceLine" ADD COLUMN "endsAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "ServiceCategoryTemplate_name_key" ON "ServiceCategoryTemplate"("name");
CREATE UNIQUE INDEX "ServiceCategory_tenantId_name_key" ON "ServiceCategory"("tenantId", "name");
CREATE INDEX "ServiceCategory_tenantId_sortOrder_idx" ON "ServiceCategory"("tenantId", "sortOrder");
CREATE INDEX "Service_categoryId_idx" ON "Service"("categoryId");
CREATE INDEX "AppointmentServiceLine_staffId_startsAt_endsAt_idx" ON "AppointmentServiceLine"("staffId", "startsAt", "endsAt");

ALTER TABLE "ServiceCategory"
ADD CONSTRAINT "ServiceCategory_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Service"
ADD CONSTRAINT "Service_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AppointmentServiceLine"
ADD CONSTRAINT "AppointmentServiceLine_staffId_fkey"
FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "ServiceCategory" (
  "id", "tenantId", "name", "sortOrder", "isActive", "createdAt", "updatedAt"
)
SELECT
  'cat_' || md5("tenantId" || ':' || "category"),
  "tenantId",
  "category",
  ROW_NUMBER() OVER (PARTITION BY "tenantId" ORDER BY "category") - 1,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Service"
GROUP BY "tenantId", "category";

UPDATE "Service" AS service
SET "categoryId" = category."id"
FROM "ServiceCategory" AS category
WHERE category."tenantId" = service."tenantId"
  AND category."name" = service."category";

UPDATE "AppointmentServiceLine" AS line
SET
  "startsAt" = appointment."startsAt",
  "endsAt" = appointment."endsAt"
FROM "Appointment" AS appointment
WHERE appointment."id" = line."appointmentId"
  AND line."startsAt" IS NULL;
