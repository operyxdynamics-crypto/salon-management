import { z } from "zod";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

const schema = z.object({
  branchId: z.string().min(1),
  salonReply: z.string().trim().min(2).max(1000).optional(),
  reportReason: z.string().trim().min(3).max(500).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success || (!parsed.data.salonReply && !parsed.data.reportReason)) throw new OperationsError("VALIDATION", "A reply or report reason is required", 400, parsed.success ? undefined : parsed.error.flatten());
    const context = await requireOperationsContext("branch:manage", { branchId: parsed.data.branchId, requireBranch: true });
    const { reviewId } = await params;
    const review = await db.review.findFirst({ where: { id: reviewId, branchId: context.branch!.id } });
    if (!review) throw new OperationsError("NOT_FOUND", "Review not found", 404);
    const updated = await db.$transaction(async (tx) => {
      const result = await tx.review.update({
        where: { id: review.id },
        data: { salonReply: parsed.data.salonReply, reportReason: parsed.data.reportReason, status: parsed.data.reportReason ? "REPORTED" : undefined },
      });
      await tx.auditLog.create({ data: { userId: context.user.id, tenantId: context.tenant.id, action: parsed.data.reportReason ? "REVIEW_REPORTED" : "REVIEW_REPLIED", entity: "Review", entityId: review.id } });
      return result;
    });
    return Response.json({ data: updated });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
