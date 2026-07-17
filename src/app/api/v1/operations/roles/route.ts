import { z } from "zod";
import { db } from "@/lib/db";
import { OperationsError, operationsErrorResponse, requireOperationsContext } from "@/lib/operations-auth";
import { PERMISSION_GROUPS, effectivePermissions, isPermission } from "@/lib/permissions";

/**
 * Roles and rights.
 *
 * System roles are locked. An owner who could edit "Owner" could remove their own right to manage
 * roles and lock themselves out of their salon permanently, with no way back except a developer and
 * a database. They clone instead.
 */

export async function GET() {
  try {
    const context = await requireOperationsContext("role:manage", { branchId: "all", allowAll: true });

    const [roles, users] = await Promise.all([
      db.role.findMany({
        where: { tenantId: context.tenant.id },
        include: { _count: { select: { users: true } } },
        orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      }),
      db.user.findMany({
        where: { tenantId: context.tenant.id, isActive: true, role: { notIn: ["PLATFORM_ADMIN", "CUSTOMER"] } },
        include: { roleRecord: { select: { id: true, name: true, permissions: true } }, permissionOverrides: true },
        orderBy: { name: "asc" },
      }),
    ]);

    return Response.json({
      data: {
        roles,
        catalogue: PERMISSION_GROUPS,
        users: users.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          legacyRole: user.role,
          roleId: user.roleId,
          roleName: user.roleRecord?.name ?? null,
          overrides: user.permissionOverrides.map((override) => ({ permission: override.permission, allow: override.allow })),
          // What this person can actually do, once role and overrides are resolved. The UI shows
          // this rather than making the owner work it out.
          effective: [...effectivePermissions(user.roleRecord?.permissions ?? [], user.permissionOverrides)],
        })),
      },
    });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).optional().nullable(),
  /** Clone the permissions of an existing role rather than starting from nothing. */
  cloneFromRoleId: z.string().min(1).optional(),
  permissions: z.array(z.string()).optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid role", 400, parsed.error.flatten());
    const context = await requireOperationsContext("role:manage", { branchId: "all", allowAll: true });

    let permissions = (parsed.data.permissions ?? []).filter(isPermission);

    if (parsed.data.cloneFromRoleId) {
      const source = await db.role.findFirst({ where: { id: parsed.data.cloneFromRoleId, tenantId: context.tenant.id } });
      if (!source) throw new OperationsError("NOT_FOUND", "Role to copy was not found", 404);
      permissions = source.permissions.filter(isPermission);
    }

    try {
      const created = await db.role.create({
        data: {
          tenantId: context.tenant.id,
          name: parsed.data.name,
          description: parsed.data.description || null,
          isSystem: false,
          permissions,
        },
      });
      await db.auditLog.create({
        data: {
          userId: context.user.id,
          tenantId: context.tenant.id,
          action: "ROLE_CREATED",
          entity: "Role",
          entityId: created.id,
          metadata: { name: created.name, clonedFrom: parsed.data.cloneFromRoleId ?? null },
        },
      });
      return Response.json({ data: created }, { status: 201 });
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
      if (code === "P2002") throw new OperationsError("CONFLICT", "A role with that name already exists", 409);
      throw error;
    }
  } catch (error) {
    return operationsErrorResponse(error);
  }
}

const patchSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("role"),
    id: z.string().min(1),
    name: z.string().trim().min(2).max(60).optional(),
    description: z.string().trim().max(200).optional().nullable(),
    permissions: z.array(z.string()).optional(),
  }),
  z.object({
    kind: z.literal("user"),
    id: z.string().min(1),
    roleId: z.string().min(1).optional().nullable(),
    /** A right added to, or taken away from, this one person. */
    overrides: z.array(z.object({ permission: z.string(), allow: z.boolean() })).optional(),
  }),
]);

