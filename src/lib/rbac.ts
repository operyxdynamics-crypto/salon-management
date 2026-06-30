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
export type Permission =
  | "marketplace:moderate"
  | "tenant:manage"
  | "branch:manage"
  | "appointment:read"
  | "appointment:write"
  | "customer:read"
  | "customer:write"
  | "service:read"
  | "sale:write"
  | "report:read"
  | "inventory:write"
  | "campaign:write"
  | "staff:read"
  | "staff:write"
  | "payroll:read"
  | "website:manage"
  | "self:read";

const grants: Record<Role, Permission[]> = {
  PLATFORM_ADMIN: ["marketplace:moderate", "tenant:manage", "report:read"],
  OWNER: ["tenant:manage", "branch:manage", "appointment:read", "appointment:write", "customer:read", "customer:write", "service:read", "sale:write", "report:read", "inventory:write", "campaign:write", "staff:read", "staff:write", "payroll:read", "website:manage", "self:read"],
  MANAGER: ["branch:manage", "appointment:read", "appointment:write", "customer:read", "customer:write", "service:read", "sale:write", "report:read", "inventory:write", "campaign:write", "staff:read", "staff:write", "payroll:read", "website:manage", "self:read"],
  RECEPTIONIST: ["appointment:read", "appointment:write", "customer:read", "customer:write", "service:read", "sale:write", "self:read"],
  STYLIST: ["appointment:read", "customer:read", "service:read", "self:read"],
  ACCOUNTANT: ["sale:write", "report:read", "inventory:write", "staff:read", "payroll:read", "self:read"],
  CUSTOMER: ["self:read", "appointment:write"],
};

export function can(role: Role, permission: Permission) {
  return grants[role].includes(permission);
}

export function assertTenantAccess(sessionTenantId: string | null, resourceTenantId: string) {
  if (!sessionTenantId || sessionTenantId !== resourceTenantId) {
    throw new Error("Tenant access denied");
  }
}
