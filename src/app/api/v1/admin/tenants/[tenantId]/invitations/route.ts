import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { platformErrorResponse, PlatformError, requirePlatformAdmin } from "@/lib/platform-auth";

const schema = z.object({ email: z.email() });

export async function POST(request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  try {
    const admin = await requirePlatformAdmin();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new PlatformError("VALIDATION", "A valid owner email is required", 400, parsed.error.flatten());
    const { tenantId } = await params;
    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new PlatformError("NOT_FOUND", "Tenant not found", 404);
    const existingUser = await db.user.findUnique({ where: { email: parsed.data.email } });
    if (existingUser) throw new PlatformError("CONFLICT", "An account already exists for this email", 409);
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const invitation = await db.$transaction(async (tx) => {
      await tx.ownerInvitation.updateMany({ where: { tenantId, status: "PENDING" }, data: { status: "REVOKED" } });
      const created = await tx.ownerInvitation.create({ data: { tenantId, email: parsed.data.email, tokenHash, invitedById: admin.user.id, expiresAt: new Date(Date.now() + 7 * 86_400_000) } });
      await tx.auditLog.create({ data: { userId: admin.user.id, tenantId, action: "OWNER_INVITATION_SENT", entity: "OwnerInvitation", entityId: created.id, metadata: { email: parsed.data.email } } });
      return created;
    });
    return Response.json({ data: { id: invitation.id, invitationUrl: `/onboarding/invitation?token=${token}`, expiresAt: invitation.expiresAt } }, { status: 201 });
  } catch (error) {
    return platformErrorResponse(error);
  }
}
