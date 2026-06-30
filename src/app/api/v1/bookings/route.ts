import { bookingSchema } from "@/lib/validation";
import { db } from "@/lib/db";
import { createAppointment } from "@/lib/availability";
import { operationsErrorResponse, OperationsError } from "@/lib/operations-auth";
import { readSession } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const session = await readSession();
    if (!session || session.role !== "CUSTOMER") throw new OperationsError("UNAUTHENTICATED", "Verify your phone number before booking", 401);
    const parsed = bookingSchema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid booking", 400, parsed.error.flatten());
    // Accept bookings from any active tenant's non-archived branch. Marketplace approval
    // (isPublished + publicationStatus="APPROVED") only controls visibility in the marketplace
    // search; it does not gate the salon's own shared booking link.
    const branch = await db.branch.findFirst({
      where: {
        id: parsed.data.branchId,
        tenantId: parsed.data.salonId,
        publicationStatus: { not: "ARCHIVED" },
        tenant: { status: "ACTIVE" },
      },
      select: { id: true, tenantId: true },
    });
    if (!branch) throw new OperationsError("NOT_FOUND", "This branch is not accepting online bookings", 404);
    const user = await db.user.findFirst({ where: { id: session.userId, phone: parsed.data.customer.phone, role: "CUSTOMER", isActive: true } });
    if (!user) throw new OperationsError("FORBIDDEN", "Book with the verified phone number", 403);
    const customer = await db.customer.upsert({
      where: { tenantId_phone: { tenantId: branch.tenantId, phone: parsed.data.customer.phone } },
      update: { userId: user.id, name: parsed.data.customer.name, email: parsed.data.customer.email },
      create: {
        tenantId: branch.tenantId,
        userId: user.id,
        name: parsed.data.customer.name,
        phone: parsed.data.customer.phone,
        email: parsed.data.customer.email,
      },
    });
    const appointment = await createAppointment({
      tenantId: branch.tenantId,
      branchId: branch.id,
      customerId: customer.id,
      serviceId: parsed.data.serviceId,
      staffId: parsed.data.staffId,
      startsAt: new Date(parsed.data.startsAt),
      source: parsed.data.source,
      idempotencyKey: parsed.data.idempotencyKey,
      actorId: user.id,
    });
    return Response.json({ data: appointment }, { status: 201 });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
