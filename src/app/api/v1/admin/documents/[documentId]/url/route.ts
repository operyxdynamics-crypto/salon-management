import { db } from "@/lib/db";
import { platformErrorResponse, PlatformError, requirePlatformAdmin } from "@/lib/platform-auth";
import { signedObjectUrl } from "@/lib/storage";

export async function GET(_: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const admin = await requirePlatformAdmin();
    const { documentId } = await params;
    const document = await db.verificationDocument.findUnique({ where: { id: documentId } });
    if (!document) throw new PlatformError("NOT_FOUND", "Document not found", 404);
    await db.auditLog.create({
      data: { userId: admin.user.id, tenantId: document.tenantId, action: "VERIFICATION_DOCUMENT_ACCESSED", entity: "VerificationDocument", entityId: document.id },
    });
    return Response.json({ data: { url: await signedObjectUrl(document.id, document.storageKey), expiresInSeconds: 300 } });
  } catch (error) {
    return platformErrorResponse(error);
  }
}
