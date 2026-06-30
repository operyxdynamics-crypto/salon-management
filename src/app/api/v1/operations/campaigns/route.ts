import { z } from "zod";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

const schema = z.object({
  branchId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  channel: z.enum(["WHATSAPP", "SMS", "EMAIL"]),
  segment: z.enum(["ALL", "BIRTHDAY", "INACTIVE", "LOYAL"]),
  template: z.string().trim().min(5).max(3000),
  scheduledAt: z.iso.datetime().optional(),
  idempotencyKey: z.string().min(12).max(120),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid campaign", 400, parsed.error.flatten());
    const context = await requireOperationsContext("campaign:write", { branchId: parsed.data.branchId, requireBranch: true });
    const customers = await db.customer.findMany({
      where: {
        tenantId: context.tenant.id,
        isArchived: false,
        whatsappConsent: parsed.data.channel === "WHATSAPP" ? true : undefined,
        smsConsent: parsed.data.channel === "SMS" ? true : undefined,
        emailConsent: parsed.data.channel === "EMAIL" ? true : undefined,
      },
      take: 5000,
    });
    const campaign = await db.$transaction(async (tx) => {
      const created = await tx.campaign.create({
        data: {
          tenantId: context.tenant.id,
          name: parsed.data.name,
          channel: parsed.data.channel,
          audience: { segment: parsed.data.segment, branchId: context.branch!.id },
          template: parsed.data.template,
          status: parsed.data.scheduledAt ? "SCHEDULED" : "DRAFT",
          scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null,
          messages: {
            create: customers.flatMap((customer) => {
              const recipient = parsed.data.channel === "EMAIL" ? customer.email : customer.phone;
              return recipient ? [{ channel: parsed.data.channel, recipient, template: parsed.data.template, idempotencyKey: `${parsed.data.idempotencyKey}-${customer.id}` }] : [];
            }),
          },
        },
      });
      await tx.auditLog.create({ data: { userId: context.user.id, tenantId: context.tenant.id, action: "CAMPAIGN_CREATED", entity: "Campaign", entityId: created.id, metadata: { recipients: customers.length } } });
      return created;
    });
    return Response.json({ data: campaign }, { status: 201 });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
