import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";
import { requireTenantPlan } from "@/lib/plan-limits";

const createSchema = z.object({
  branchId: z.string().min(1),
  branchIds: z.array(z.string().min(1)).min(1),
  primaryBranchId: z.string().min(1),
  name: z.string().trim().min(2).max(100),
  email: z.email(),
  password: z.string().min(8).max(100),
  role: z.enum(["MANAGER", "RECEPTIONIST", "STYLIST", "ACCOUNTANT"]),
  jobTitle: z.string().trim().min(2).max(100),
  commissionRate: z.number().min(0).max(100).default(0),
  /// Zero is a real answer - commission-only staff - not a missing value.
  monthlySalary: z.number().min(0).max(10_000_000).default(0),
});

const updateSchema = z.object({
  branchId: z.string().min(1),
  staffId: z.string().min(1),
  branchIds: z.array(z.string().min(1)).min(1).optional(),
  primaryBranchId: z.string().min(1).optional(),
  role: z.enum(["MANAGER", "RECEPTIONIST", "STYLIST", "ACCOUNTANT"]).optional(),
  jobTitle: z.string().trim().min(2).max(100).optional(),
  commissionRate: z.number().min(0).max(100).optional(),
  monthlySalary: z.number().min(0).max(10_000_000).optional(),
  isActive: z.boolean().optional(),
  temporaryPassword: z.string().min(8).max(100).optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid team member", 400, parsed.error.flatten());
    const context = await requireOperationsContext("branch:manage", { branchId: parsed.data.branchId, requireBranch: true });
    const branchIds = [...new Set(parsed.data.branchIds)];
    if (!branchIds.includes(parsed.data.primaryBranchId)) throw new OperationsError("VALIDATION", "Primary branch must be assigned", 400);
    const authorized = context.branches.filter((branch) => branchIds.includes(branch.id));
    if (authorized.length !== branchIds.length) throw new OperationsError("FORBIDDEN", "One or more branches are not authorized", 403);
    const [plan, used, existing] = await Promise.all([
      requireTenantPlan(context.tenant.id),
      db.staff.count({ where: { user: { tenantId: context.tenant.id, isActive: true } } }),
      db.user.findUnique({ where: { email: parsed.data.email } }),
    ]);
    if (used >= plan.maxStaff) throw new OperationsError("CONFLICT", "Staff limit reached for the assigned plan", 409, { used, limit: plan.maxStaff });
    if (existing) throw new OperationsError("CONFLICT", "This email address is already in use", 409);
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const staff = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          tenantId: context.tenant.id,
          name: parsed.data.name,
          email: parsed.data.email,
          passwordHash,
          role: parsed.data.role,
        },
      });
      const member = await tx.staff.create({
        data: {
          userId: user.id,
          branchId: parsed.data.primaryBranchId,
          jobTitle: parsed.data.jobTitle,
          commissionRate: parsed.data.commissionRate,
          monthlySalary: parsed.data.monthlySalary,
          branchAssignments: {
            create: branchIds.map((branchId) => ({ branchId, isPrimary: branchId === parsed.data.primaryBranchId })),
          },
        },
      });
      await tx.auditLog.create({
        data: {
          userId: context.user.id,
          tenantId: context.tenant.id,
          action: "STAFF_CREATED",
          entity: "Staff",
          entityId: member.id,
          metadata: { role: parsed.data.role, branchIds },
        },
      });
      return member;
    });
    return Response.json({ data: staff }, { status: 201 });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid team member update", 400, parsed.error.flatten());
    const context = await requireOperationsContext("staff:write", { branchId: parsed.data.branchId, requireBranch: true });
    const staff = await db.staff.findFirst({
      where: {
        id: parsed.data.staffId,
        user: { tenantId: context.tenant.id },
        OR: [{ branchId: context.branch!.id }, { branchAssignments: { some: { branchId: context.branch!.id } } }],
      },
      include: { user: true, branchAssignments: true },
    });
    if (!staff) throw new OperationsError("NOT_FOUND", "Team member not found", 404);
    const branchIds = parsed.data.branchIds ? [...new Set(parsed.data.branchIds)] : undefined;
    const primaryBranchId = parsed.data.primaryBranchId ?? (branchIds ? branchIds[0] : undefined);
    if (branchIds && primaryBranchId && !branchIds.includes(primaryBranchId)) {
      throw new OperationsError("VALIDATION", "Primary branch must be assigned", 400);
    }
    if (branchIds) {
      const authorized = context.branches.filter((branch) => branchIds.includes(branch.id));
      if (authorized.length !== branchIds.length) throw new OperationsError("FORBIDDEN", "One or more branches are not authorized", 403);
    }
    const passwordHash = parsed.data.temporaryPassword ? await bcrypt.hash(parsed.data.temporaryPassword, 12) : undefined;
    const updated = await db.$transaction(async (tx) => {
      if (branchIds && primaryBranchId) {
        await tx.staffBranchAssignment.deleteMany({ where: { staffId: staff.id } });
        await tx.staffBranchAssignment.createMany({
          data: branchIds.map((branchId) => ({ staffId: staff.id, branchId, isPrimary: branchId === primaryBranchId })),
        });
      }
      await tx.user.update({
        where: { id: staff.userId },
        data: {
          role: parsed.data.role,
          isActive: parsed.data.isActive,
          passwordHash,
        },
      });
      const member = await tx.staff.update({
        where: { id: staff.id },
        data: {
          branchId: primaryBranchId,
          jobTitle: parsed.data.jobTitle,
          commissionRate: parsed.data.commissionRate,
          monthlySalary: parsed.data.monthlySalary,
        },
        include: { user: true, branchAssignments: true },
      });
      await tx.auditLog.create({
        data: {
          userId: context.user.id,
          tenantId: context.tenant.id,
          action: "STAFF_UPDATED",
          entity: "Staff",
          entityId: staff.id,
          metadata: {
            role: parsed.data.role,
            isActive: parsed.data.isActive,
            commissionRate: parsed.data.commissionRate,
            branchIds,
            passwordReset: Boolean(parsed.data.temporaryPassword),
          },
        },
      });
      return member;
    });
    return Response.json({ data: updated });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
