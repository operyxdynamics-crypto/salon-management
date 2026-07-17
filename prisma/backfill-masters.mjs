/**
 * Master data backfill (migration step 2 of 3).
 *
 * Converts free-text reference strings into real master rows and points the new foreign keys
 * at them. Run once, after the additive migration, before any read switches to the FKs.
 *
 *   node prisma/backfill-masters.mjs           # apply
 *   node prisma/backfill-masters.mjs --dry-run # report only, write nothing
 *
 * Safe to run more than once: every write is an upsert keyed on (tenantId, name), and rows
 * that already have a FK are skipped.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Prisma 7 requires a driver adapter - a bare `new PrismaClient()` throws. Same setup as
// prisma/seed.mjs and src/lib/db.ts.
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const dryRun = process.argv.includes("--dry-run");

/** "Shampoo", "shampoo", and " SHAMPOO " are the same category. Collapse them. */
function normalise(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}
function key(value) {
  return normalise(value).toLowerCase();
}

const UNCATEGORISED = "Uncategorised";

/**
 * Standard salon units. `code` is what appears on the POS tile and the invoice.
 * `allowsFraction` is false for countable things - you cannot sell half a bottle.
 */
const UNIT_SEED = [
  { name: "Millilitre", code: "ml", allowsFraction: true },
  { name: "Litre", code: "l", allowsFraction: true },
  { name: "Gram", code: "g", allowsFraction: true },
  { name: "Kilogram", code: "kg", allowsFraction: true },
  { name: "Piece", code: "pc", allowsFraction: false },
  { name: "Pack", code: "pack", allowsFraction: false },
];

/** Maps a free-text unit string onto a seeded unit. */
const UNIT_ALIASES = {
  ml: "Millilitre", milliliter: "Millilitre", millilitre: "Millilitre", mls: "Millilitre",
  l: "Litre", ltr: "Litre", liter: "Litre", litre: "Litre",
  g: "Gram", gm: "Gram", gram: "Gram", grams: "Gram",
  kg: "Kilogram", kgs: "Kilogram", kilogram: "Kilogram",
  pc: "Piece", pcs: "Piece", piece: "Piece", pieces: "Piece", unit: "Piece", units: "Piece", nos: "Piece", each: "Piece",
  pack: "Pack", packet: "Pack", box: "Pack", set: "Pack",
};

/**
 * Standard salon HSN/SAC codes.
 *
 * These are a starting point, not tax advice - the owner must review them. HSN/SAC cannot be
 * inferred from existing data, so products and services are mapped by their current taxRate
 * and every one of them is reported for review at the end.
 */
const TAX_CLASS_SEED = [
  { name: "Beauty and salon services", code: "999721", kind: "SERVICE", rate: 18, description: "SAC 999721 - beauty and physical wellbeing services" },
  { name: "Hair care products", code: "3305", kind: "GOODS", rate: 18, description: "HSN 3305 - preparations for use on the hair" },
  { name: "Skin and cosmetic products", code: "3304", kind: "GOODS", rate: 18, description: "HSN 3304 - beauty or make-up preparations" },
  { name: "Soaps and cleansers", code: "3401", kind: "GOODS", rate: 18, description: "HSN 3401 - soap and organic surface-active products" },
  { name: "Salon tools and appliances", code: "8510", kind: "GOODS", rate: 18, description: "HSN 8510 - shavers, hair clippers and hair-removing appliances" },
  { name: "Exempt", code: "0000", kind: "GOODS", rate: 0, description: "Zero-rated or exempt. Review before use." },
];

const EXPENSE_SEED = ["Rent", "Salaries", "Utilities", "Supplies", "Marketing", "Maintenance", "Other"];

async function upsertMaster(model, tenantId, name, extra = {}, sortOrder = 0) {
  const clean = normalise(name) || UNCATEGORISED;
  if (dryRun) return { id: `dry-${key(clean)}`, name: clean };
  return db[model].upsert({
    where: { tenantId_name: { tenantId, name: clean } },
    update: {},
    create: { tenantId, name: clean, sortOrder, ...extra },
  });
}

