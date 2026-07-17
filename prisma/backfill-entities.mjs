/**
 * Legal entity and GST registration backfill.
 *
 *   node prisma/backfill-entities.mjs --dry-run
 *   node prisma/backfill-entities.mjs
 *
 * Every existing salon becomes a single COMPANY entity with COCO branches - which is exactly what
 * it already was, just modelled honestly. Nothing changes behaviourally for a single-branch salon.
 *
 * GST registration is state-wise, so one registration is created per distinct branch state. The
 * tenant's existing GSTIN is adopted for whichever state it actually belongs to (read from its
 * first two digits) - it cannot be reused for the others, and those are left blank for the owner
 * to fill in. A blank registration is reported, not silently accepted, because invoicing under a
 * missing GSTIN is exactly the failure this whole model exists to prevent.
 *
 * Safe to re-run: keyed on (legalEntityId, state) and skips branches that already have an entity.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const dryRun = process.argv.includes("--dry-run");

const GST_STATE_CODES = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
  "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
  "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur",
  "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal",
  "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra", "29": "Karnataka",
  "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
  "35": "Andaman and Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
};

function stateCodeForState(state) {
  const entry = Object.entries(GST_STATE_CODES).find(([, name]) => name.toLowerCase() === String(state || "").trim().toLowerCase());
  return entry ? entry[0] : null;
}

async function backfillTenant(tenant) {
  const report = { tenant: tenant.name, entity: null, registrations: [], branches: 0, invoices: 0, warnings: [] };

  const branches = await db.branch.findMany({ where: { tenantId: tenant.id } });
  if (!branches.length) {
    report.warnings.push("No branches - nothing to point at a registration.");
    return report;
  }

  // --- The company itself -----------------------------------------------------------
  const existing = await db.legalEntity.findFirst({ where: { tenantId: tenant.id, isPrimary: true } });
  const entity = existing ?? (dryRun ? { id: "dry-entity", legalName: tenant.legalName || tenant.name } : await db.legalEntity.create({
    data: {
      tenantId: tenant.id,
      type: "COMPANY",
      name: tenant.name,
      legalName: tenant.legalName || tenant.name,
      panNumber: tenant.panNumber,
      isPrimary: true,
    },
  }));
  report.entity = entity.legalName;

  // --- One registration per state the salon operates in -----------------------------
  const tenantGstin = (tenant.gstin || "").trim().toUpperCase();
  const tenantGstinStateCode = tenantGstin ? tenantGstin.slice(0, 2) : null;
  const tenantGstinState = tenantGstinStateCode ? GST_STATE_CODES[tenantGstinStateCode] ?? null : null;

  if (tenantGstin && !tenantGstinState) {
    report.warnings.push(`Tenant GSTIN "${tenantGstin}" does not start with a valid state code. It was not adopted.`);
  }

  const states = [...new Set(branches.map((branch) => branch.state).filter(Boolean))];
  const registrationByState = new Map();

  for (const state of states) {
    const stateCode = stateCodeForState(state);
    if (!stateCode) {
      report.warnings.push(`Branch state "${state}" is not a recognised GST state. Fix the branch address, then re-run.`);
      continue;
    }

    // The tenant's existing GSTIN belongs to exactly one state. Adopt it there and nowhere else.
    const adoptGstin = tenantGstinState && tenantGstinState.toLowerCase() === state.toLowerCase();
    const gstin = adoptGstin ? tenantGstin : "";

    if (!gstin) {
      report.warnings.push(`No GSTIN for ${state}. Branches there cannot issue GST invoices until one is added in Settings > Company.`);
    }

    if (dryRun) {
      registrationByState.set(state, { id: `dry-${stateCode}`, state, gstin });
      report.registrations.push(`${state} (${stateCode}) ${gstin || "- GSTIN MISSING"}`);
      continue;
    }

    // A blank GSTIN cannot go in a unique column, so an unregistered state gets a placeholder
    // that is obviously not a GSTIN and will fail format validation if anyone tries to bill on it.
    const registration = await db.gstRegistration.upsert({
      where: { legalEntityId_state: { legalEntityId: entity.id, state } },
      update: {},
      create: {
        legalEntityId: entity.id,
        gstin: gstin || `UNREGISTERED-${stateCode}-${entity.id.slice(-6)}`,
        state,
        stateCode,
        isActive: Boolean(gstin),
      },
    });
    registrationByState.set(state, registration);
    report.registrations.push(`${state} (${stateCode}) ${gstin || "- GSTIN MISSING"}`);
  }

  // --- Point every branch at its state's registration, as COCO ----------------------
  for (const branch of branches) {
    const registration = registrationByState.get(branch.state);
    if (!dryRun) {
      await db.branch.update({
        where: { id: branch.id },
        data: {
          ownershipModel: branch.ownershipModel ?? "COCO",
          ownerEntityId: branch.ownerEntityId ?? entity.id,
          operatorEntityId: branch.operatorEntityId ?? entity.id,
          gstRegistrationId: branch.gstRegistrationId ?? registration?.id ?? null,
        },
      });
    }
    report.branches += 1;
  }

  // --- Snapshot the supplier onto invoices that predate this model -------------------
  for (const branch of branches) {
    const registration = registrationByState.get(branch.state);
    const stateCode = registration?.stateCode ?? stateCodeForState(branch.state);
    if (dryRun) {
      report.invoices += await db.invoice.count({ where: { branchId: branch.id, legalEntityId: null } });
      continue;
    }
    const updated = await db.invoice.updateMany({
      where: { branchId: branch.id, legalEntityId: null },
      data: {
        legalEntityId: entity.id,
        gstRegistrationId: registration?.id ?? null,
        supplierName: entity.legalName,
        supplierGstin: registration?.gstin?.startsWith("UNREGISTERED") ? null : registration?.gstin ?? null,
        supplierStateCode: stateCode,
        placeOfSupplyState: branch.state,
      },
    });
    report.invoices += updated.count;
  }

  return report;
}

async function main() {
  const tenants = await db.tenant.findMany({ select: { id: true, name: true, legalName: true, gstin: true, panNumber: true } });
  console.log(`${dryRun ? "DRY RUN - nothing will be written" : "Backfilling"} across ${tenants.length} tenant(s)\n`);

  for (const tenant of tenants) {
    const report = await backfillTenant(tenant);
    console.log(report.tenant);
    console.log(`  company entity  : ${report.entity ?? "-"}`);
    console.log(`  registrations   : ${report.registrations.length}`);
    for (const line of report.registrations) console.log(`      ${line}`);
    console.log(`  branches linked : ${report.branches} (all set to COCO, company as owner and operator)`);
    console.log(`  invoices stamped: ${report.invoices}`);
    if (report.warnings.length) {
      console.log("\n  Needs attention:");
      for (const warning of report.warnings) console.log(`    - ${warning}`);
    }
    console.log("");
  }

  console.log("Every branch is now COCO with the company as owner and operator - the same thing it");
  console.log("already was. Franchise branches are set up in Settings > Branches.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
