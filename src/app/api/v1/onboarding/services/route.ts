import { z } from "zod";
import { db } from "@/lib/db";
import { platformErrorResponse, PlatformError, requireOnboardingOwner } from "@/lib/platform-auth";
import { assertServiceCapacity } from "@/lib/plan-limits";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(60),
  durationMinutes: z.number().int().min(15).max(480),
  price: z.number().positive(),
  taxRate: z.number().min(0).max(100).default(18),
});

export async function POST(request: Request) {
  try {
    const context = await requireOnboardingOwner();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new PlatformError("VALIDATION", "Invalid service", 400, parsed.error.flatten());
    await assertServiceCapacity(context.tenant.id);
    const service = await db.service.create({ data: { tenantId: context.tenant.id, ...parsed.data } });
    await db.auditLog.create({ data: { userId: context.user.id, tenantId: context.tenant.id, action: "ONBOARDING_SERVICE_CREATED", entity: "Service", entityId: service.id } });
    return Response.json({ data: service }, { status: 201 });
  } catch (error) {
    return platformErrorResponse(error);
  }
}
