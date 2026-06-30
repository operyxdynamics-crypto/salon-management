import { z } from "zod";
import { db } from "@/lib/db";
import { platformErrorResponse, PlatformError, requirePlatformAdmin } from "@/lib/platform-auth";

const schema = z.object({ note: z.string().trim().min(2).max(2000) });

export async function POST(request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  try {
    const admin = await requirePlatformAdmin();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new PlatformError("VALIDATION", "Invalid support note", 400, parsed.error.flatten());
    const { tenantId } = await params;
    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new PlatformError("NOT_FOUND", "Tenant not found", 404);
    const note = await db.$transaction(async (tx) => {
      const created = await tx.adminNote.create({ data: { tenantId, authorId: admin.user.id, note: parsed.data.note } });
      await tx.auditLog.create({ data: { userId: admin.user.id, tenantId, action: "ADMIN_NOTE_ADDED", entity: "Tenant", entityId: tenantId } });
      return created;
    });
    return Response.json({ data: note }, { status: 201 });
  } catch (error) {
    return platformErrorResponse(error);
  }
}
