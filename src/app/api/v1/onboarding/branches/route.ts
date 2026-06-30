import { z } from "zod";
import { db } from "@/lib/db";
import { requireTenantPlan } from "@/lib/plan-limits";
import { platformErrorResponse, PlatformError, requireOnboardingOwner } from "@/lib/platform-auth";

const schema = z.object({ name: z.string().trim().min(2).max(120), city: z.string().trim().min(2).max(80) });
function slugify(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60); }

export async function POST(request: Request) {
  try {
    const context = await requireOnboardingOwner();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new PlatformError("VALIDATION", "Invalid branch", 400, parsed.error.flatten());
    const [plan, used] = await Promise.all([requireTenantPlan(context.tenant.id), db.branch.count({ where: { tenantId: context.tenant.id, publicationStatus: { not: "ARCHIVED" } } })]);
    if (used >= plan.maxBranches) throw new PlatformError("LIMIT_EXCEEDED", "Branch limit reached for the assigned plan", 409, { used, limit: plan.maxBranches });
    const baseSlug = slugify(parsed.data.city) || "branch";
    const exists = await db.branch.findUnique({ where: { tenantId_slug: { tenantId: context.tenant.id, slug: baseSlug } } });
    const branch = await db.branch.create({
      data: { tenantId: context.tenant.id, name: parsed.data.name, city: parsed.data.city, slug: exists ? `${baseSlug}-${crypto.randomUUID().slice(0, 5)}` : baseSlug, address: "", state: "", postalCode: "" },
    });
    await db.auditLog.create({ data: { userId: context.user.id, tenantId: context.tenant.id, action: "ONBOARDING_BRANCH_CREATED", entity: "Branch", entityId: branch.id } });
    return Response.json({ data: branch }, { status: 201 });
  } catch (error) {
    return platformErrorResponse(error);
  }
}
