import { z } from "zod";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

const schema = z.object({
  branchId: z.string().min(1),
  category: z.string().min(2).max(80),
  amount: z.number().positive(),
  note: z.string().max(300).optional(),
  spentAt: z.iso.datetime(),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid expense", 400, parsed.error.flatten());
    const context = await requireOperationsContext("report:read", { branchId: parsed.data.branchId, requireBranch: true });
    const expense = await db.expense.create({
      data: { branchId: context.branch!.id, category: parsed.data.category, amount: parsed.data.amount, note: parsed.data.note, spentAt: new Date(parsed.data.spentAt) },
    });
    return Response.json({ data: expense }, { status: 201 });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
