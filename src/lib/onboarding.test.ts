import { describe, expect, it } from "vitest";
import { branchChecklist, branchTransitions, checklistComplete } from "./onboarding";

const tenant = {
  legalName: "Operyx Test Salon Private Limited",
  gstin: "29AABCV1234F1Z5",
  panNumber: "AABCV1234F",
};
const branch = {
  phone: "+919900001406",
  email: "owner@example.com",
  address: "100 Feet Road",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560038",
  policies: { cancellationHours: 4 },
};

describe("branch onboarding", () => {
  it("requires every document and salon media before approval", () => {
    const checklist = branchChecklist({
      tenant: tenant as never,
      branch: branch as never,
      documents: ["GST_CERTIFICATE", "PAN_CARD", "ADDRESS_PROOF", "BANK_PROOF"].map((type) => ({ type, status: "APPROVED" })) as never,
      serviceCount: 1,
      operatingHourCount: 7,
    });
    expect(checklist.requiredDocuments).toBe(true);
    expect(checklist.salonMedia).toBe(false);
    expect(checklistComplete(checklist)).toBe(false);
  });

  it("is complete when profile, hours, services, and evidence are approved", () => {
    const checklist = branchChecklist({
      tenant: tenant as never,
      branch: branch as never,
      documents: ["GST_CERTIFICATE", "PAN_CARD", "ADDRESS_PROOF", "BANK_PROOF", "SALON_MEDIA"].map((type) => ({ type, status: "APPROVED" })) as never,
      serviceCount: 2,
      operatingHourCount: 7,
    });
    expect(checklistComplete(checklist)).toBe(true);
  });

  it("does not allow rejected branches to publish without resubmission", () => {
    expect(branchTransitions.REJECTED).toEqual(["DRAFT", "PENDING_REVIEW", "ARCHIVED"]);
    expect(branchTransitions.REJECTED).not.toContain("APPROVED");
  });
});
