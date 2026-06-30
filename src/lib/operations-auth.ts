import { db } from "./db";
import { can, type Permission } from "./rbac";
import { readSession } from "./session";
import { PlatformError } from "./platform-auth";

export class OperationsError extends Error {
  constructor(
    public code: "UNAUTHENTICATED" | "FORBIDDEN" | "TENANT_SUSPENDED" | "NOT_FOUND" | "CONFLICT" | "POLICY" | "VALIDATION" | "INSUFFICIENT_STOCK",
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
  if (!can(session.role, permission)) throw new OperationsError("FORBIDDEN", "Permission denied", 403);
  if (!session.tenantId) throw new OperationsError("FORBIDDEN", "A salon workspace is required", 403);
  const tenantId = session.tenantId;

  const user = await db.user.findFirst({
    where: { id: session.userId, tenantId },
    include: {
      tenant: true,
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
  if (options.branchId === "all" && user.role !== "OWNER") {
    throw new OperationsError("FORBIDDEN", "Only salon owners can view all branches together", 403);
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

  return { session, user, tenant: user.tenant, branch, branches };
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
