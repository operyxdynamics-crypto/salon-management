import { z } from "zod";
import { db } from "@/lib/db";
import { platformErrorResponse, PlatformError, requirePlatformAdmin } from "@/lib/platform-auth";

/**
 * Sales enquiries.
 *
 * A prospect is not a tenant: they have no salon, no login and no subscription. Recording them as
 * one would fill the database with half-real salons and quietly ruin every count that matters -
 * active salons, MRR, conversion. So a lead lives on its own until it converts.
 */

const createSchema = z.object({
  salonName: z.string().trim().min(2).max(120),
  contactName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(20),
  email: z.string().email().optional().or(z.literal("")),
  city: z.string().trim().max(80).optional(),
  branchCount: z.number().int().min(1).max(500).default(1),
  staffCount: z.number().int().min(0).max(5000).default(0),
  source: z.string().trim().max(60).optional(),
  interestedPlanId: z.string().optional(),
  notes: z.string().trim().max(2000).optional(),
  followUpAt: z.iso.datetime().optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["NEW", "CONTACTED", "DEMO_BOOKED", "QUOTED", "WON", "LOST"]).optional(),
  followUpAt: z.iso.datetime().nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
  interestedPlanId: z.string().nullable().optional(),
});

export async function GET() {
  try {
    await requirePlatformAdmin();
    const leads = await db.lead.findMany({
      // Open leads first, then by when they need chasing. A lead with no follow-up date sorts last,
      // which is exactly where an un-actioned lead deserves to be until someone gives it a date.
      where: { convertedTenantId: null },
      include: { interestedPlan: { select: { name: true } }, owner: { select: { name: true } } },
      orderBy: [{ followUpAt: "asc" }, { createdAt: "desc" }],
      take: 200,
    });
    return Response.json({ data: { leads } });
  } catch (error) {
    return platformErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requirePlatformAdmin();
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) throw new PlatformError("VALIDATION", "Invalid enquiry", 400, parsed.error.flatten());

    const lead = await db.lead.create({
      data: {
        ...parsed.data,
        email: parsed.data.email || null,
        followUpAt: parsed.data.followUpAt ? new Date(parsed.data.followUpAt) : null,
        ownerUserId: admin.user.id,
      },
    });
    return Response.json({ data: lead }, { status: 201 });
  } catch (error) {
    return platformErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requirePlatformAdmin();
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) throw new PlatformError("VALIDATION", "Invalid enquiry update", 400, parsed.error.flatten());
    const { id, ...changes } = parsed.data;

    const lead = await db.lead.update({
      where: { id },
      data: {
        ...changes,
        ...(changes.followUpAt !== undefined ? { followUpAt: changes.followUpAt ? new Date(changes.followUpAt) : null } : {}),
      },
    });
    return Response.json({ data: lead });
  } catch (error) {
    return platformErrorResponse(error);
  }
}
