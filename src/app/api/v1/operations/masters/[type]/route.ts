import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { createMaster, listMasters, updateMaster } from "@/lib/masters";
import { isMasterType, masterLabels, masterSchemas } from "@/lib/masters-types";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

/**
 * One route for every master type.
 *
 * Reading a master needs only `service:read` - the POS and stock screens read them constantly.
 * Writing needs `branch:manage`, which keeps receptionists and stylists out of the setup layer.
 */

const patchSchema = z.object({
  id: z.string().min(1),
  branchId: z.string().optional(),
  patch: z.record(z.string(), z.unknown()),
});

export async function GET(request: Request, { params }: { params: Promise<{ type: string }> }) {
  try {
    const { type } = await params;
    if (!isMasterType(type)) throw new OperationsError("NOT_FOUND", "Unknown master type", 404);

    const url = new URL(request.url);
    const branchId = url.searchParams.get("branchId") ?? "all";
    const includeArchived = url.searchParams.get("includeArchived") === "true";
    const context = await requireOperationsContext("service:read", { branchId, allowAll: true });

    const rows = await listMasters(type, { tenantId: context.tenant.id, includeArchived });

    // Brands are picked against a vendor, so the editor needs the vendor list to hand.
    const vendors = type === "brands"
      ? await db.vendor.findMany({ where: { tenantId: context.tenant.id, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : [];

    return Response.json({ data: { type, label: masterLabels[type], rows, vendors } });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ type: string }> }) {
  try {
    const { type } = await params;
    if (!isMasterType(type)) throw new OperationsError("NOT_FOUND", "Unknown master type", 404);

    const body = await request.json();
    // Masters belong to the tenant, not to a branch - a brand or an HSN code is not owned by one
    // location. Requiring a specific branch here meant an owner viewing "all branches" could not
    // add anything.
    const context = await requireOperationsContext("branch:manage", { branchId: "all", allowAll: true });

    const parsed = masterSchemas[type].safeParse(body);
    if (!parsed.success) throw new OperationsError("VALIDATION", `Invalid ${masterLabels[type].singular}`, 400, parsed.error.flatten());

    const created = await createMaster(type, context.tenant.id, parsed.data);
    await db.auditLog.create({
      data: {
        userId: context.user.id,
        tenantId: context.tenant.id,
        action: "MASTER_CREATED",
        entity: type,
        entityId: (created as { id?: string }).id,
        metadata: { type, name: (parsed.data as { name?: string }).name },
      },
    });
    return Response.json({ data: created }, { status: 201 });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ type: string }> }) {
  try {
    const { type } = await params;
    if (!isMasterType(type)) throw new OperationsError("NOT_FOUND", "Unknown master type", 404);

    const parsedBody = patchSchema.safeParse(await request.json());
    if (!parsedBody.success) throw new OperationsError("VALIDATION", "Invalid update", 400, parsedBody.error.flatten());
    const context = await requireOperationsContext("branch:manage", { branchId: "all", allowAll: true });

    // A patch may be partial (a rename, a reorder, or an archive toggle), so validate against
    // the type's schema with every field optional.
    const partial = (masterSchemas[type] as z.ZodObject<z.ZodRawShape>).partial();
    const parsed = partial.safeParse(parsedBody.data.patch);
    if (!parsed.success) throw new OperationsError("VALIDATION", `Invalid ${masterLabels[type].singular}`, 400, parsed.error.flatten());
    if (!Object.keys(parsed.data).length) throw new OperationsError("VALIDATION", "Nothing to update", 400);

    await updateMaster(type, context.tenant.id, parsedBody.data.id, parsed.data);
    await db.auditLog.create({
      data: {
        userId: context.user.id,
        tenantId: context.tenant.id,
        action: parsed.data.isActive === false ? "MASTER_ARCHIVED" : "MASTER_UPDATED",
        entity: type,
        entityId: parsedBody.data.id,
        metadata: { type, patch: parsed.data } as Prisma.InputJsonValue,
      },
    });
    return Response.json({ data: { id: parsedBody.data.id } });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
