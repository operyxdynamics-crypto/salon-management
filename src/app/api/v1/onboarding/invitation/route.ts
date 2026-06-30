import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { platformErrorResponse, PlatformError } from "@/lib/platform-auth";
import { createSessionToken, sessionCookie } from "@/lib/session";

const schema = z.object({
  token: z.string().min(32),
  name: z.string().trim().min(2).max(100),
  phone: z.string().regex(/^\+91[6-9]\d{9}$/),
  password: z.string().min(8).max(100),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new PlatformError("VALIDATION", "Invalid invitation acceptance", 400, parsed.error.flatten());
    const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
    const invitation = await db.ownerInvitation.findUnique({ where: { tokenHash }, include: { tenant: true } });
    if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt < new Date()) throw new PlatformError("CONFLICT", "Invitation is invalid or expired", 409);
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const owner = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { tenantId: invitation.tenantId, email: invitation.email, phone: parsed.data.phone, name: parsed.data.name, passwordHash, role: "OWNER" },
      });
      await tx.ownerInvitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
      await tx.auditLog.create({ data: { userId: user.id, tenantId: invitation.tenantId, action: "OWNER_INVITATION_ACCEPTED", entity: "OwnerInvitation", entityId: invitation.id } });
      return user;
    });
    const token = await createSessionToken({ userId: owner.id, tenantId: invitation.tenantId, role: "OWNER", name: owner.name });
    (await cookies()).set(sessionCookie.name, token, sessionCookie.options);
    return Response.json({ data: { redirectTo: "/onboarding" } });
  } catch (error) {
    return platformErrorResponse(error);
  }
}
