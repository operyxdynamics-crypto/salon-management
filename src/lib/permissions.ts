/**
 * The permission catalogue.
 *
 * Permissions were a hardcoded map from role to capability (`src/lib/rbac.ts`), compiled into the
 * app. Nothing could be changed without a deploy, and there was no way to give one person one extra
 * right. This file is the vocabulary; roles and per-person overrides are data.
 *
 * Every label here is written for a salon owner, not a developer. "sale:write" is what the code
 * checks; "Take payments and create invoices" is what a human is deciding about.
 */

export const PERMISSIONS = [
  // Bookings
  "appointment:read",
  "appointment:write",

  // Customers
  "customer:read",
  "customer:write",

  // Money
  "sale:write",
  "sale:refund",
  "report:read",

  // Setup
  "service:read",
  "master:write",
  "inventory:write",

  // People
  "staff:read",
  "staff:write",
  "payroll:read",
  "role:manage",

  // Business
  "branch:manage",
  "tenant:manage",
  "campaign:write",
  "website:manage",

  // Platform / self
  "marketplace:moderate",
  "self:read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type PermissionGroup = {
  id: string;
  label: string;
  permissions: Array<{
    id: Permission;
    label: string;
    /** What actually happens if this is granted. Written so an owner can decide without guessing. */
    detail: string;
    /** Granting this is how money leaves the salon. Shown with a warning in the UI. */
    sensitive?: boolean;
  }>;
};

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: "bookings",
    label: "Bookings",
    permissions: [
      { id: "appointment:read", label: "See the calendar", detail: "View bookings, who is coming, and what they booked." },
      { id: "appointment:write", label: "Book and change appointments", detail: "Create, move, cancel, and check customers in." },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    permissions: [
      { id: "customer:read", label: "See customer profiles", detail: "View history, notes, allergies, and balances." },
      { id: "customer:write", label: "Add and edit customers", detail: "Create profiles and change their details." },
    ],
  },
  {
    id: "money",
    label: "Money",
    permissions: [
      { id: "sale:write", label: "Take payments and create invoices", detail: "Ring up sales at the counter and record payment." },
      { id: "sale:refund", label: "Give refunds", detail: "Return money to a customer and reverse an invoice.", sensitive: true },
      { id: "report:read", label: "See reports and revenue", detail: "View takings, GST, expenses, and invoice history.", sensitive: true },
    ],
  },
  {
    id: "setup",
    label: "Setup",
    permissions: [
      { id: "service:read", label: "See services and prices", detail: "Needed by anyone who books or bills." },
      { id: "master:write", label: "Edit services, prices, and categories", detail: "Change what you sell and what it costs.", sensitive: true },
      { id: "inventory:write", label: "Manage stock", detail: "Record purchases, transfers, stocktakes, and adjustments." },
    ],
  },
  {
    id: "people",
    label: "Team",
    permissions: [
      { id: "staff:read", label: "See the team", detail: "View staff, shifts, and attendance." },
      { id: "staff:write", label: "Add and edit staff", detail: "Create logins, set commission, assign branches.", sensitive: true },
      { id: "payroll:read", label: "See earnings and payroll", detail: "View what each person has earned.", sensitive: true },
      { id: "role:manage", label: "Manage roles and rights", detail: "Decide what everyone else can do.", sensitive: true },
    ],
  },
  {
    id: "business",
    label: "Business",
    permissions: [
      { id: "branch:manage", label: "Manage this branch", detail: "Branch details, hours, and GST registration." },
      { id: "tenant:manage", label: "Manage the company", detail: "Legal entities, GSTINs, franchisees, and subscription.", sensitive: true },
      { id: "campaign:write", label: "Run marketing", detail: "Create campaigns and message customers." },
      { id: "website:manage", label: "Manage the public website", detail: "Edit the salon's public booking page." },
    ],
  },
];

/**
 * The roles every salon starts with.
 *
 * These are locked. An owner who could edit "Owner" could remove their own right to manage roles
 * and lock themselves out of their own salon permanently. To customise, they clone.
 */
export const SYSTEM_ROLES: Array<{
  code: string;
  name: string;
  description: string;
  permissions: Permission[];
}> = [
  {
    code: "OWNER",
    name: "Owner",
    description: "Full access to everything, including roles and company settings.",
    permissions: [...PERMISSIONS].filter((permission) => permission !== "marketplace:moderate"),
  },
  {
    code: "MANAGER",
    name: "Manager",
    description: "Runs a branch day to day. Everything except company settings and roles.",
    permissions: [
      "appointment:read", "appointment:write",
      "customer:read", "customer:write",
      "sale:write", "sale:refund", "report:read",
      "service:read", "master:write", "inventory:write",
      "staff:read", "staff:write", "payroll:read",
      "branch:manage", "campaign:write", "website:manage",
      "self:read",
    ],
  },
  {
    code: "RECEPTIONIST",
    name: "Receptionist",
    description: "Books appointments and takes payments. Cannot refund or see revenue.",
    permissions: [
      "appointment:read", "appointment:write",
      "customer:read", "customer:write",
      "sale:write",
      "service:read",
      "self:read",
    ],
  },
  {
    code: "STYLIST",
    name: "Stylist",
    description: "Sees their own schedule and their customers. Cannot take money.",
    permissions: [
      "appointment:read",
      "customer:read",
      "service:read",
      "self:read",
    ],
  },
  {
    code: "ACCOUNTANT",
    name: "Accountant",
    description: "Sees the money. Cannot change bookings or the catalogue.",
    permissions: [
      "sale:write", "sale:refund", "report:read",
      "service:read", "inventory:write",
      "staff:read", "payroll:read",
      "self:read",
    ],
  },
];

/**
 * A person's effective rights.
 *
 * Role first, then per-person adjustments on top. An override is deliberately explicit about
 * whether it grants or removes, rather than being a second list of grants - "Priya is a
 * receptionist, but she may also give refunds" and "Ravi is a manager, but must not see payroll"
 * are both things a salon owner will want to say, and only one of them is expressible with a
 * grant-only model.
 */
export function effectivePermissions(
  rolePermissions: string[],
  overrides: Array<{ permission: string; allow: boolean }> = [],
): Set<Permission> {
  const granted = new Set<Permission>(rolePermissions.filter(isPermission));

  for (const override of overrides) {
    if (!isPermission(override.permission)) continue;
    if (override.allow) granted.add(override.permission);
    else granted.delete(override.permission);
  }

  // Everyone can always see their own record. Removing this would lock a person out of the app
  // entirely, which is never what an owner means to do.
  granted.add("self:read");
  return granted;
}

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export function permissionLabel(permission: Permission) {
  for (const group of PERMISSION_GROUPS) {
    const found = group.permissions.find((item) => item.id === permission);
    if (found) return found.label;
  }
  return permission;
}
