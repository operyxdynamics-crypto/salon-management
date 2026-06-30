import { z } from "zod";
import { db } from "@/lib/db";
import { branchChecklist } from "@/lib/onboarding";
import { platformErrorResponse, PlatformError, requireOnboardingOwner, requestIp } from "@/lib/platform-auth";

const optionalText = (minimum: number, maximum: number, message: string) => z.string().trim()
  .refine((value) => value.length === 0 || value.length >= minimum, message)
  .refine((value) => value.length <= maximum, `Must be ${maximum} characters or fewer`);
const optionalPattern = (pattern: RegExp, message: string) => z.string().trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => value.length === 0 || pattern.test(value), message);
const indiaPhone = z.string().trim()
  .transform((value) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length === 10) return `+91${digits}`;
    if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
    return value;
  })
  .refine((value) => value.length === 0 || /^\+91[6-9]\d{9}$/.test(value), "Enter a valid 10-digit India mobile number");

const profileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  legalName: optionalText(2, 160, "Enter the legal business name"),
  gstin: optionalPattern(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/, "GSTIN must use the 15-character Indian GST format"),
  panNumber: optionalPattern(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "PAN must use the format ABCDE1234F"),
  branch: z.object({
    id: z.string().min(1),
    name: z.string().trim().min(2).max(120),
    phone: indiaPhone,
    email: z.union([z.email("Enter a valid branch email"), z.literal("")]),
    address: optionalText(5, 250, "Enter a complete branch address"),
    city: z.string().trim().min(2).max(80),
    state: optionalText(2, 80, "Enter the state"),
    postalCode: z.string().trim().refine((value) => value.length === 0 || /^[1-9][0-9]{5}$/.test(value), "PIN code must contain 6 digits"),
    profileDescription: optionalText(20, 800, "Marketplace description must contain at least 20 characters"),
    cancellationHours: z.number().int().min(0).max(168),
  }),
  operatingHours: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    opensAt: z.string().regex(/^\d{2}:\d{2}$/),
    closesAt: z.string().regex(/^\d{2}:\d{2}$/),
    isClosed: z.boolean(),
  })).length(7),
});

export async function GET() {
  try {
    const context = await requireOnboardingOwner();
    const tenant = await db.tenant.findUnique({
      where: { id: context.tenant.id },
      include: {
        branches: { include: { operatingHours: { orderBy: { dayOfWeek: "asc" } }, verificationDocuments: true, reviewsHistory: { orderBy: { createdAt: "desc" }, take: 5 } } },
        services: { orderBy: { name: "asc" } },
        verificationDocuments: { orderBy: { createdAt: "desc" } },
        subscriptionRecord: { include: { plan: true } },
      },
    });
    if (!tenant) throw new PlatformError("NOT_FOUND", "Salon not found", 404);
    const branches = tenant.branches.map((branch) => ({
      ...branch,
      checklist: branchChecklist({
        tenant,
        branch,
        documents: tenant.verificationDocuments.filter((document) => !document.branchId || document.branchId === branch.id),
        serviceCount: tenant.services.length,
        operatingHourCount: branch.operatingHours.length,
      }),
    }));
    return Response.json({ data: { ...tenant, branches } });
  } catch (error) {
    return platformErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireOnboardingOwner();
    const parsed = profileSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new PlatformError("VALIDATION", "Please correct the highlighted onboarding details", 400, {
        fields: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
      });
    }
    const branch = await db.branch.findFirst({ where: { id: parsed.data.branch.id, tenantId: context.tenant.id } });
    if (!branch) throw new PlatformError("NOT_FOUND", "Branch not found", 404);
    if (!["DRAFT", "REJECTED"].includes(branch.publicationStatus)) {
      throw new PlatformError("CONFLICT", "Only draft or rejected branches can be edited", 409);
    }
    await db.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: context.tenant.id },
        data: {
          name: parsed.data.name,
          legalName: parsed.data.legalName || null,
          gstin: parsed.data.gstin || null,
          panNumber: parsed.data.panNumber || null,
          onboardingStep: 3,
          policies: { cancellationHours: parsed.data.branch.cancellationHours },
        },
      });
      await tx.branch.update({
        where: { id: branch.id },
        data: {
          name: parsed.data.branch.name,
          phone: parsed.data.branch.phone || null,
          email: parsed.data.branch.email || null,
          address: parsed.data.branch.address,
          city: parsed.data.branch.city,
          state: parsed.data.branch.state,
          postalCode: parsed.data.branch.postalCode,
          profileDescription: parsed.data.branch.profileDescription,
          policies: { cancellationHours: parsed.data.branch.cancellationHours },
          publicationStatus: "DRAFT",
          isPublished: false,
        },
      });
      for (const hours of parsed.data.operatingHours) {
        await tx.operatingHour.upsert({
          where: { branchId_dayOfWeek: { branchId: branch.id, dayOfWeek: hours.dayOfWeek } },
          update: hours,
          create: { branchId: branch.id, ...hours },
        });
      }
      await tx.auditLog.create({
        data: {
          userId: context.user.id,
          tenantId: context.tenant.id,
          action: "ONBOARDING_PROFILE_UPDATED",
          entity: "Branch",
          entityId: branch.id,
          ipAddress: requestIp(request),
        },
      });
    });
    return Response.json({ data: { saved: true } });
  } catch (error) {
    return platformErrorResponse(error);
  }
}
