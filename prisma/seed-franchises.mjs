/**
 * Franchise test data.
 *
 *   node prisma/seed-franchises.mjs          # create
 *   node prisma/seed-franchises.mjs --reset  # remove what this script created, then create again
 *
 * Creates two franchisee businesses and four branches - two FOCO and two FOFO - plus a handful of
 * paid invoices on the FOFO branches.
 *
 * The invoices matter more than the branches. Without revenue that belongs to a franchisee, there
 * is nothing to prove that the reports correctly refuse to count it as the company's. That is the
 * single most dangerous number in the product, so it needs data to test against.
 *
 * Everything created here is tagged with SEED_TAG so --reset can remove it cleanly.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const reset = process.argv.includes("--reset");
const SEED_TAG = "seed-franchise";

/** A short invoice series code from a branch name, unique within the salon. */
function uniqueSeedInvoiceCode(name, taken) {
  const clean = (value) => value.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase();
  const words = name.split(/[^a-z0-9]+/i).filter(Boolean);
  const initials = words.length > 1 ? clean(words.map((word) => word[0]).join("")) : "";
  const base = (initials.length >= 2 ? initials : clean(words[0] ?? "")) || "INV";
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const tag = String(suffix);
    const candidate = `${base.slice(0, Math.max(1, 4 - tag.length))}${tag}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`Unable to allocate a unique invoice code for "${name}"`);
}

const GST_STATE_CODES = {
  "07": "Delhi", "19": "West Bengal", "24": "Gujarat", "27": "Maharashtra", "29": "Karnataka",
  "32": "Kerala", "33": "Tamil Nadu", "36": "Telangana",
};

function stateCodeFor(state) {
  const entry = Object.entries(GST_STATE_CODES).find(([, name]) => name.toLowerCase() === String(state || "").trim().toLowerCase());
  return entry ? entry[0] : null;
}

/** A structurally valid GSTIN: 2 state + 5 letters + 4 digits + letter + alnum + Z + checksum char. */
function makeGstin(stateCode, seed) {
  const letters = ["AAFCR", "AACCS", "AABCT", "AADCV"][seed % 4];
  const digits = String(1000 + seed * 137).slice(0, 4);
  return `${stateCode}${letters}${digits}K1Z${seed % 10}`;
}

async function main() {
  const tenant = await db.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!tenant) throw new Error("No tenant found. Run the main seed first.");

  const company = await db.legalEntity.findFirst({ where: { tenantId: tenant.id, isPrimary: true } });
  if (!company) throw new Error("No company entity. Run: node prisma/backfill-entities.mjs");

  // Branch has no createdAt column, so order by name for a stable pick.
  const homeBranch = await db.branch.findFirst({
    where: { tenantId: tenant.id, slug: { not: { startsWith: SEED_TAG } } },
    orderBy: { name: "asc" },
  });
  if (!homeBranch) throw new Error("No branches found.");

  const homeState = homeBranch.state;
  const homeStateCode = stateCodeFor(homeState);
  if (!homeStateCode) {
    throw new Error(`Branch state "${homeState}" is not a recognised GST state. Fix the branch address first.`);
  }

  if (reset) {
    console.log("Removing previously seeded franchise data...\n");
    const seeded = await db.branch.findMany({ where: { tenantId: tenant.id, slug: { startsWith: `${SEED_TAG}-` } }, select: { id: true } });
    const branchIds = seeded.map((branch) => branch.id);
    if (branchIds.length) {
      await db.invoiceLine.deleteMany({ where: { invoice: { branchId: { in: branchIds } } } });
      await db.paymentRecord.deleteMany({ where: { invoice: { branchId: { in: branchIds } } } });
      await db.invoice.deleteMany({ where: { branchId: { in: branchIds } } });
      await db.invoiceSequence.deleteMany({ where: { branchId: { in: branchIds } } });
      await db.branch.deleteMany({ where: { id: { in: branchIds } } });
    }
    await db.legalEntity.deleteMany({ where: { tenantId: tenant.id, cin: SEED_TAG } });
    console.log(`Removed ${branchIds.length} branch(es) and their franchisee businesses.\n`);
  }

  // The company needs a registration in its own state for the FOCO branches to bill under.
  const companyRegistration = await db.gstRegistration.upsert({
    where: { legalEntityId_state: { legalEntityId: company.id, state: homeState } },
    update: {},
    create: {
      legalEntityId: company.id,
      gstin: makeGstin(homeStateCode, 1),
      state: homeState,
      stateCode: homeStateCode,
      isActive: true,
    },
  });

  // --- Two franchisee businesses --------------------------------------------------------
  // `cin` is used as the seed tag so --reset can find them again.
  const franchiseeA = await db.legalEntity.upsert({
    where: { id: `${SEED_TAG}-a-${tenant.id}`.slice(0, 25) },
    update: {},
    create: {
      id: `${SEED_TAG}-a-${tenant.id}`.slice(0, 25),
      tenantId: tenant.id,
      type: "FRANCHISEE",
      name: "Sharma Ventures",
      legalName: "Sharma Beauty Ventures Pvt Ltd",
      panNumber: "AAFCS1234K",
      cin: SEED_TAG,
      isPrimary: false,
    },
  });

  const franchiseeB = await db.legalEntity.upsert({
    where: { id: `${SEED_TAG}-b-${tenant.id}`.slice(0, 25) },
    update: {},
    create: {
      id: `${SEED_TAG}-b-${tenant.id}`.slice(0, 25),
      tenantId: tenant.id,
      type: "FRANCHISEE",
      name: "Rao Beauty LLP",
      legalName: "Rao Beauty Services LLP",
      panNumber: "AABCR5678M",
      cin: SEED_TAG,
      isPrimary: false,
    },
  });

  // A FOFO franchisee bills under its OWN GSTIN. A FOCO franchisee never invoices, so it needs no
  // registration at all - the company invoices for it. That asymmetry is the whole point.
  const franchiseeARegistration = await db.gstRegistration.upsert({
    where: { legalEntityId_state: { legalEntityId: franchiseeA.id, state: homeState } },
    update: {},
    create: {
      legalEntityId: franchiseeA.id,
      gstin: makeGstin(homeStateCode, 2),
      state: homeState,
      stateCode: homeStateCode,
      isActive: true,
    },
  });

  const branchSpecs = [
    // FOCO: the franchisee funded it, the company runs it - so the COMPANY invoices.
    { key: "foco-1", name: "Whitefield (FOCO)", model: "FOCO", owner: franchiseeB.id, operator: company.id, registration: companyRegistration.id },
    { key: "foco-2", name: "HSR Layout (FOCO)", model: "FOCO", owner: franchiseeB.id, operator: company.id, registration: companyRegistration.id },
    // FOFO: the franchisee owns and runs it - so the FRANCHISEE invoices, under its own GSTIN.
    { key: "fofo-1", name: "Jayanagar (FOFO)", model: "FOFO", owner: franchiseeA.id, operator: franchiseeA.id, registration: franchiseeARegistration.id },
    { key: "fofo-2", name: "Malleshwaram (FOFO)", model: "FOFO", owner: franchiseeA.id, operator: franchiseeA.id, registration: franchiseeARegistration.id },
  ];

  // Every branch needs its own invoice series. These slugs all begin "seed-franchise-", so anything
  // derived from the slug would collide - which is exactly the bug that made checkout fail.
  const takenCodes = new Set(
    (await db.branch.findMany({ where: { tenantId: tenant.id }, select: { invoiceCode: true } }))
      .flatMap((branch) => branch.invoiceCode ? [branch.invoiceCode.toUpperCase()] : []),
  );

  const branches = [];
  for (const spec of branchSpecs) {
    const slug = `${SEED_TAG}-${spec.key}`;
    const existing = await db.branch.findUnique({ where: { tenantId_slug: { tenantId: tenant.id, slug } }, select: { invoiceCode: true } });
    const invoiceCode = existing?.invoiceCode ?? uniqueSeedInvoiceCode(spec.name, takenCodes);
    takenCodes.add(invoiceCode);

    const branch = await db.branch.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug } },
      update: {
        invoiceCode,
        ownershipModel: spec.model,
        ownerEntityId: spec.owner,
        operatorEntityId: spec.operator,
        gstRegistrationId: spec.registration,
      },
      create: {
        tenantId: tenant.id,
        name: spec.name,
        slug,
        invoiceCode,
        address: `${spec.name} Main Road`,
        city: homeBranch.city,
        state: homeState,
        postalCode: homeBranch.postalCode,
        // APPROVED is the published state; there is no "PUBLISHED" member.
        publicationStatus: "APPROVED",
        approvedAt: new Date(),
        isPublished: true,
        ownershipModel: spec.model,
        ownerEntityId: spec.owner,
        operatorEntityId: spec.operator,
        gstRegistrationId: spec.registration,
      },
    });
    branches.push({ ...branch, model: spec.model });
    console.log(`  ${spec.model}  ${spec.name}`);
  }

  // --- Revenue that is NOT the company's ------------------------------------------------
  const customer = await db.customer.findFirst({ where: { tenantId: tenant.id } });
  const service = await db.service.findFirst({ where: { tenantId: tenant.id, isActive: true } });

  if (!customer || !service) {
    console.log("\nNo customer or service found, so no test invoices were created.");
    console.log("Run the main seed first if you want franchise revenue to test reports against.");
  } else {
    const fofoBranches = branches.filter((branch) => branch.model === "FOFO");
    let created = 0;

    for (const [index, branch] of fofoBranches.entries()) {
      const price = Number(service.price);
      const taxRate = Number(service.taxRate);
      const tax = Number((price * taxRate / 100).toFixed(2));
      const total = Number((price + tax).toFixed(2));
      const number = `GST-FOFO-${branch.id.slice(-4).toUpperCase()}-${index + 1}`;

      const exists = await db.invoice.findUnique({ where: { number } });
      if (exists) continue;

      await db.invoice.create({
        data: {
          number,
          branchId: branch.id,
          customerId: customer.id,
          // The supplier snapshot is what makes this money the franchisee's, and it is what the
          // reports read to exclude it from the company's revenue.
          legalEntityId: franchiseeA.id,
          gstRegistrationId: franchiseeARegistration.id,
          supplierName: franchiseeA.legalName,
          supplierGstin: franchiseeARegistration.gstin,
          supplierStateCode: homeStateCode,
          placeOfSupplyState: homeState,
          subtotal: price,
          discount: 0,
          tax,
          taxMode: "GST",
          tip: 0,
          total,
          status: "PAID",
          type: "SALE",
          lines: {
            create: {
              type: "SERVICE",
              description: service.name,
              serviceId: service.id,
              quantity: 1,
              unitPrice: price,
              discount: 0,
              taxRate,
              priceTaxMode: service.priceTaxMode,
              tax,
              total,
            },
          },
          payments: { create: { method: "CASH", amount: total } },
        },
      });
      created += 1;
    }
    console.log(`\n  ${created} paid invoice(s) created on FOFO branches - this money belongs to ${franchiseeA.name}.`);
  }

  console.log("\nDone. What to check:\n");
  console.log("  1. Branch picker: the COCO / FOCO / FOFO tabs now have branches in them, each with");
  console.log("     its own colour, grouped under the business that operates them.");
  console.log("  2. Settings > This branch, on a FOFO branch: it bills under the franchisee's GSTIN.");
  console.log("  3. Reports with a FOFO branch in scope: an amber banner, and 'Your revenue' EXCLUDES");
  console.log("     the franchise sales. That is the number that would otherwise be wrong.");
  console.log("  4. An invoice from a FOFO branch prints the franchisee's legal name and GSTIN,");
  console.log("     not the company's.\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
