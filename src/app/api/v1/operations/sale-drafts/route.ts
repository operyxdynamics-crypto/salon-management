import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";
import { calculateSaleDraftTotal, saleDraftInclude, saleDraftPayloadSchema, saleDraftTitle, serializeSaleDraft } from "@/lib/sale-drafts";

export async function GET(request: Request) {
  try {
    const branchId = new URL(request.url).searchParams.get("branchId") ?? "";
    const context = await requireOperationsContext("sale:write", { branchId, requireBranch: true });
    const drafts = await db.saleDraft.findMany({
      where: { tenantId: context.tenant.id, branchId: context.branch!.id, status: "HELD" },
      include: saleDraftInclude,
      orderBy: { updatedAt: "desc" },
      take: 25,
    });
    return Response.json({ data: drafts.map(serializeSaleDraft) });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = saleDraftPayloadSchema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid held sale", 400, parsed.error.flatten());
    const context = await requireOperationsContext("sale:write", { branchId: parsed.data.branchId, requireBranch: true });
    const branch = context.branch!;
    const payload = parsed.data;

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
    const draft = await db.saleDraft.create({
      data: {
        tenantId: context.tenant.id,
        branchId: branch.id,
        customerId,
        appointmentId: appointment?.id,
        createdById: context.user.id,
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
        action: "SALE_DRAFT_HELD",
        entity: "SaleDraft",
        entityId: draft.id,
        metadata: { branchId: branch.id, total, lineCount: payload.cart.length },
      },
    });
    return Response.json({ data: serializeSaleDraft(draft) }, { status: 201 });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
