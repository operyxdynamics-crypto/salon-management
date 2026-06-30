import { z } from "zod";
import { db } from "@/lib/db";
import { platformErrorResponse, PlatformError, requirePlatformAdmin } from "@/lib/platform-auth";

const schema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().max(1000).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const admin = await requirePlatformAdmin();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new PlatformError("VALIDATION", "Invalid document decision", 400, parsed.error.flatten());
    const { documentId } = await params;
    const document = await db.verificationDocument.findUnique({ where: { id: documentId } });
    if (!document) throw new PlatformError("NOT_FOUND", "Document not found", 404);
    const updated = await db.$transaction(async (tx) => {
      const result = await tx.verificationDocument.update({
        where: { id: documentId },
        data: { status: parsed.data.status, reviewNote: parsed.data.note, reviewedAt: new Date(), reviewedById: admin.user.id },
      });
      await tx.auditLog.create({ data: { userId: admin.user.id, tenantId: document.tenantId, action: `DOCUMENT_${parsed.data.status}`, entity: "VerificationDocument", entityId: documentId, metadata: { note: parsed.data.note ?? null, type: document.type } } });
      return result;
    });
    return Response.json({ data: updated });
  } catch (error) {
    return platformErrorResponse(error);
  }
}
