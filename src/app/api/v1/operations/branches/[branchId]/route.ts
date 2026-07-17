import { z } from "zod";
import { db } from "@/lib/db";
import { supplierEntityIdForBranch, validateBranchRegistration } from "@/lib/gst";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

/**
 * Branch profile: address, ownership model, operator, and GST registration.
 *
 * The operator is the supplier. Setting `ownershipModel` to FOFO and pointing `operatorEntityId`
 * at a franchisee is what makes that branch bill under the franchisee's own GSTIN.
 */

const schema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  /// The branch's invoice series. Capped at 4 so the serial stays inside GST's 16-character limit.
  invoiceCode: z.string().trim().min(1).max(4).regex(/^[A-Za-z0-9]+$/, "Invoice code can only use letters and numbers").transform((value) => value.toUpperCase()).optional(),
  phone: z.string().trim().max(20).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  address: z.string().trim().min(3).max(300).optional(),
  city: z.string().trim().min(2).max(80).optional(),
  state: z.string().trim().min(2).max(60).optional(),
  postalCode: z.string().trim().max(12).optional(),
  ownershipModel: z.enum(["COCO", "FOCO", "FOFO"]).optional(),
  ownerEntityId: z.string().min(1).optional().nullable(),
  operatorEntityId: z.string().min(1).optional().nullable(),
  gstRegistrationId: z.string().min(1).optional().nullable(),
});

export async function GET(request: Request, { params }: { params: Promise<{ branchId: string }> }) {
  try {
    const { branchId } = await params;
    const context = await requireOperationsContext("branch:manage", { branchId, requireBranch: true });

    const branch = await db.branch.findFirst({
      where: { id: context.branch!.id, tenantId: context.tenant.id },
      include: {
        ownerEntity: { select: { id: true, name: true, legalName: true, type: true } },
        operatorEntity: { select: { id: true, name: true, legalName: true, type: true } },
        gstRegistration: true,
      },
    });
    if (!branch) throw new OperationsError("NOT_FOUND", "Branch not found", 404);

    const entities = await db.legalEntity.findMany({
      where: { tenantId: context.tenant.id, isActive: true },
      include: { registrations: { where: { isActive: true } } },
      orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
    });

    const check = validateBranchRegistration({
      branchState: branch.state,
      registration: branch.gstRegistration,
      operatorEntityId: supplierEntityIdForBranch(branch),
    });

    return Response.json({
      data: {
        branch,
        entities,
        /** Surfaced so the UI can warn before an invoice is raised under the wrong registration. */
        gstStatus: check.ok ? { ok: true, reason: null } : { ok: false, reason: check.reason },
      },
    });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ branchId: string }> }) {
  try {
    const { branchId } = await params;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid branch", 400, parsed.error.flatten());
    const context = await requireOperationsContext("branch:manage", { branchId, requireBranch: true });

    const branch = await db.branch.findFirst({ where: { id: context.branch!.id, tenantId: context.tenant.id } });
    if (!branch) throw new OperationsError("NOT_FOUND", "Branch not found", 404);

    // Every entity referenced must belong to this tenant. Without this check an id from another
    // salon could be pasted in and a branch would start billing under a stranger's GSTIN.
    const entityIds = [parsed.data.ownerEntityId, parsed.data.operatorEntityId].filter((id): id is string => Boolean(id));
    if (entityIds.length) {
      const owned = await db.legalEntity.count({ where: { id: { in: entityIds }, tenantId: context.tenant.id } });
      if (owned !== new Set(entityIds).size) throw new OperationsError("FORBIDDEN", "Unknown business", 403);
    }

    // Two branches sharing a code would issue the same invoice number, so say so plainly here
    // rather than letting the unique index fail later, mid-sale.
    if (parsed.data.invoiceCode && parsed.data.invoiceCode !== branch.invoiceCode) {
      const clash = await db.branch.findFirst({
        where: { tenantId: context.tenant.id, invoiceCode: parsed.data.invoiceCode, id: { not: branch.id } },
        select: { name: true },
      });
      if (clash) throw new OperationsError("VALIDATION", `Invoice code ${parsed.data.invoiceCode} is already used by ${clash.name}. Pick another.`, 400);
    }

    const nextState = parsed.data.state ?? branch.state;
    const nextOperator = parsed.data.operatorEntityId !== undefined ? parsed.data.operatorEntityId : branch.operatorEntityId;
    const nextRegistrationId = parsed.data.gstRegistrationId !== undefined ? parsed.data.gstRegistrationId : branch.gstRegistrationId;

    if (nextRegistrationId) {
      const registration = await db.gstRegistration.findFirst({
        where: { id: nextRegistrationId, legalEntity: { tenantId: context.tenant.id } },
      });
      const check = validateBranchRegistration({
        branchState: nextState,
        registration,
        operatorEntityId: nextOperator ?? parsed.data.ownerEntityId ?? branch.ownerEntityId ?? null,
      });
      if (!check.ok) throw new OperationsError("VALIDATION", check.reason, 400);
    }

    await db.branch.update({
      where: { id: branch.id },
      data: {
        ...parsed.data,
        email: parsed.data.email === "" ? null : parsed.data.email,
      },
    });

    await db.auditLog.create({
      data: {
        userId: context.user.id,
        tenantId: context.tenant.id,
        action: "BRANCH_PROFILE_UPDATED",
        entity: "Branch",
        entityId: branch.id,
        metadata: { fields: Object.keys(parsed.data) },
      },
    });

    return Response.json({ data: { id: branch.id } });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