async function backfillTenant(tenant) {
  const report = { tenant: tenant.name, productCategories: 0, units: 0, brands: 0, expenseCategories: 0, taxClasses: 0, productsLinked: 0, servicesLinked: 0, expensesLinked: 0, needsTaxReview: [] };

  // --- Tax classes -----------------------------------------------------------------
  const taxClasses = new Map();
  for (const [index, seed] of TAX_CLASS_SEED.entries()) {
    const row = await upsertMaster("taxClass", tenant.id, seed.name, { code: seed.code, kind: seed.kind, rate: seed.rate, description: seed.description }, index);
    taxClasses.set(seed.name, row);
    report.taxClasses += 1;
  }
  const defaultServiceTax = taxClasses.get("Beauty and salon services");
  const defaultGoodsTax = taxClasses.get("Hair care products");
  const exemptTax = taxClasses.get("Exempt");

  // --- Units -----------------------------------------------------------------------
  const units = new Map();
  for (const [index, seed] of UNIT_SEED.entries()) {
    const row = await upsertMaster("unitOfMeasure", tenant.id, seed.name, { code: seed.code, allowsFraction: seed.allowsFraction }, index);
    units.set(seed.name, row);
    report.units += 1;
  }

  // --- Product categories, brands, and product links --------------------------------
  const products = await db.inventoryItem.findMany({ where: { tenantId: tenant.id }, include: { vendor: true } });
  const categoryCache = new Map();
  const brandCache = new Map();

  for (const product of products) {
    const categoryName = normalise(product.category) || UNCATEGORISED;
    if (!categoryCache.has(key(categoryName))) {
      const row = await upsertMaster("productCategory", tenant.id, categoryName, {}, categoryCache.size);
      categoryCache.set(key(categoryName), row);
      report.productCategories += 1;
    }

    const unitName = UNIT_ALIASES[key(product.unit)] || null;
    if (!unitName && normalise(product.unit)) {
      // An unrecognised unit becomes its own master rather than being silently dropped.
      if (!units.has(normalise(product.unit))) {
        const row = await upsertMaster("unitOfMeasure", tenant.id, normalise(product.unit), { code: normalise(product.unit).slice(0, 8), allowsFraction: true }, units.size);
        units.set(normalise(product.unit), row);
        report.units += 1;
      }
    }
    const unitRow = unitName ? units.get(unitName) : units.get(normalise(product.unit)) || units.get("Piece");

    // Brand cannot be inferred from existing data - there was never a field for it. Products
    // are left brandless and the owner assigns brands from the Masters screen.
    const rate = Number(product.taxRate);
    const taxRow = rate === 0 ? exemptTax : defaultGoodsTax;
    if (rate !== 0 && rate !== Number(defaultGoodsTax?.rate ?? 18)) {
      report.needsTaxReview.push(`${product.name} (rate ${rate}%)`);
    }

    if (!dryRun) {
      await db.inventoryItem.update({
        where: { id: product.id },
        data: {
          categoryId: product.categoryId ?? categoryCache.get(key(categoryName)).id,
          unitId: product.unitId ?? unitRow?.id ?? null,
          taxClassId: product.taxClassId ?? taxRow?.id ?? null,
        },
      });
    }
    report.productsLinked += 1;
  }
  report.brands = brandCache.size;

  // --- Services ---------------------------------------------------------------------
  const services = await db.service.findMany({ where: { tenantId: tenant.id } });
  for (const service of services) {
    const rate = Number(service.taxRate);
    const taxRow = rate === 0 ? exemptTax : defaultServiceTax;
    if (rate !== 0 && rate !== Number(defaultServiceTax?.rate ?? 18)) {
      report.needsTaxReview.push(`${service.name} (rate ${rate}%)`);
    }

    // Services already have categoryId. Where it is null, adopt the category matching the
    // legacy string so the duplicate `category` column can be dropped safely.
    let categoryId = service.categoryId;
    if (!categoryId && normalise(service.category)) {
      const row = await upsertMaster("serviceCategory", tenant.id, service.category, {}, 0);
      categoryId = row.id;
    }

    if (!dryRun) {
      await db.service.update({
        where: { id: service.id },
        data: { categoryId, taxClassId: service.taxClassId ?? taxRow?.id ?? null },
      });
    }
    report.servicesLinked += 1;
  }

  // --- Expense categories -----------------------------------------------------------
  const expenses = await db.expense.findMany({ where: { branch: { tenantId: tenant.id } } });
  const expenseCache = new Map();
  for (const [index, name] of EXPENSE_SEED.entries()) {
    const row = await upsertMaster("expenseCategory", tenant.id, name, {}, index);
    expenseCache.set(key(name), row);
    report.expenseCategories += 1;
  }
  for (const expense of expenses) {
    const name = normalise(expense.category) || "Other";
    if (!expenseCache.has(key(name))) {
      const row = await upsertMaster("expenseCategory", tenant.id, name, {}, expenseCache.size);
      expenseCache.set(key(name), row);
      report.expenseCategories += 1;
    }
    if (!dryRun && !expense.categoryId) {
      await db.expense.update({ where: { id: expense.id }, data: { categoryId: expenseCache.get(key(name)).id } });
    }
    report.expensesLinked += 1;
  }

  return report;
}

async function main() {
  const tenants = await db.tenant.findMany({ select: { id: true, name: true } });
  console.log(`${dryRun ? "DRY RUN - nothing will be written" : "Backfilling"} across ${tenants.length} tenant(s)\n`);

  for (const tenant of tenants) {
    const report = await backfillTenant(tenant);
    console.log(`${report.tenant}`);
    console.log(`  product categories : ${report.productCategories}`);
    console.log(`  units of measure   : ${report.units}`);
    console.log(`  tax classes        : ${report.taxClasses}`);
    console.log(`  expense categories : ${report.expenseCategories}`);
    console.log(`  products linked    : ${report.productsLinked}`);
    console.log(`  services linked    : ${report.servicesLinked}`);
    console.log(`  expenses linked    : ${report.expensesLinked}`);
    if (report.needsTaxReview.length) {
      console.log(`\n  ${report.needsTaxReview.length} item(s) need an owner to confirm the HSN/SAC code,`);
      console.log("  because their GST rate does not match the default tax class:");
      for (const item of report.needsTaxReview.slice(0, 20)) console.log(`    - ${item}`);
      if (report.needsTaxReview.length > 20) console.log(`    ...and ${report.needsTaxReview.length - 20} more`);
    }
    console.log("");
  }

  console.log("Brands were not backfilled: the schema never had a brand field, so there is");
  console.log("nothing to infer from. Assign brands from Setup > Masters > Brands.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
