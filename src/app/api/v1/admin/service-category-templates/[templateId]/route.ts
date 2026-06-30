import { z } from "zod";
import { db } from "@/lib/db";
import { platformErrorResponse, PlatformError, requirePlatformAdmin } from "@/lib/platform-auth";

const schema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  icon: z.string().trim().max(40).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ templateId: string }> }) {
  try {
    const admin = await requirePlatformAdmin();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new PlatformError("VALIDATION", "Invalid category template", 400, parsed.error.flatten());
    const { templateId } = await params;
    const template = await db.serviceCategoryTemplate.update({ where: { id: templateId }, data: parsed.data });
    await db.auditLog.create({
      data: { userId: admin.user.id, action: "SERVICE_CATEGORY_TEMPLATE_UPDATED", entity: "ServiceCategoryTemplate", entityId: template.id },
    });
    return Response.json({ data: template });
  } catch (error) {
    return platformErrorResponse(error);
  }
}
