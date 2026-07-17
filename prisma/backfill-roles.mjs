/**
 * Roles backfill.
 *
 *   node prisma/backfill-roles.mjs --dry-run
 *   node prisma/backfill-roles.mjs
 *
 * Seeds the five locked system roles for every tenant and assigns each existing user the role
 * matching their legacy `UserRole`. Nobody gains or loses a single right: the seeded permission
 * sets are the same sets the hardcoded map already granted.
 *
 * Until this runs, `requireOperationsContext` falls back to the old map, so the app behaves
 * identically either way. Safe to re-run.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const dryRun = process.argv.includes("--dry-run");

const ALL = [
  "appointment:read", "appointment:write",
  "customer:read", "customer:write",
  "sale:write", "sale:refund", "report:read",
  "service:read", "master:write", "inventory:write",
  "staff:read", "staff:write", "payroll:read", "role:manage",
  "branch:manage", "tenant:manage", "campaign:write", "website:manage",
  "self:read",
];

const SYSTEM_ROLES = [
  {
    code: "OWNER",
    name: "Owner",
    description: "Full access to everything, including roles and company settings.",
    permissions: ALL,
  },
  {
    code: "MANAGER",
    name: "Manager",
    description: "Runs a branch day to day. Everything except company settings and roles.",
    permissions: [
      "appointment:read", "appointment:write", "customer:read", "customer:write",
      "sale:write", "sale:refund", "report:read",
      "service:read", "master:write", "inventory:write",
      "staff:read", "staff:write", "payroll:read",
      "branch:manage", "campaign:write", "website:manage", "self:read",
    ],
  },
  {
    code: "RECEPTIONIST",
    name: "Receptionist",
    description: "Books appointments and takes payments. Cannot refund or see revenue.",
    permissions: [
      "appointment:read", "appointment:write",
      "customer:read", "customer:write",
      "sale:write", "service:read", "self:read",
    ],
  },
  {
    code: "STYLIST",
    name: "Stylist",
    description: "Sees their own schedule and their customers. Cannot take money.",
    permissions: ["appointment:read", "customer:read", "service:read", "self:read"],
  },
  {
    code: "ACCOUNTANT",
    name: "Accountant",
    description: "Sees the money. Cannot change bookings or the catalogue.",
    permissions: [
      "sale:write", "sale:refund", "report:read",
      "service:read", "inventory:write",
      "staff:read", "payroll:read", "self:read",
    ],
  },
];

async function main() {
  const tenants = await db.tenant.findMany({ select: { id: true, name: true } });
  console.log(`${dryRun ? "DRY RUN - nothing will be written" : "Backfilling roles"} across ${tenants.length} tenant(s)\n`);

  for (const tenant of tenants) {
    console.log(tenant.name);
    const byCode = new Map();

    for (const seed of SYSTEM_ROLES) {
      if (dryRun) {
        byCode.set(seed.code, { id: `dry-${seed.code}` });
        console.log(`  role  ${seed.name.padEnd(13)} ${seed.permissions.length} permissions`);
        continue;
      }
      const role = await db.role.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: seed.name } },
        // System roles are locked, so their permission set is authoritative and is re-asserted on
        // every run. If someone has edited one in the database, this puts it back.
        update: { code: seed.code, description: seed.description, isSystem: true, permissions: seed.permissions },
        create: {
          tenantId: tenant.id,
          code: seed.code,
          name: seed.name,
          description: seed.description,
          isSystem: true,
          permissions: seed.permissions,
        },
      });
      byCode.set(seed.code, role);
      console.log(`  role  ${seed.name.padEnd(13)} ${seed.permissions.length} permissions`);
    }

    const users = await db.user.findMany({
      where: { tenantId: tenant.id, roleId: null },
      select: { id: true, name: true, role: true },
    });

    let assigned = 0;
    let skipped = 0;
    for (const user of users) {
      const role = byCode.get(user.role);
      if (!role) {
        // PLATFORM_ADMIN and CUSTOMER are not tenant roles and must not be given one.
        skipped += 1;
        continue;
      }
      if (!dryRun) await db.user.update({ where: { id: user.id }, data: { roleId: role.id } });
      assigned += 1;
    }

    console.log(`  users assigned: ${assigned}${skipped ? `, skipped (not tenant roles): ${skipped}` : ""}\n`);
  }

  console.log("Nobody gained or lost a right: the seeded sets match what the hardcoded map already");
  console.log("granted. Custom roles are created by cloning a system role in Settings > Roles.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
