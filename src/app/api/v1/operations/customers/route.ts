import { z } from "zod";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

const schema = z.object({
  branchId: z.string().min(1),
  name: z.string().min(2).max(100),
  phone: z.string().regex(/^\+91[6-9]\d{9}$/),
  email: z.email().optional().or(z.literal("")),
  notes: z.string().max(500).optional(),
});

const querySchema = z.object({
  branchId: z.string().min(1),
  query: z.string().trim().min(2).max(100),
});

export async function GET(request: Request) {
  try {
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new OperationsError("VALIDATION", "Enter at least two characters", 400, parsed.error.flatten());
    const context = await requireOperationsContext("customer:read", { branchId: parsed.data.branchId, requireBranch: true });
    const normalized = parsed.data.query.replace(/\s+/g, "");
    const customers = await db.customer.findMany({
      where: {
        tenantId: context.tenant.id,
        isArchived: false,
        OR: [
          { phone: { contains: normalized } },
          { name: { contains: parsed.data.query, mode: "insensitive" } },
          { email: { contains: parsed.data.query, mode: "insensitive" } },
        ],
      },
      include: {
        appointments: {
          where: { branchId: context.branch!.id },
          orderBy: { startsAt: "desc" },
          take: 1,
        },
        loyaltyLedger: true,
        _count: { select: { appointments: true } },
      },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      take: 12,
    });
    return Response.json({
      data: customers.map((customer) => ({
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        visits: customer._count.appointments,
        lastVisit: customer.appointments[0]?.startsAt.toISOString() ?? null,
        loyalty: customer.loyaltyLedger.reduce((sum, item) => sum + item.points, 0),
        notes: customer.notes,
        allergies: customer.allergies,
      })),
    });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid customer", 400, parsed.error.flatten());
    const context = await requireOperationsContext("customer:write", { branchId: parsed.data.branchId, requireBranch: true });
    const existing = await db.customer.findUnique({ where: { tenantId_phone: { tenantId: context.tenant.id, phone: parsed.data.phone } } });
    const customer = await db.customer.upsert({
      where: { tenantId_phone: { tenantId: context.tenant.id, phone: parsed.data.phone } },
      update: {},
      create: { tenantId: context.tenant.id, name: parsed.data.name, phone: parsed.data.phone, email: parsed.data.email || null, notes: parsed.data.notes },
    });
    await db.auditLog.create({ data: { userId: context.user.id, tenantId: context.tenant.id, action: "CUSTOMER_SAVED", entity: "Customer", entityId: customer.id, metadata: { branchId: context.branch!.id } } });
    return Response.json({ data: { ...customer, existing: Boolean(existing) } }, { status: existing ? 200 : 201 });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
