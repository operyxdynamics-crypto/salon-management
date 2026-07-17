import { z } from "zod";

/**
 * Master registry - types, labels, and validation only.
 *
 * Deliberately free of any database or session import. The Masters UI is a client component
 * and must be able to import this; pulling in `@/lib/db` or `@/lib/operations-auth` would drag
 * `next/headers` into the browser bundle and break the build.
 *
 * Server-side reads and writes live in `@/lib/masters`.
 */

export const MASTER_TYPES = [
  "service-categories",
  "product-categories",
  "brands",
  "units",
  "tax-classes",
  "expense-categories",
] as const;

export type MasterType = (typeof MASTER_TYPES)[number];

export function isMasterType(value: string): value is MasterType {
  return (MASTER_TYPES as readonly string[]).includes(value);
}

export type MasterRow = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  /** How many records point at this master. Shown before archiving. */
  usageCount: number;
  /** Type-specific display fields, e.g. tax rate or the brand's vendor. */
  meta: Record<string, string | number | boolean | null>;
};

const baseFields = {
  name: z.string().trim().min(1).max(80),
  code: z.string().trim().max(20).optional().nullable(),
  description: z.string().trim().max(300).optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
};

export const masterSchemas = {
  "service-categories": z.object({ ...baseFields, icon: z.string().trim().max(40).optional().nullable() }),
  "product-categories": z.object(baseFields),
  "brands": z.object({ ...baseFields, logoUrl: z.string().url().max(500).optional().nullable(), vendorId: z.string().min(1).optional().nullable() }),
  "units": z.object({ ...baseFields, code: z.string().trim().min(1).max(20), allowsFraction: z.boolean().optional() }),
  "tax-classes": z.object({
    ...baseFields,
    code: z.string().trim().min(1).max(20),
    kind: z.enum(["GOODS", "SERVICE"]),
    rate: z.number().min(0).max(100),
  }),
  "expense-categories": z.object(baseFields),
} satisfies Record<MasterType, z.ZodTypeAny>;

export const masterLabels: Record<MasterType, { title: string; singular: string; blurb: string }> = {
  "service-categories": { title: "Service categories", singular: "service category", blurb: "How services are grouped on the booking page and the POS." },
  "product-categories": { title: "Product categories", singular: "product category", blurb: "How retail products are grouped in stock and on the POS." },
  "brands": { title: "Brands", singular: "brand", blurb: "The brands you stock. Needed for sales-by-brand reporting." },
  "units": { title: "Units of measure", singular: "unit", blurb: "How products are counted. Feeds stock levels and service recipes." },
  "tax-classes": { title: "Tax classes (HSN/SAC)", singular: "tax class", blurb: "GST codes and rates. Required on GST invoices by law." },
  "expense-categories": { title: "Expense categories", singular: "expense category", blurb: "How spending is grouped in day close and reports." },
};
