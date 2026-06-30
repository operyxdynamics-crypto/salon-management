import { z } from "zod";
import { db } from "@/lib/db";
import { platformErrorResponse, PlatformError, requirePlatformAdmin } from "@/lib/platform-auth";

const schema = z.object({
  status: z.enum(["ACTIVE", "DRAFT", "SUSPENDED", "ARCHIVED"]),
  note: z.string().trim().max(500).optional(),
  ownerAccess: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  try {
    const admin = await requirePlatformAdmin();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new PlatformError("VALIDATION", "Invalid tenant control", 400, parsed.error.flatten());
    const { tenantId } = await params;
    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new PlatformError("NOT_FOUND", "Tenant not found", 404);
    const updated = await db.$transaction(async (tx) => {
      const result = await tx.tenant.update({ where: { id: tenantId }, data: { status: parsed.data.status } });
      if (parsed.data.status === "SUSPENDED" || parsed.data.status === "ARCHIVED") {
        const affectedBranches = await tx.branch.findMany({ where: { tenantId, publicationStatus: "APPROVED" }, select: { id: true, publicationStatus: true } });
        await tx.branch.updateMany({
          where: { tenantId, publicationStatus: "APPROVED" },
          data: { isPublished: false, publicationStatus: parsed.data.status === "SUSPENDED" ? "SUSPENDED" : "ARCHIVED" },
        });
        if (affectedBranches.length) {
          await tx.branchPublicationHistory.createMany({
            data: affectedBranches.map((branch) => ({
              branchId: branch.id,
              fromStatus: branch.publicationStatus,
              toStatus: parsed.data.status === "SUSPENDED" ? "SUSPENDED" : "ARCHIVED",
              actorId: admin.user.id,
              note: parsed.data.note,
            })),
          });
        }
      }
      if (parsed.data.ownerAccess !== undefined) {
        await tx.user.updateMany({ where: { tenantId, role: "OWNER" }, data: { isActive: parsed.data.ownerAccess } });
      }
      await tx.auditLog.create({
        data: {
          userId: admin.user.id,
          tenantId,
          action: "TENANT_ACCESS_CHANGED",
          entity: "Tenant",
          entityId: tenantId,
          metadata: { fromStatus: tenant.status, status: parsed.data.status, ownerAccess: parsed.data.ownerAccess, note: parsed.data.note ?? null },
        },
      });
      return result;
    });
    return Response.json({ data: updated });
  } catch (error) {
    return platformErrorResponse(error);
  }
}
