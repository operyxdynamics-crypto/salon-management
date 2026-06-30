import { db } from "./db";
import { readSession } from "./session";

export type PlatformErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "LIMIT_EXCEEDED"
  | "INCOMPLETE_ONBOARDING"
  | "STORAGE_ERROR";

export class PlatformError extends Error {
  constructor(
    public code: PlatformErrorCode,
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function requirePlatformAdmin() {
  const session = await readSession();
  if (!session) throw new PlatformError("UNAUTHENTICATED", "Authentication required", 401);
  if (session.role !== "PLATFORM_ADMIN") throw new PlatformError("FORBIDDEN", "Platform administrator access required", 403);
  const user = await db.user.findFirst({ where: { id: session.userId, role: "PLATFORM_ADMIN", isActive: true } });
  if (!user) throw new PlatformError("UNAUTHENTICATED", "Administrator account is inactive", 401);
  return { session, user };
}

export async function requireOnboardingOwner() {
  const session = await readSession();
  if (!session) throw new PlatformError("UNAUTHENTICATED", "Authentication required", 401);
  if (session.role !== "OWNER" || !session.tenantId) throw new PlatformError("FORBIDDEN", "Salon owner access required", 403);
  const user = await db.user.findFirst({
    where: { id: session.userId, tenantId: session.tenantId, role: "OWNER", isActive: true },
    include: { tenant: true },
  });
  if (!user?.tenant || ["SUSPENDED", "ARCHIVED"].includes(user.tenant.status)) {
    throw new PlatformError("FORBIDDEN", "This salon account is not available", 403);
  }
  return { session, user, tenant: user.tenant };
}

export function platformErrorResponse(error: unknown) {
  if (error instanceof PlatformError) {
    return Response.json(
      { error: { code: error.code, message: error.message, details: error.details ?? null } },
      { status: error.status },
    );
  }
  console.error(error);
  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong", details: null } },
    { status: 500 },
  );
}

export function requestIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? null;
}
