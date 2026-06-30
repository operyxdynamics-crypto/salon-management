import type { Branch, Tenant, VerificationDocument } from "@prisma/client";

const requiredDocuments = ["GST_CERTIFICATE", "PAN_CARD", "ADDRESS_PROOF", "BANK_PROOF"] as const;

export function branchChecklist({
  tenant,
  branch,
  documents,
  serviceCount,
  operatingHourCount,
}: {
  tenant: Tenant;
  branch: Branch;
  documents: VerificationDocument[];
  serviceCount: number;
  operatingHourCount: number;
}) {
  const approvedTypes = new Set(documents.filter((item) => item.status === "APPROVED").map((item) => item.type));
  return {
    businessIdentity: Boolean(tenant.legalName && tenant.gstin && tenant.panNumber),
    ownerContact: Boolean(branch.phone && branch.email),
    completeAddress: Boolean(branch.address && branch.city && branch.state && branch.postalCode),
    operatingHours: operatingHourCount >= 7,
    serviceCatalogue: serviceCount > 0,
    policies: Boolean(branch.policies),
    requiredDocuments: requiredDocuments.every((type) => approvedTypes.has(type)),
    salonMedia: approvedTypes.has("SALON_MEDIA"),
  };
}

export function checklistComplete(checklist: Record<string, boolean>) {
  return Object.values(checklist).every(Boolean);
}

export const branchTransitions: Record<string, string[]> = {
  DRAFT: ["PENDING_REVIEW", "ARCHIVED"],
  PENDING_REVIEW: ["APPROVED", "REJECTED", "DRAFT"],
  APPROVED: ["SUSPENDED", "ARCHIVED"],
  REJECTED: ["DRAFT", "PENDING_REVIEW", "ARCHIVED"],
  SUSPENDED: ["APPROVED", "ARCHIVED"],
  ARCHIVED: [],
};
