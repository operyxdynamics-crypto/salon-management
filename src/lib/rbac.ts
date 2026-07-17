import { PERMISSIONS, type Permission } from "./permissions";

/**
 * Legacy role map.
 *
 * This used to be the source of truth for what everyone could do - hardcoded, so nothing could be
 * changed without a deploy and nobody could be granted one extra right. Rights now live in the
 * `Role` table and in per-person overrides; the vocabulary is in `src/lib/permissions.ts`.
 *
 * This file survives for two reasons:
 *
 *   1. `UserRole` still carries platform-level meaning (PLATFORM_ADMIN, CUSTOMER) which is not a
 *      tenant role and never should be.
 *   2. Until the backfill has assigned every user a Role, `requireOperationsContext` falls back to
 *      this map - which is what makes the migration safe to deploy before the data catches up.
 *
 * Do not add permissions here. Add them to the catalogue and to the seeded roles.
 */

export const roles = [
  "PLATFORM_ADMIN",
  "OWNER",
  "MANAGER",
  "RECEPTIONIST",
  "STYLIST",
  "ACCOUNTANT",
  "CUSTOMER",
] as const;

export type Role = (typeof roles)[number];
export type { Permission };

const grants: Record<Role, Permission[]> = {
  PLATFORM_ADMIN: ["marketplace:moderate", "tenant:manage", "report:read"],
  OWNER: [...PERMISSIONS].filter((permission) => permission !== "marketplace:moderate"),
  MANAGER: [
    "branch:manage", "appointment:read", "appointment:write", "customer:read", "customer:write",
    "service:read", "master:write", "sale:write", "sale:refund", "report:read", "inventory:write",
    "campaign:write", "staff:read", "staff:write", "payroll:read", "website:manage", "self:read",
  ],
  RECEPTIONIST: ["appointment:read", "appointment:write", "customer:read", "customer:write", "service:read", "sale:write", "self:read"],
  STYLIST: ["appointment:read", "customer:read", "service:read", "self:read"],
  ACCOUNTANT: ["sale:write", "sale:refund", "report:read", "inventory:write", "staff:read", "payroll:read", "service:read", "self:read"],
  CUSTOMER: ["self:read", "appointment:write"],
};

/** Used only while a user has no assigned Role. */
export function legacyPermissionsForRole(role: Role): Permission[] {
  return grants[role] ?? [];
}

export function can(role: Role, permission: Permission) {
  return (grants[role] ?? []).includes(permission);
}

export function assertTenantAccess(sessionTenantId: string | null, resourceTenantId: string) {
  if (!sessionTenantId || sessionTenantId !== resourceTenantId) {
    throw new Error("Tenant access denied");
  }
}
