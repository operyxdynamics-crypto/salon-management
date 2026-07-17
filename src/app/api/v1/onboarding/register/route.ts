import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSessionToken, sessionCookie } from "@/lib/session";
import { cookies } from "next/headers";
import { platformErrorResponse, PlatformError, requestIp } from "@/lib/platform-auth";

const schema = z.object({
  businessName: z.string().trim().min(2).max(120),
  ownerName: z.string().trim().min(2).max(100),
  email: z.email(),
  phone: z.string().regex(/^\+91[6-9]\d{9}$/),
  password: z.string().min(8).max(100),
  city: z.string().trim().min(2).max(80),
});

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new PlatformError("VALIDATION", "Invalid registration details", 400, parsed.error.flatten());
    const exists = await db.user.findFirst({ where: { OR: [{ email: parsed.data.email }, { phone: parsed.data.phone }] } });
    if (exists) throw new PlatformError("CONFLICT", "An account already exists for this email or phone", 409);
    const baseSlug = slugify(parsed.data.businessName) || "salon";
    const slugExists = await db.tenant.findUnique({ where: { slug: baseSlug } });
    const slug = slugExists ? `${baseSlug}-${crypto.randomUUID().slice(0, 6)}` : baseSlug;
    const starterPlan = await db.subscriptionPlan.findFirst({ where: { code: "starter", isActive: true } });
    if (!starterPlan) throw new PlatformError("NOT_FOUND", "Starter subscription plan is not configured", 503);
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const result = await db.$transaction(async (tx) => {
      // SaaS-first: the tenant is ACTIVE immediately so the owner can use the workspace
      // without waiting for marketplace approval. The branch is created with sensible
      // default operating hours so slot calculation works out of the box.
      const tenant = await tx.tenant.create({
        data: { name: parsed.data.businessName, slug, status: "ACTIVE", onboardingStep: 1, subscription: "starter" },
      });
      const owner = await tx.user.create({
        data: {
          tenantId: tenant.id,
          name: parsed.data.ownerName,
          email: parsed.data.email,
          phone: parsed.data.phone,
          passwordHash,
          role: "OWNER",
        },
      });
      await tx.tenantSubscription.create({ data: { tenantId: tenant.id, planId: starterPlan.id, assignedBy: "SELF_REGISTRATION" } });
      const branch = await tx.branch.create({
        data: {
          tenantId: tenant.id,
          name: `${parsed.data.businessName} - ${parsed.data.city}`,
          slug: slugify(parsed.data.city) || "main",
          address: "",
          city: parsed.data.city,
          state: "",
          postalCode: "",
          publicationStatus: "DRAFT", // not on the marketplace until they apply + admin approves
        },
      });
      // Default operating hours: Mon-Sat 09:00-21:00, Sun closed. Owner can edit later.
      await tx.operatingHour.createMany({
        data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
          branchId: branch.id,
          dayOfWeek,
          opensAt: dayOfWeek === 0 ? "00:00" : "09:00",
          closesAt: dayOfWeek === 0 ? "00:00" : "21:00",
          isClosed: dayOfWeek === 0,
        })),
      });
      await tx.auditLog.create({
        data: {
          userId: owner.id,
          tenantId: tenant.id,
          action: "SALON_SELF_REGISTERED",
          entity: "Tenant",
          entityId: tenant.id,
          ipAddress: requestIp(request),
        },
      });
      return { tenant, owner };
    });
    const token = await createSessionToken({
      userId: result.owner.id,
      tenantId: result.tenant.id,
      role: "OWNER",
      name: result.owner.name,
    });
    (await cookies()).set(sessionCookie.name, token, sessionCookie.options);
    return Response.json({ data: { tenantId: result.tenant.id, redirectTo: "/workspace/home" } }, { status: 201 });
  } catch (error) {
    return platformErrorResponse(error);
  }
}
