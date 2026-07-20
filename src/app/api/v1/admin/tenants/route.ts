import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { platformErrorResponse, PlatformError, requirePlatformAdmin, requestIp } from "@/lib/platform-auth";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  legalName: z.string().trim().max(160).optional(),
  ownerName: z.string().trim().min(2).max(100),
  ownerEmail: z.email(),
  city: z.string().trim().min(2).max(80),
  planId: z.string().optional(),
});

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export async function POST(request: Request) {
  try {
    const admin = await requirePlatformAdmin();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new PlatformError("VALIDATION", "Invalid salon details", 400, parsed.error.flatten());
    const existingOwner = await db.user.findUnique({ where: { email: parsed.data.ownerEmail } });
    if (existingOwner) throw new PlatformError("CONFLICT", "An account already exists for this owner email", 409);
    const baseSlug = slugify(parsed.data.name) || "salon";
    const existingSlug = await db.tenant.findUnique({ where: { slug: baseSlug } });
    const slug = existingSlug ? `${baseSlug}-${crypto.randomUUID().slice(0, 6)}` : baseSlug;
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const defaultPlan = parsed.data.planId
      ? await db.subscriptionPlan.findFirst({ where: { id: parsed.data.planId, isActive: true } })
      // No plan chosen: fall back to the cheapest public one rather than a hardcoded code, so
      // renaming or repricing the range never breaks onboarding.
      : await db.subscriptionPlan.findFirst({ where: { isActive: true, isPublic: true }, orderBy: { sortOrder: "asc" } });
    if (!defaultPlan) throw new PlatformError("NOT_FOUND", "Subscription plan not found", 404);
    const result = await db.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: parsed.data.name, legalName: parsed.data.legalName, slug, status: "DRAFT", onboardingStep: 1, subscription: defaultPlan.code },
      });
      const branch = await tx.branch.create({
        data: { tenantId: tenant.id, name: `${tenant.name} - ${parsed.data.city}`, slug: slugify(parsed.data.city) || "main", address: "", city: parsed.data.city, state: "", postalCode: "" },
      });
      await tx.tenantSubscription.create({ data: { tenantId: tenant.id, planId: defaultPlan.id, assignedBy: admin.user.id } });
      const invitation = await tx.ownerInvitation.create({
        data: { tenantId: tenant.id, email: parsed.data.ownerEmail, tokenHash, invitedById: admin.user.id, expiresAt: new Date(Date.now() + 7 * 86_400_000) },
      });
      await tx.adminNote.create({ data: { tenantId: tenant.id, authorId: admin.user.id, note: `Salon created by platform admin. Intended owner: ${parsed.data.ownerName}.` } });
      await tx.auditLog.create({
        data: { userId: admin.user.id, tenantId: tenant.id, action: "TENANT_CREATED_BY_ADMIN", entity: "Tenant", entityId: tenant.id, ipAddress: requestIp(request), metadata: { branchId: branch.id, plan: defaultPlan.code } },
      });
      return { tenant, invitation };
    });
    return Response.json({
      data: {
        tenantId: result.tenant.id,
        invitationId: result.invitation.id,
        invitationUrl: `/onboarding/invitation?token=${token}`,
      },
    }, { status: 201 });
  } catch (error) {
    return platformErrorResponse(error);
  }
}
