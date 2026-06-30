import { db } from "@/lib/db";
import { branchChecklist, checklistComplete } from "@/lib/onboarding";
import { platformErrorResponse, PlatformError, requireOnboardingOwner } from "@/lib/platform-auth";

export async function POST(_: Request, { params }: { params: Promise<{ branchId: string }> }) {
  try {
    const context = await requireOnboardingOwner();
    const { branchId } = await params;
    const branch = await db.branch.findFirst({
      where: { id: branchId, tenantId: context.tenant.id },
      include: { operatingHours: true },
    });
    if (!branch) throw new PlatformError("NOT_FOUND", "Branch not found", 404);
    if (!["DRAFT", "REJECTED"].includes(branch.publicationStatus)) throw new PlatformError("CONFLICT", "Branch cannot be submitted from its current status", 409);
    const [documents, serviceCount, tenant] = await Promise.all([
      db.verificationDocument.findMany({ where: { tenantId: context.tenant.id, OR: [{ branchId: null }, { branchId }] } }),
      db.service.count({ where: { tenantId: context.tenant.id, isActive: true } }),
      db.tenant.findUnique({ where: { id: context.tenant.id } }),
    ]);
    if (!tenant) throw new PlatformError("NOT_FOUND", "Salon not found", 404);
    const checklist = branchChecklist({ tenant, branch, documents, serviceCount, operatingHourCount: branch.operatingHours.length });
    if (!checklistComplete(checklist)) throw new PlatformError("INCOMPLETE_ONBOARDING", "Complete every onboarding requirement before submission", 409, checklist);
    await db.$transaction(async (tx) => {
      await tx.branch.update({ where: { id: branch.id }, data: { publicationStatus: "PENDING_REVIEW", submittedAt: new Date(), isPublished: false } });
      await tx.tenant.update({ where: { id: context.tenant.id }, data: { status: "PENDING_REVIEW", onboardingStep: 4 } });
      await tx.branchPublicationHistory.create({ data: { branchId, fromStatus: branch.publicationStatus, toStatus: "PENDING_REVIEW", actorId: context.user.id } });
      await tx.auditLog.create({ data: { userId: context.user.id, tenantId: context.tenant.id, action: "BRANCH_SUBMITTED", entity: "Branch", entityId: branchId, metadata: checklist } });
    });
    return Response.json({ data: { status: "PENDING_REVIEW" } });
  } catch (error) {
    return platformErrorResponse(error);
  }
}
