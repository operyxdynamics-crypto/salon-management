import { z } from "zod";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

const schema = z.object({
  branchId: z.string().min(1),
  name: z.string().min(2).max(120),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional().or(z.literal("")),
  gstin: z.string().max(20).optional(),
  notes: z.string().max(300).optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid vendor", 400, parsed.error.flatten());
    const context = await requireOperationsContext("inventory:write", { branchId: parsed.data.branchId, requireBranch: true });
    const vendor = await db.vendor.upsert({
      where: { tenantId_name: { tenantId: context.tenant.id, name: parsed.data.name.trim() } },
      update: {
        phone: parsed.data.phone || null,
        email: parsed.data.email || null,
        gstin: parsed.data.gstin || null,
        notes: parsed.data.notes || null,
        isActive: true,
      },
      create: {
        tenantId: context.tenant.id,
        name: parsed.data.name.trim(),
        phone: parsed.data.phone || null,
        email: parsed.data.email || null,
        gstin: parsed.data.gstin || null,
        notes: parsed.data.notes || null,
      },
    });
    await db.auditLog.create({
      data: { userId: context.user.id, tenantId: context.tenant.id, action: "VENDOR_SAVED", entity: "Vendor", entityId: vendor.id },
    });
    return Response.json({ data: vendor }, { status: 201 });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
