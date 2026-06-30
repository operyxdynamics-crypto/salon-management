CREATE TYPE "AppointmentSource" AS ENUM ('MARKETPLACE', 'SALON_WEBSITE', 'PHONE', 'WALK_IN', 'STAFF_CREATED');
CREATE TYPE "WebsitePageStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

ALTER TABLE "Appointment"
  ALTER COLUMN "source" DROP DEFAULT,
  ALTER COLUMN "source" TYPE "AppointmentSource"
    USING (
      CASE
        WHEN "source" IN ('MARKETPLACE', 'SALON_WEBSITE', 'PHONE', 'WALK_IN', 'STAFF_CREATED')
          THEN "source"::"AppointmentSource"
        ELSE 'STAFF_CREATED'::"AppointmentSource"
      END
    ),
  ALTER COLUMN "source" SET DEFAULT 'MARKETPLACE';

DROP INDEX IF EXISTS "Customer_userId_key";
CREATE INDEX "Customer_userId_idx" ON "Customer"("userId");

CREATE TABLE "StaffBranchAssignment" (
  "id" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "canManageWebsite" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffBranchAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StaffBranchAssignment_staffId_branchId_key" ON "StaffBranchAssignment"("staffId", "branchId");
CREATE INDEX "StaffBranchAssignment_branchId_idx" ON "StaffBranchAssignment"("branchId");
ALTER TABLE "StaffBranchAssignment" ADD CONSTRAINT "StaffBranchAssignment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffBranchAssignment" ADD CONSTRAINT "StaffBranchAssignment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "StaffBranchAssignment" ("id", "staffId", "branchId", "isPrimary", "canManageWebsite")
SELECT CONCAT('sba_', md5("id" || ':' || "branchId")), "id", "branchId", true, false FROM "Staff"
ON CONFLICT ("staffId", "branchId") DO NOTHING;

CREATE TABLE "BranchService" (
  "branchId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "price" DECIMAL(10,2),
  "durationMinutes" INTEGER,
  "taxRate" DECIMAL(5,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BranchService_pkey" PRIMARY KEY ("branchId", "serviceId")
);
CREATE INDEX "BranchService_serviceId_idx" ON "BranchService"("serviceId");
ALTER TABLE "BranchService" ADD CONSTRAINT "BranchService_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BranchService" ADD CONSTRAINT "BranchService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "BranchService" ("branchId", "serviceId", "isActive", "createdAt", "updatedAt")
SELECT b."id", s."id", s."isActive", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Branch" b
JOIN "Service" s ON s."tenantId" = b."tenantId"
ON CONFLICT ("branchId", "serviceId") DO NOTHING;

CREATE TABLE "SalonWebsite" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "subdomain" TEXT NOT NULL,
  "siteName" TEXT NOT NULL,
  "theme" JSONB NOT NULL,
  "seoTitle" TEXT,
  "seoDescription" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalonWebsite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SalonWebsite_tenantId_key" ON "SalonWebsite"("tenantId");
CREATE UNIQUE INDEX "SalonWebsite_subdomain_key" ON "SalonWebsite"("subdomain");
ALTER TABLE "SalonWebsite" ADD CONSTRAINT "SalonWebsite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WebsitePage" (
  "id" TEXT NOT NULL,
  "websiteId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" "WebsitePageStatus" NOT NULL DEFAULT 'DRAFT',
  "draftBlocks" JSONB NOT NULL,
  "publishedBlocks" JSONB,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WebsitePage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WebsitePage_websiteId_slug_key" ON "WebsitePage"("websiteId", "slug");
ALTER TABLE "WebsitePage" ADD CONSTRAINT "WebsitePage_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "SalonWebsite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WebsiteRevision" (
  "id" TEXT NOT NULL,
  "websiteId" TEXT NOT NULL,
  "pageSlug" TEXT NOT NULL,
  "blocks" JSONB NOT NULL,
  "theme" JSONB NOT NULL,
  "actorId" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebsiteRevision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WebsiteRevision_websiteId_createdAt_idx" ON "WebsiteRevision"("websiteId", "createdAt");
ALTER TABLE "WebsiteRevision" ADD CONSTRAINT "WebsiteRevision_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "SalonWebsite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "SalonWebsite" ("id", "tenantId", "subdomain", "siteName", "theme", "createdAt", "updatedAt")
SELECT CONCAT('web_', md5(t."id")), t."id", t."slug", t."name",
  '{"primary":"#203a36","accent":"#d19a85","background":"#f8f5f0","font":"classic"}'::jsonb,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant" t
ON CONFLICT ("tenantId") DO NOTHING;

INSERT INTO "WebsitePage" ("id", "websiteId", "slug", "title", "status", "draftBlocks", "publishedBlocks", "publishedAt", "createdAt", "updatedAt")
SELECT CONCAT('page_', md5(w."id" || ':home')), w."id", 'home', 'Home', 'PUBLISHED',
  jsonb_build_array(
    jsonb_build_object('id','hero-default','type','hero','data',jsonb_build_object('eyebrow','Welcome','title',w."siteName",'body','Discover our services and book your next appointment.','buttonLabel','Book now')),
    jsonb_build_object('id','services-default','type','services','data',jsonb_build_object('title','Our services')),
    jsonb_build_object('id','branches-default','type','branches','data',jsonb_build_object('title','Visit us')),
    jsonb_build_object('id','booking-default','type','booking','data',jsonb_build_object('title','Book an appointment'))
  ),
  jsonb_build_array(
    jsonb_build_object('id','hero-default','type','hero','data',jsonb_build_object('eyebrow','Welcome','title',w."siteName",'body','Discover our services and book your next appointment.','buttonLabel','Book now')),
    jsonb_build_object('id','services-default','type','services','data',jsonb_build_object('title','Our services')),
    jsonb_build_object('id','branches-default','type','branches','data',jsonb_build_object('title','Visit us')),
    jsonb_build_object('id','booking-default','type','booking','data',jsonb_build_object('title','Book an appointment'))
  ),
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "SalonWebsite" w
ON CONFLICT ("websiteId", "slug") DO NOTHING;