export async function PATCH(request: Request) {
  try {
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) throw new OperationsError("VALIDATION", "Invalid update", 400, parsed.error.flatten());
    const context = await requireOperationsContext("role:manage", { branchId: "all", allowAll: true });

    if (parsed.data.kind === "role") {
      const role = await db.role.findFirst({ where: { id: parsed.data.id, tenantId: context.tenant.id } });
      if (!role) throw new OperationsError("NOT_FOUND", "Role not found", 404);
      if (role.isSystem) {
        throw new OperationsError("POLICY", "Built-in roles cannot be changed. Make a copy and edit that instead.", 409);
      }

      await db.role.update({
        where: { id: role.id },
        data: {
          name: parsed.data.name,
          description: parsed.data.description,
          permissions: parsed.data.permissions ? parsed.data.permissions.filter(isPermission) : undefined,
        },
      });
      await db.auditLog.create({
        data: { userId: context.user.id, tenantId: context.tenant.id, action: "ROLE_UPDATED", entity: "Role", entityId: role.id, metadata: { name: role.name } },
      });
      return Response.json({ data: { id: role.id } });
    }

    // Bind the narrowed variant to a const. Reaching through `parsed.data` inside the transaction
    // callback loses the discriminated-union narrowing, because it is a property access rather than
    // a stable binding.
    const patch = parsed.data;

    const user = await db.user.findFirst({ where: { id: patch.id, tenantId: context.tenant.id } });
    if (!user) throw new OperationsError("NOT_FOUND", "Team member not found", 404);

    // Nobody may remove their own right to manage roles. That is the one action with no way back:
    // the salon would need a developer and database access to recover.
    if (user.id === context.user.id) {
      const removesRoleManagement = patch.overrides?.some((item) => item.permission === "role:manage" && !item.allow);
      if (removesRoleManagement) {
        throw new OperationsError("POLICY", "You cannot remove your own right to manage roles - you would lock yourself out.", 409);
      }
      if (patch.roleId) {
        const nextRole = await db.role.findFirst({ where: { id: patch.roleId, tenantId: context.tenant.id } });
        if (nextRole && !nextRole.permissions.includes("role:manage")) {
          throw new OperationsError("POLICY", "That role cannot manage roles, so moving yourself to it would lock you out.", 409);
        }
      }
    }

    const overrides = patch.overrides;
    const nextRoleId = patch.roleId;

    await db.$transaction(async (tx) => {
      if (nextRoleId !== undefined) {
        await tx.user.update({ where: { id: user.id }, data: { roleId: nextRoleId } });
      }
      if (overrides) {
        await tx.userPermission.deleteMany({ where: { userId: user.id } });
        const valid = overrides.filter((item) => isPermission(item.permission));
        if (valid.length) {
          await tx.userPermission.createMany({
            data: valid.map((item) => ({ userId: user.id, permission: item.permission, allow: item.allow })),
          });
        }
      }
      await tx.auditLog.create({
        data: {
          userId: context.user.id,
          tenantId: context.tenant.id,
          action: "USER_RIGHTS_UPDATED",
          entity: "User",
          entityId: user.id,
          metadata: { name: user.name, roleId: nextRoleId ?? null, overrides: overrides?.length ?? 0 },
        },
      });
    });

    return Response.json({ data: { id: user.id } });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new OperationsError("VALIDATION", "Role is required", 400);
    const context = await requireOperationsContext("role:manage", { branchId: "all", allowAll: true });

    const role = await db.role.findFirst({
      where: { id, tenantId: context.tenant.id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw new OperationsError("NOT_FOUND", "Role not found", 404);
    if (role.isSystem) throw new OperationsError("POLICY", "Built-in roles cannot be deleted.", 409);
    if (role._count.users > 0) {
      throw new OperationsError("CONFLICT", `${role._count.users} person(s) still use this role. Move them to another role first.`, 409);
    }

    await db.role.delete({ where: { id: role.id } });
    return Response.json({ data: { id: role.id } });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
