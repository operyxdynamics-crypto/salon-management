import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";
import { calculateSaleDraftTotal, saleDraftInclude, saleDraftPayloadSchema, saleDraftTitle, serializeSaleDraft } from "@/lib/sale-drafts";

async function readJson(request: Request) {
  const text = await request.text();
  return text ? JSON.parse(text) : {};
}

export async function PATCH(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  try {
    const parsed = saleDraftPayloadSchema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid held sale", 400, parsed.error.flatten());
    const { draftId } = await params;
    const context = await requireOperationsContext("sale:write", { branchId: parsed.data.branchId, requireBranch: true });
    const branch = context.branch!;
    const payload = parsed.data;

    const existing = await db.saleDraft.findFirst({
      where: { id: draftId, tenantId: context.tenant.id, branchId: branch.id, status: "HELD" },
    });
    if (!existing) throw new OperationsError("NOT_FOUND", "Held sale not found", 404);

    const customer = payload.customerId
      ? await db.customer.findFirst({ where: { id: payload.customerId, tenantId: context.tenant.id, isArchived: false } })
      : null;
    if (payload.customerId && !customer) throw new OperationsError("NOT_FOUND", "Customer not found", 404);

    const appointment = payload.appointmentId
      ? await db.appointment.findFirst({ where: { id: payload.appointmentId, branchId: branch.id } })
      : null;
    if (payload.appointmentId && !appointment) throw new OperationsError("NOT_FOUND", "Appointment not found", 404);
    if (appointment && customer && appointment.customerId !== customer.id) {
      throw new OperationsError("VALIDATION", "Selected appointment belongs to another customer", 400);
    }

    const customerId = customer?.id ?? appointment?.customerId ?? null;
    const total = calculateSaleDraftTotal(payload);
    const draft = await db.saleDraft.update({
      where: { id: existing.id },
      data: {
        customerId,
        appointmentId: appointment?.id ?? null,
        title: saleDraftTitle(payload, customer?.name),
        taxMode: payload.taxMode,
        cart: payload.cart as Prisma.InputJsonValue,
        payments: payload.payments as Prisma.InputJsonValue,
        tip: payload.tip,
        total,
      },
      include: saleDraftInclude,
    });
    await db.auditLog.create({
      data: {
        userId: context.user.id,
        tenantId: context.tenant.id,
        action: "SALE_DRAFT_UPDATED",
        entity: "SaleDraft",
        entityId: draft.id,
        metadata: { branchId: branch.id, total, lineCount: payload.cart.length },
      },
    });
    return Response.json({ data: serializeSaleDraft(draft) });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  try {
    const body = await readJson(request) as { branchId?: unknown; reason?: unknown };
    const branchId = typeof body.branchId === "string" ? body.branchId : new URL(request.url).searchParams.get("branchId") ?? "";
    const reason = typeof body.reason === "string" ? body.reason : "discarded";
    const { draftId } = await params;
    const context = await requireOperationsContext("sale:write", { branchId, requireBranch: true });
    const branch = context.branch!;
    const existing = await db.saleDraft.findFirst({
      where: { id: draftId, tenantId: context.tenant.id, branchId: branch.id, status: "HELD" },
    });
    if (!existing) throw new OperationsError("NOT_FOUND", "Held sale not found", 404);

    const draft = await db.saleDraft.update({
      where: { id: existing.id },
      data: { status: "ARCHIVED" },
      include: saleDraftInclude,
    });
    await db.auditLog.create({
      data: {
        userId: context.user.id,
        tenantId: context.tenant.id,
        action: "SALE_DRAFT_ARCHIVED",
        entity: "SaleDraft",
        entityId: draft.id,
        metadata: { branchId: branch.id, reason },
      },
    });
    return Response.json({ data: serializeSaleDraft(draft) });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
