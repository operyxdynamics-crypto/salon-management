/**
 * Give every branch a unique invoice code, and repair invoice sequences that drifted.
 *
 * Why this exists: invoice numbers used to take the first four letters of the branch slug, so all
 * four "seed-franchise-*" branches issued "GST-SEED-25-26-00001". The invoice number is globally
 * unique, so the first branch to bill won and every other branch failed forever - the collision
 * threw inside the transaction, which rolled the counter back, so each retry collided again.
 *
 * Run once:  node prisma/backfill-invoice-codes.mjs
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

if (!process.env.DIRECT_URL && !process.env.DATABASE_URL) {
  throw new Error("DIRECT_URL / DATABASE_URL is not configured");
}

const INVOICE_CODE_MAX_LENGTH = 4;

function normaliseInvoiceCode(value) {
  return value.replace(/[^a-z0-9]/gi, "").slice(0, INVOICE_CODE_MAX_LENGTH).toUpperCase();
}

function deriveInvoiceCode(name) {
  const words = name.split(/[^a-z0-9]+/i).filter(Boolean);
  if (words.length > 1) {
    const candidate = normaliseInvoiceCode(words.map((word) => word[0]).join(""));
    if (candidate.length >= 2) return candidate;
  }
  return normaliseInvoiceCode(words[0] ?? "") || "INV";
}

function uniqueInvoiceCode(name, taken) {
  const used = new Set([...taken].map((code) => code.toUpperCase()));
  const base = deriveInvoiceCode(name);
  if (!used.has(base)) return base;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const tag = String(suffix);
    const stem = base.slice(0, Math.max(1, INVOICE_CODE_MAX_LENGTH - tag.length));
    const candidate = `${stem}${tag}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error(`Unable to allocate a unique invoice code for "${name}"`);
}

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

async function main() {
  const tenants = await db.tenant.findMany({ select: { id: true, name: true } });
  let assigned = 0;

  for (const tenant of tenants) {
    const branches = await db.branch.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, name: true, slug: true, invoiceCode: true },
      orderBy: { name: "asc" },
    });

    // Codes already in use in this salon are reserved, so a re-run never reshuffles them.
    const taken = new Set(branches.flatMap((branch) => branch.invoiceCode ? [branch.invoiceCode.toUpperCase()] : []));

    for (const branch of branches) {
      if (branch.invoiceCode) continue;
      const code = uniqueInvoiceCode(branch.name || branch.slug, taken);
      taken.add(code);
      await db.branch.update({ where: { id: branch.id }, data: { invoiceCode: code } });
      console.log(`  ${tenant.name}: ${branch.name} → ${code}`);
      assigned += 1;
    }
  }

  console.log(`\nAssigned ${assigned} invoice code(s).`);

  // Repair counters: an invoice number must never be reissued. For each branch/year/series, start
  // the next number above the highest serial already present.
  const sequences = await db.invoiceSequence.findMany();
  let repaired = 0;
  for (const sequence of sequences) {
    const count = await db.invoice.count({ where: { branchId: sequence.branchId } });
    if (count >= sequence.nextNumber) {
      await db.invoiceSequence.update({ where: { id: sequence.id }, data: { nextNumber: count + 1 } });
      console.log(`  Repaired sequence for branch ${sequence.branchId}: ${sequence.nextNumber} → ${count + 1}`);
      repaired += 1;
    }
  }
  console.log(`Repaired ${repaired} sequence(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
