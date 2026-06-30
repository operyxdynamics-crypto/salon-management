import { z } from "zod";
import { db } from "@/lib/db";
import { branchChecklist, branchTransitions, checklistComplete } from "@/lib/onboarding";
import { platformErrorResponse, PlatformError, requirePlatformAdmin, requestIp } from "@/lib/platform-auth";

const schema = z.object({
  status: z.enum(["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "SUSPENDED", "ARCHIVED"]),
  note: z.string().trim().max(1000).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ branchId: string }> }) {
  try {
    const admin = await requirePlatformAdmin();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new PlatformError("VALIDATION", "Invalid branch decision", 400, parsed.error.flatten());
    const { branchId } = await params;
    const branch = await db.branch.findUnique({
      where: { id: branchId },
      include: { tenant: true, operatingHours: true },
    });
    if (!branch) throw new PlatformError("NOT_FOUND", "Branch not found", 404);
    if (!branchTransitions[branch.publicationStatus]?.includes(parsed.data.status)) {
      throw new PlatformError("CONFLICT", `Cannot move branch from ${branch.publicationStatus} to ${parsed.data.status}`, 409);
    }
    const [documents, serviceCount] = await Promise.all([
      db.verificationDocument.findMany({ where: { tenantId: branch.tenantId, OR: [{ branchId: null }, { branchId }] } }),
      db.service.count({ where: { tenantId: branch.tenantId, isActive: true } }),
    ]);
    const checklist = branchChecklist({ tenant: branch.tenant, branch, documents, serviceCount, operatingHourCount: branch.operatingHours.length });
    if (parsed.data.status === "APPROVED" && !checklistComplete(checklist)) {
      throw new PlatformError("INCOMPLETE_ONBOARDING", "Branch cannot be approved until the checklist is complete", 409, checklist);
    }
    const now = new Date();
    await db.$transaction(async (tx) => {
      await tx.branch.update({
        where: { id: branch.id },
        data: {
          publicationStatus: parsed.data.status,
          isPublished: parsed.data.status === "APPROVED",
          approvedAt: parsed.data.status === "APPROVED" ? now : branch.approvedAt,
          rejectedAt: parsed.data.status === "REJECTED" ? now : null,
          suspendedAt: parsed.data.status === "SUSPENDED" ? now : null,
        },
      });
      await tx.branchReview.create({
        data: { branchId, reviewerId: admin.user.id, fromStatus: branch.publicationStatus, toStatus: parsed.data.status, checklist, note: parsed.data.note },
      });
      await tx.branchPublicationHistory.create({
        data: { branchId, fromStatus: branch.publicationStatus, toStatus: parsed.data.status, actorId: admin.user.id, note: parsed.data.note },
      });
      if (parsed.data.status === "APPROVED") await tx.tenant.update({ where: { id: branch.tenantId }, data: { status: "ACTIVE" } });
      await tx.auditLog.create({
        data: { userId: admin.user.id, tenantId: branch.tenantId, action: `BRANCH_${parsed.data.status}`, entity: "Branch", entityId: branchId, ipAddress: requestIp(request), metadata: { note: parsed.data.note ?? null, checklist } },
      });
    });
    return Response.json({ data: { id: branchId, status: parsed.data.status, isPublished: parsed.data.status === "APPROVED", checklist } });
  } catch (error) {
    return platformErrorResponse(error);
  }
}
