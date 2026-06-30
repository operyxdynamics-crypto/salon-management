import { z } from "zod";
import { db } from "@/lib/db";
import { platformErrorResponse, PlatformError, requirePlatformAdmin } from "@/lib/platform-auth";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().trim().max(40).optional(),
  sortOrder: z.number().int().min(0).default(0),
});

export async function GET() {
  try {
    await requirePlatformAdmin();
    return Response.json({ data: await db.serviceCategoryTemplate.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }) });
  } catch (error) {
    return platformErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requirePlatformAdmin();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new PlatformError("VALIDATION", "Invalid category template", 400, parsed.error.flatten());
    const template = await db.serviceCategoryTemplate.create({ data: parsed.data });
    await db.auditLog.create({
      data: { userId: admin.user.id, action: "SERVICE_CATEGORY_TEMPLATE_CREATED", entity: "ServiceCategoryTemplate", entityId: template.id },
    });
    return Response.json({ data: template }, { status: 201 });
  } catch (error) {
    return platformErrorResponse(error);
  }
}
