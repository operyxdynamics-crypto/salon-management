import { Prisma } from "@prisma/client";
import { db } from "./db";
import { effectivePermissions, type Permission } from "./permissions";
import { legacyPermissionsForRole } from "./rbac";
import { readSession } from "./session";
import { PlatformError } from "./platform-auth";

export class OperationsError extends Error {
  constructor(
    public code: "UNAUTHENTICATED" | "FORBIDDEN" | "TENANT_SUSPENDED" | "NOT_FOUND" | "CONFLICT" | "POLICY" | "VALIDATION" | "INSUFFICIENT_STOCK" | "APPOINTMENT_ALREADY_INVOICED" | "COUPON_REJECTED" | "COUPON_CHANGED",
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

type OperationsContextOptions = {
  branchId?: string | null;
  allowAll?: boolean;
  requireBranch?: boolean;
};

export async function requireOperationsContext(permission: Permission, options: OperationsContextOptions = {}) {
  const session = await readSession();
  if (!session) throw new OperationsError("UNAUTHENTICATED", "Authentication required", 401);
  if (!session.tenantId) throw new OperationsError("FORBIDDEN", "A salon workspace is required", 403);
  const tenantId = session.tenantId;

  const user = await db.user.findFirst({
    where: { id: session.userId, tenantId },
    include: {
      tenant: true,
      roleRecord: true,
      permissionOverrides: true,
      staff: {
        include: {
          branch: true,
          branchAssignments: { include: { branch: true }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
        },
      },
    },
  });
  if (!user?.isActive || !user.tenant) {
    throw new OperationsError("UNAUTHENTICATED", "This account is inactive", 401);
  }

  /**
   * Rights come from the person's assigned Role plus their own overrides. Where no Role has been
   * assigned yet - every user, until the backfill runs - we fall back to the legacy hardcoded map,
   * so nothing breaks in between. That fallback is what makes this migration safe to deploy before
   * the data catches up.
   */
  const permissions = user.roleRecord
    ? effectivePermissions(user.roleRecord.permissions, user.permissionOverrides)
    : effectivePermissions(legacyPermissionsForRole(session.role), user.permissionOverrides);

  if (!permissions.has(permission)) {
    throw new OperationsError("FORBIDDEN", "Permission denied", 403);
  }

  if (user.tenant.status !== "ACTIVE") {
    throw new OperationsError("TENANT_SUSPENDED", "This salon workspace is not active", 403);
  }

  const branches = user.role === "OWNER"
    ? await db.branch.findMany({ where: { tenantId, publicationStatus: { not: "ARCHIVED" } }, orderBy: { name: "asc" } })
    : [
      ...(user.staff?.branchAssignments.map((assignment) => assignment.branch) ?? []),
      ...(user.staff?.branch ? [user.staff.branch] : []),
    ].filter((branch, index, all) => all.findIndex((item) => item.id === branch.id) === index);
  if (!branches.length) throw new OperationsError("NOT_FOUND", "No authorized branch is configured", 404);

  if (options.branchId === "all" && !options.allowAll) {
    throw new OperationsError("FORBIDDEN", "This operation requires a specific branch", 403);
  }
  const branch = options.branchId && options.branchId !== "all"
    ? branches.find((item) => item.id === options.branchId)
    : options.branchId === "all"
      ? null
      : branches[0];
  if (options.branchId && options.branchId !== "all" && !branch) {
    throw new OperationsError("FORBIDDEN", "You do not have access to this branch", 403);
  }
  if (options.requireBranch && !branch) {
    throw new OperationsError("VALIDATION", "A branch is required for this operation", 400);
  }

  // Routes that need a secondary check ("may this person also refund?") should read `permissions`
  // rather than calling can(session.role, ...), which consults the legacy map and would ignore a
  // custom role or a per-person override.
  return { session, user, tenant: user.tenant, branch, branches, permissions };
}

/**
 * Turn the two realistic infrastructure failures into a plain-language answer instead of an opaque
 * 500. A paused Supabase project or a schema that has not been migrated both surface as unexpected
 * errors; the receptionist should see what to do, not "Something went wrong".
 */
function infrastructureError(error: unknown): { code: string; message: string; status: number } | null {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return { code: "DB_UNREACHABLE", message: "Can't reach the database. If it's a Supabase project, resume it and try again.", status: 503 };
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (["P1001", "P1002", "P1008", "P1017"].includes(error.code)) {
      return { code: "DB_UNREACHABLE", message: "The database is unreachable or timed out. If it's a Supabase project, resume it and try again.", status: 503 };
    }
    if (["P2021", "P2022"].includes(error.code)) {
      return { code: "DB_SCHEMA_OUTDATED", message: "A database table or column is missing. Run the pending migrations, then try again.", status: 500 };
    }
    if (error.code === "P2002") {
      const target = Array.isArray(error.meta?.target) ? (error.meta.target as string[]).join(", ") : null;
      return {
        code: "DUPLICATE",
        message: target ? `Something with this ${target} already exists.` : "This already exists.",
        status: 409,
      };
    }
  }
  // The pg driver adapter can surface a raw socket error before Prisma wraps it.
  const driverCode = (error as { code?: unknown })?.code;
  if (typeof driverCode === "string" && ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "ECONNRESET"].includes(driverCode)) {
    return { code: "DB_UNREACHABLE", message: "Can't reach the database. Check the connection, or resume the Supabase project, then try again.", status: 503 };
  }
  return null;
}

export function operationsErrorResponse(error: unknown) {
  if (error instanceof PlatformError) {
    return Response.json({
      error: { code: error.code, message: error.message, details: error.details ?? null },
    }, { status: error.status });
  }
  if (error instanceof OperationsError) {
    return Response.json({
      error: { code: error.code, message: error.message, details: error.details ?? null },
    }, { status: error.status });
  }
  const infra = infrastructureError(error);
  if (infra) {
    console.error(`[${infra.code}]`, error instanceof Error ? error.message : error);
    return Response.json({ error: { code: infra.code, message: infra.message, details: null } }, { status: infra.status });
  }
  console.error(error);
  const devDetails = process.env.NODE_ENV === "production"
    ? null
    : error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : error;
  return Response.json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong", details: devDetails },
  }, { status: 500 });
}
