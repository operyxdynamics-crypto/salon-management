import path from "node:path";
import { db } from "@/lib/db";
import { platformErrorResponse, PlatformError, requireOnboardingOwner } from "@/lib/platform-auth";
import { putObject } from "@/lib/storage";

const allowedTypes = new Set(["GST_CERTIFICATE", "PAN_CARD", "ADDRESS_PROOF", "BANK_PROOF", "SALON_MEDIA"]);
const allowedContentTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

// Detect actual file type from the first bytes ("magic numbers"). Client-supplied
// Content-Type is easily forged, so we re-verify before persisting.
function detectMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "application/pdf"; // %PDF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp"; // RIFF....WEBP
  return null;
}

export async function POST(request: Request) {
  try {
    const context = await requireOnboardingOwner();
    const form = await request.formData();
    const file = form.get("file");
    const type = String(form.get("type") ?? "");
    const branchId = String(form.get("branchId") ?? "") || null;
    if (!(file instanceof File) || !allowedTypes.has(type)) throw new PlatformError("VALIDATION", "A valid document and type are required", 400);
    if (!allowedContentTypes.has(file.type) || file.size > 10 * 1024 * 1024) throw new PlatformError("VALIDATION", "Upload a PDF, JPG, PNG, or WebP file up to 10 MB", 400);
    if (branchId) {
      const branch = await db.branch.findFirst({ where: { id: branchId, tenantId: context.tenant.id } });
      if (!branch) throw new PlatformError("NOT_FOUND", "Branch not found", 404);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const detected = detectMime(bytes);
    if (!detected || detected !== file.type) {
      throw new PlatformError("VALIDATION", "File contents do not match the declared type", 400);
    }
    const extension = path.extname(file.name).toLowerCase().replace(/[^a-z0-9.]/g, "") || ".bin";
    const key = `tenants/${context.tenant.id}/${branchId ?? "business"}/${crypto.randomUUID()}${extension}`;
    const stored = await putObject(key, bytes, detected);
    const document = await db.$transaction(async (tx) => {
      await tx.verificationDocument.updateMany({
        where: { tenantId: context.tenant.id, branchId, type: type as never, status: { in: ["PENDING", "REJECTED"] } },
        data: { status: "REJECTED", reviewNote: "Replaced by a newer upload", reviewedAt: new Date() },
      });
      const created = await tx.verificationDocument.create({
        data: {
          tenantId: context.tenant.id,
          branchId,
          type: type as never,
          fileName: file.name,
          storageKey: stored.key,
          contentType: stored.contentType,
          sizeBytes: stored.size,
          isPublic: type === "SALON_MEDIA",
          uploadedById: context.user.id,
        },
      });
      await tx.auditLog.create({ data: { userId: context.user.id, tenantId: context.tenant.id, action: "VERIFICATION_DOCUMENT_UPLOADED", entity: "VerificationDocument", entityId: created.id, metadata: { type, branchId, size: stored.size } } });
      return created;
    });
    return Response.json({ data: document }, { status: 201 });
  } catch (error) {
    return platformErrorResponse(error);
  }
}
