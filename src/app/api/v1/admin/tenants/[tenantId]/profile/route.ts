import { z } from "zod";
import { db } from "@/lib/db";
import { platformErrorResponse, PlatformError, requirePlatformAdmin } from "@/lib/platform-auth";

const schema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  legalName: z.string().trim().min(2).max(160).optional(),
  gstin: z.string().trim().max(15).optional(),
  panNumber: z.string().trim().max(10).optional(),
  branch: z.object({
    id: z.string(),
    name: z.string().trim().min(2).max(120).optional(),
    phone: z.string().optional(),
    email: z.email().optional(),
    address: z.string().trim().min(5).max(250).optional(),
    city: z.string().trim().min(2).max(80).optional(),
    state: z.string().trim().min(2).max(80).optional(),
    postalCode: z.string().optional(),
  }).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  try {
    const admin = await requirePlatformAdmin();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new PlatformError("VALIDATION", "Invalid salon profile", 400, parsed.error.flatten());
    const { tenantId } = await params;
    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new PlatformError("NOT_FOUND", "Tenant not found", 404);
    if (parsed.data.branch) {
      const branch = await db.branch.findFirst({ where: { id: parsed.data.branch.id, tenantId } });
      if (!branch) throw new PlatformError("NOT_FOUND", "Branch not found", 404);
    }
    await db.$transaction(async (tx) => {
      const { branch, ...tenantData } = parsed.data;
      await tx.tenant.update({ where: { id: tenantId }, data: tenantData });
      if (branch) {
        const { id, ...branchData } = branch;
        await tx.branch.update({ where: { id }, data: branchData });
      }
      await tx.auditLog.create({ data: { userId: admin.user.id, tenantId, action: "ONBOARDING_EDITED_BY_ADMIN", entity: "Tenant", entityId: tenantId, metadata: parsed.data } });
    });
    return Response.json({ data: { saved: true } });
  } catch (error) {
    return platformErrorResponse(error);
  }
}
