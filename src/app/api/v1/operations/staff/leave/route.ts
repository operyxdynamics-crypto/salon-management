import { z } from "zod";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

const schema = z.object({
  branchId: z.string().min(1),
  staffId: z.string().min(1),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  reason: z.string().max(300).optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid leave", 400, parsed.error.flatten());
    const context = await requireOperationsContext("branch:manage", { branchId: parsed.data.branchId, requireBranch: true });
    const branch = context.branch!;
    const staff = await db.staff.findFirst({ where: { id: parsed.data.staffId, OR: [{ branchId: branch.id }, { branchAssignments: { some: { branchId: branch.id } } }] } });
    if (!staff) throw new OperationsError("NOT_FOUND", "Staff member not found", 404);
    const leave = await db.staffLeave.create({ data: { staffId: staff.id, startsAt: new Date(parsed.data.startsAt), endsAt: new Date(parsed.data.endsAt), reason: parsed.data.reason } });
    return Response.json({ data: leave }, { status: 201 });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
