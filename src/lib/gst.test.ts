import { describe, expect, it } from "vitest";
import {
  isValidGstinFormat,
  splitGst,
  stateCodeForState,
  stateCodeFromGstin,
  stateFromGstin,
  supplierEntityIdForBranch,
  validateBranchRegistration,
} from "./gst";

// Well-formed sample GSTINs. Karnataka is 29, Maharashtra 27.
const KARNATAKA_GSTIN = "29AABCU9603R1ZM";
const MAHARASHTRA_GSTIN = "27AABCU9603R1ZX";

describe("isValidGstinFormat", () => {
  it("accepts a well-formed GSTIN", () => {
    expect(isValidGstinFormat(KARNATAKA_GSTIN)).toBe(true);
  });

  it("rejects the wrong length", () => {
    expect(isValidGstinFormat("29AABCU9603R1Z")).toBe(false);
  });

  it("rejects an unknown state code", () => {
    // 99 is not a real GST state code.
    expect(isValidGstinFormat("99AABCU9603R1ZM")).toBe(false);
  });

  it("rejects a GSTIN without the fixed Z in position 14", () => {
    expect(isValidGstinFormat("29AABCU9603R1AM")).toBe(false);
  });

  it("is case insensitive and tolerates whitespace", () => {
    expect(isValidGstinFormat(` ${KARNATAKA_GSTIN.toLowerCase()} `)).toBe(true);
  });
});

describe("state codes", () => {
  it("reads the state from the GSTIN's first two digits", () => {
    expect(stateCodeFromGstin(KARNATAKA_GSTIN)).toBe("29");
    expect(stateFromGstin(KARNATAKA_GSTIN)).toBe("Karnataka");
    expect(stateFromGstin(MAHARASHTRA_GSTIN)).toBe("Maharashtra");
  });

  it("maps a state name back to its code", () => {
    expect(stateCodeForState("Karnataka")).toBe("29");
    expect(stateCodeForState("  maharashtra ")).toBe("27");
  });

  it("returns null for a state it does not know", () => {
    expect(stateCodeForState("Atlantis")).toBeNull();
  });
});

describe("splitGst", () => {
  it("splits an intra-state supply into equal CGST and SGST", () => {
    const split = splitGst(360, "29", "29");
    expect(split).toMatchObject({ kind: "INTRA_STATE", cgst: 180, sgst: 180, igst: 0 });
  });

  it("charges IGST on an inter-state supply", () => {
    const split = splitGst(360, "29", "27");
    expect(split).toMatchObject({ kind: "INTER_STATE", cgst: 0, sgst: 0, igst: 360 });
  });

  it("keeps the halves adding back to the original when the tax is an odd number of paise", () => {
    const split = splitGst(0.05, "29", "29");
    expect(Number((split.cgst + split.sgst).toFixed(2))).toBe(0.05);
  });

  it("handles a zero-rated line", () => {
    expect(splitGst(0, "29", "29")).toMatchObject({ cgst: 0, sgst: 0, igst: 0 });
  });
});

describe("supplierEntityIdForBranch", () => {
  it("names the operator as the supplier - the whole billing rule", () => {
    // FOFO: franchisee owns and operates, so the franchisee invoices.
    expect(supplierEntityIdForBranch({ ownerEntityId: "franchisee", operatorEntityId: "franchisee" })).toBe("franchisee");
    // FOCO: franchisee owns, company operates, so the COMPANY invoices.
    expect(supplierEntityIdForBranch({ ownerEntityId: "franchisee", operatorEntityId: "company" })).toBe("company");
    // COCO.
    expect(supplierEntityIdForBranch({ ownerEntityId: "company", operatorEntityId: "company" })).toBe("company");
  });

  it("falls back to the owner when no operator is set", () => {
    expect(supplierEntityIdForBranch({ ownerEntityId: "company", operatorEntityId: null })).toBe("company");
  });
});

describe("validateBranchRegistration", () => {
  const registration = { legalEntityId: "entity_1", state: "Karnataka", gstin: KARNATAKA_GSTIN, stateCode: "29" };

  it("accepts a registration in the branch's own state, owned by the operator", () => {
    const result = validateBranchRegistration({ branchState: "Karnataka", registration, operatorEntityId: "entity_1" });
    expect(result.ok).toBe(true);
  });

  it("rejects a registration from another state - registration is state-wise", () => {
    const result = validateBranchRegistration({ branchState: "Maharashtra", registration, operatorEntityId: "entity_1" });
    expect(result.ok).toBe(false);
  });

  it("rejects a registration belonging to a different business", () => {
    const result = validateBranchRegistration({ branchState: "Karnataka", registration, operatorEntityId: "entity_2" });
    expect(result.ok).toBe(false);
  });

  it("rejects a GSTIN whose state code contradicts its state", () => {
    const wrong = { ...registration, gstin: MAHARASHTRA_GSTIN };
    const result = validateBranchRegistration({ branchState: "Karnataka", registration: wrong, operatorEntityId: "entity_1" });
    expect(result.ok).toBe(false);
  });

  it("rejects a branch with no registration at all", () => {
    const result = validateBranchRegistration({ branchState: "Karnataka", registration: null, operatorEntityId: "entity_1" });
    expect(result).toMatchObject({ ok: false });
  });
});
