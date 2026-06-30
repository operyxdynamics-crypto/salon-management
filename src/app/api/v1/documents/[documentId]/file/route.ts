import { db } from "@/lib/db";
import { readSession } from "@/lib/session";
import { getLocalObject, signedObjectUrl, storageProvider, verifyLocalSignature } from "@/lib/storage";
import { platformErrorResponse, PlatformError } from "@/lib/platform-auth";

export async function GET(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const { documentId } = await params;
    const document = await db.verificationDocument.findUnique({ where: { id: documentId } });
    if (!document) throw new PlatformError("NOT_FOUND", "Document not found", 404);
    const url = new URL(request.url);
    const signed = verifyLocalSignature(documentId, url.searchParams.get("expires"), url.searchParams.get("signature"));
    const session = await readSession();
    const authorized = document.isPublic && document.status === "APPROVED"
      || session?.role === "PLATFORM_ADMIN"
      || Boolean(session?.tenantId && session.tenantId === document.tenantId)
      || signed;
    if (!authorized) throw new PlatformError("FORBIDDEN", "Document access denied", 403);
    if (session) {
      await db.auditLog.create({
        data: { userId: session.userId, tenantId: document.tenantId, action: "VERIFICATION_DOCUMENT_ACCESSED", entity: "VerificationDocument", entityId: document.id },
      });
    }
    if (storageProvider() === "s3") return Response.redirect(await signedObjectUrl(document.id, document.storageKey));
    const bytes = await getLocalObject(document.storageKey);
    // Strip CR/LF and other control chars, then quotes, to make this safe inside a
    // quoted-string header value (prevents response-splitting via crafted filenames).
    const safeName = document.fileName.replace(/[\x00-\x1f\x7f"\\]/g, "_").slice(0, 200) || "document";
    return new Response(bytes, {
      headers: {
        "content-type": document.contentType,
        "content-disposition": document.isPublic ? "inline" : `attachment; filename="${safeName}"`,
        "cache-control": document.isPublic ? "public, max-age=3600" : "private, no-store",
      },
    });
  } catch (error) {
    return platformErrorResponse(error);
  }
}
