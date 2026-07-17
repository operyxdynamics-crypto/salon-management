import { z } from "zod";
import { db } from "@/lib/db";
import { GST_STATE_CODES, isValidGstinFormat, stateCodeForState, stateFromGstin } from "@/lib/gst";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";

/**
 * Company profile: legal entities and their GST registrations.
 *
 * A tenant has one primary COMPANY entity and, once it franchises, one FRANCHISEE entity per
 * franchisee that bills under its own name. Registrations hang off an entity, one per state.
 */

const entitySchema = z.object({
  type: z.enum(["COMPANY", "FRANCHISEE"]),
  name: z.string().trim().min(2).max(120),
  legalName: z.string().trim().min(2).max(160),
  panNumber: z.string().trim().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/i, "PAN must look like ABCDE1234F").optional().nullable().or(z.literal("")),
  cin: z.string().trim().max(30).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(20).optional().nullable(),
  isActive: z.boolean().optional(),
});

const registrationSchema = z.object({
  legalEntityId: z.string().min(1),
  gstin: z.string().trim().min(15).max(15),
  state: z.string().trim().min(2).max(60),
  address: z.string().trim().max(300).optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function GET() {
  try {
    const context = await requireOperationsContext("tenant:manage", { branchId: "all", allowAll: true });
    const entities = await db.legalEntity.findMany({
      where: { tenantId: context.tenant.id },
      include: {
        registrations: { orderBy: { state: "asc" } },
        _count: { select: { operatedBranches: true, ownedBranches: true } },
      },
      orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
    });

    return Response.json({
      data: {
        entities,
        /** The states a GSTIN can belong to. The UI derives the state code from the GSTIN itself. */
        states: Object.entries(GST_STATE_CODES).map(([code, name]) => ({ code, name })),
      },
    });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const context = await requireOperationsContext("tenant:manage", { branchId: "all", allowAll: true });

    if (body?.kind === "registration") {
      const parsed = registrationSchema.safeParse(body);
      if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid GST registration", 400, parsed.error.flatten());

      const gstin = parsed.data.gstin.trim().toUpperCase();
      if (!isValidGstinFormat(gstin)) {
        throw new OperationsError("VALIDATION", "That does not look like a valid GSTIN. It should be 15 characters, starting with a state code.", 400);
      }

      // The GSTIN carries its own state in its first two digits. If it disagrees with the state
      // being registered, one of them is wrong - and silently trusting either would mean invoicing
      // under the wrong registration.
      const gstinState = stateFromGstin(gstin);
      if (gstinState && gstinState.toLowerCase() !== parsed.data.state.trim().toLowerCase()) {
        throw new OperationsError("VALIDATION", `This GSTIN belongs to ${gstinState}, not ${parsed.data.state}. The first two digits of a GSTIN are its state code.`, 400);
      }

      const stateCode = stateCodeForState(parsed.data.state);
      if (!stateCode) throw new OperationsError("VALIDATION", "That is not a recognised GST state", 400);

      const entity = await db.legalEntity.findFirst({ where: { id: parsed.data.legalEntityId, tenantId: context.tenant.id } });
      if (!entity) throw new OperationsError("NOT_FOUND", "Business not found", 404);

      try {
        const created = await db.gstRegistration.create({
          data: {
            legalEntityId: entity.id,
            gstin,
            state: parsed.data.state.trim(),
            stateCode,
            address: parsed.data.address || null,
          },
        });
        return Response.json({ data: created }, { status: 201 });
      } catch (error) {
        const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
        if (code === "P2002") {
          throw new OperationsError("CONFLICT", "This business already has a registration in that state, or that GSTIN is already in use.", 409);
        }
        throw error;
      }
    }

    const parsed = entitySchema.safeParse(body);
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid business", 400, parsed.error.flatten());

    const created = await db.legalEntity.create({
      data: {
        tenantId: context.tenant.id,
        type: parsed.data.type,
        name: parsed.data.name,
        legalName: parsed.data.legalName,
        panNumber: parsed.data.panNumber ? parsed.data.panNumber.toUpperCase() : null,
        cin: parsed.data.cin || null,
        email: parsed.data.email || null,
        phone: parsed.data.phone || null,
        isPrimary: false,
      },
    });

    await db.auditLog.create({
      data: {
        userId: context.user.id,
        tenantId: context.tenant.id,
        action: "LEGAL_ENTITY_CREATED",
        entity: "LegalEntity",
        entityId: created.id,
        metadata: { type: created.type, legalName: created.legalName },
      },
    });
    return Response.json({ data: created }, { status: 201 });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}

const patchSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["entity", "registration"]),
  patch: z.record(z.string(), z.unknown()),
});

export async function PATCH(request: Request) {
  try {
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid update", 400, parsed.error.flatten());
    const context = await requireOperationsContext("tenant:manage", { branchId: "all", allowAll: true });

    if (parsed.data.kind === "entity") {
      const fields = entitySchema.partial().safeParse(parsed.data.patch);
      if (!fields.success) throw new OperationsError("VALIDATION", "Invalid business", 400, fields.error.flatten());
      const changed = await db.legalEntity.updateMany({
        where: { id: parsed.data.id, tenantId: context.tenant.id },
        data: {
          ...fields.data,
          panNumber: fields.data.panNumber ? fields.data.panNumber.toUpperCase() : fields.data.panNumber === "" ? null : undefined,
          email: fields.data.email === "" ? null : fields.data.email,
        },
      });
      if (changed.count !== 1) throw new OperationsError("NOT_FOUND", "Business not found", 404);
      return Response.json({ data: { id: parsed.data.id } });
    }

    const fields = registrationSchema.partial().safeParse(parsed.data.patch);
    if (!fields.success) throw new OperationsError("VALIDATION", "Invalid GST registration", 400, fields.error.flatten());

    const registration = await db.gstRegistration.findFirst({
      where: { id: parsed.data.id, legalEntity: { tenantId: context.tenant.id } },
    });
    if (!registration) throw new OperationsError("NOT_FOUND", "Registration not found", 404);

    const gstin = fields.data.gstin ? fields.data.gstin.trim().toUpperCase() : undefined;
    if (gstin) {
      if (!isValidGstinFormat(gstin)) throw new OperationsError("VALIDATION", "That does not look like a valid GSTIN", 400);
      const gstinState = stateFromGstin(gstin);
      const state = fields.data.state ?? registration.state;
      if (gstinState && gstinState.toLowerCase() !== state.trim().toLowerCase()) {
        throw new OperationsError("VALIDATION", `This GSTIN belongs to ${gstinState}, not ${state}.`, 400);
      }
    }

    await db.gstRegistration.update({
      where: { id: registration.id },
      data: {
        ...fields.data,
        gstin,
        ...(fields.data.state ? { stateCode: stateCodeForState(fields.data.state) ?? registration.stateCode } : {}),
      },
    });
    return Response.json({ data: { id: registration.id } });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
