import { db } from "@/lib/db";
import { masterLabels, type MasterRow, type MasterType } from "@/lib/masters-types";
import { OperationsError } from "@/lib/operations-auth";

/**
 * Master data - server-side reads and writes.
 *
 * This module touches the database, so it must never be imported by a client component.
 * Types, labels, and zod schemas live in `@/lib/masters-types`, which is safe on both sides.
 *
 * Masters are archived, never deleted: invoices, stock movements, and expenses point at these
 * rows, so a hard delete would break referential integrity or silently rewrite history.
 */

type ListArgs = { tenantId: string; includeArchived: boolean };

export async function listMasters(type: MasterType, { tenantId, includeArchived }: ListArgs): Promise<MasterRow[]> {
  const where = includeArchived ? { tenantId } : { tenantId, isActive: true };
  const orderBy = [{ sortOrder: "asc" as const }, { name: "asc" as const }];

  if (type === "service-categories") {
    const rows = await db.serviceCategory.findMany({ where, orderBy, include: { _count: { select: { services: true } } } });
    return rows.map((row) => ({
      id: row.id, name: row.name, code: null, description: row.description, color: row.color,
      sortOrder: row.sortOrder, isActive: row.isActive, usageCount: row._count.services,
      meta: { icon: row.icon },
    }));
  }

  if (type === "product-categories") {
    const rows = await db.productCategory.findMany({ where, orderBy, include: { _count: { select: { products: true } } } });
    return rows.map((row) => ({
      id: row.id, name: row.name, code: row.code, description: row.description, color: row.color,
      sortOrder: row.sortOrder, isActive: row.isActive, usageCount: row._count.products, meta: {},
    }));
  }

  if (type === "brands") {
    const rows = await db.brand.findMany({ where, orderBy, include: { _count: { select: { products: true } }, vendor: { select: { id: true, name: true } } } });
    return rows.map((row) => ({
      id: row.id, name: row.name, code: row.code, description: row.description, color: row.color,
      sortOrder: row.sortOrder, isActive: row.isActive, usageCount: row._count.products,
      meta: { vendorId: row.vendorId, vendorName: row.vendor?.name ?? null, logoUrl: row.logoUrl },
    }));
  }

  if (type === "units") {
    const rows = await db.unitOfMeasure.findMany({ where, orderBy, include: { _count: { select: { products: true } } } });
    return rows.map((row) => ({
      id: row.id, name: row.name, code: row.code, description: null, color: null,
      sortOrder: row.sortOrder, isActive: row.isActive, usageCount: row._count.products,
      meta: { allowsFraction: row.allowsFraction },
    }));
  }

  if (type === "tax-classes") {
    const rows = await db.taxClass.findMany({ where, orderBy, include: { _count: { select: { products: true, services: true } } } });
    return rows.map((row) => ({
      id: row.id, name: row.name, code: row.code, description: row.description, color: null,
      sortOrder: row.sortOrder, isActive: row.isActive,
      usageCount: row._count.products + row._count.services,
      meta: { kind: row.kind, rate: Number(row.rate) },
    }));
  }

  const rows = await db.expenseCategory.findMany({ where, orderBy, include: { _count: { select: { expenses: true } } } });
  return rows.map((row) => ({
    id: row.id, name: row.name, code: row.code, description: row.description, color: row.color,
    sortOrder: row.sortOrder, isActive: row.isActive, usageCount: row._count.expenses, meta: {},
  }));
}

type MasterInput = Record<string, unknown>;

export async function createMaster(type: MasterType, tenantId: string, input: MasterInput) {
  const data = { ...input, tenantId } as never;
  try {
    if (type === "service-categories") return await db.serviceCategory.create({ data });
    if (type === "product-categories") return await db.productCategory.create({ data });
    if (type === "brands") return await db.brand.create({ data });
    if (type === "units") return await db.unitOfMeasure.create({ data });
    if (type === "tax-classes") return await db.taxClass.create({ data });
    return await db.expenseCategory.create({ data });
  } catch (error) {
    throw duplicateNameError(error, type);
  }
}

export async function updateMaster(type: MasterType, tenantId: string, id: string, input: MasterInput) {
  // Scope the update by tenant so one salon cannot edit another's masters by guessing an id.
  const where = { id, tenantId } as never;
  const data = input as never;
  try {
    const result = type === "service-categories" ? await db.serviceCategory.updateMany({ where, data })
      : type === "product-categories" ? await db.productCategory.updateMany({ where, data })
      : type === "brands" ? await db.brand.updateMany({ where, data })
      : type === "units" ? await db.unitOfMeasure.updateMany({ where, data })
      : type === "tax-classes" ? await db.taxClass.updateMany({ where, data })
      : await db.expenseCategory.updateMany({ where, data });
    if (result.count !== 1) throw new OperationsError("NOT_FOUND", "That record no longer exists", 404);
    return result;
  } catch (error) {
    throw duplicateNameError(error, type);
  }
}

function duplicateNameError(error: unknown, type: MasterType) {
  const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
  if (code === "P2002") {
    return new OperationsError("CONFLICT", `A ${masterLabels[type].singular} with that name already exists`, 409);
  }
  return error;
}
