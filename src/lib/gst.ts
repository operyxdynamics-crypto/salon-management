/**
 * Indian GST rules, as pure functions.
 *
 * Two facts drive everything here:
 *
 * 1. Registration is state-wise. One legal entity gets one GSTIN per state. Branches in the same
 *    state share a registration; a branch in another state needs its own, and that is mandatory.
 *
 * 2. The first two digits of a GSTIN are the state code. So a GSTIN carries its own state, and a
 *    registration whose state code disagrees with its GSTIN is invalid data.
 */

/** GST state codes. The first two digits of every GSTIN. */
export const GST_STATE_CODES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
};

/**
 * A GSTIN is 15 characters: 2 state code, 10 PAN, 1 entity number, 1 "Z", 1 checksum.
 * This validates the shape and the state code. It does not verify the checksum against the GST
 * portal, so a well-formed but fictional GSTIN will pass.
 */
export function isValidGstinFormat(gstin: string) {
  const value = gstin.trim().toUpperCase();
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(value)) return false;
  return Boolean(GST_STATE_CODES[value.slice(0, 2)]);
}

/** The state a GSTIN belongs to, read from its first two digits. */
export function stateCodeFromGstin(gstin: string) {
  return gstin.trim().slice(0, 2);
}

export function stateFromGstin(gstin: string) {
  return GST_STATE_CODES[stateCodeFromGstin(gstin)] ?? null;
}

export function stateCodeForState(state: string) {
  const match = Object.entries(GST_STATE_CODES).find(([, name]) => name.toLowerCase() === state.trim().toLowerCase());
  return match ? match[0] : null;
}

export type GstSplit = { kind: "INTRA_STATE"; cgst: number; sgst: number; igst: 0 } | { kind: "INTER_STATE"; cgst: 0; sgst: 0; igst: number };

/**
 * Split a tax amount into CGST/SGST or IGST.
 *
 * Intra-state supply (the supplier and the place of supply are in the same state) splits the tax
 * equally into CGST and SGST. Inter-state supply is a single IGST charge. For a salon the service
 * is performed on its own premises, so it is always intra-state - but a product posted to another
 * state would not be, and hardcoding the split would then be wrong.
 *
 * The halves are rounded so they add back to the original exactly; any stray paisa lands on CGST.
 */
export function splitGst(tax: number, supplierStateCode: string, placeOfSupplyStateCode: string): GstSplit {
  const total = Number(tax.toFixed(2));
  if (total <= 0) {
    return supplierStateCode === placeOfSupplyStateCode
      ? { kind: "INTRA_STATE", cgst: 0, sgst: 0, igst: 0 }
      : { kind: "INTER_STATE", cgst: 0, sgst: 0, igst: 0 };
  }

  if (supplierStateCode !== placeOfSupplyStateCode) {
    return { kind: "INTER_STATE", cgst: 0, sgst: 0, igst: total };
  }

  const sgst = Number((total / 2).toFixed(2));
  const cgst = Number((total - sgst).toFixed(2));
  return { kind: "INTRA_STATE", cgst, sgst, igst: 0 };
}

/**
 * Which legal entity supplies a branch's sales - and therefore whose name and GSTIN goes on the
 * invoice.
 *
 * The operator is the supplier. That is the entire rule:
 *   COCO - company owns, company operates  -> company invoices
 *   FOCO - franchisee owns, company operates -> company invoices
 *   FOFO - franchisee owns and operates      -> franchisee invoices
 */
export function supplierEntityIdForBranch(branch: { operatorEntityId?: string | null; ownerEntityId?: string | null }) {
  return branch.operatorEntityId ?? branch.ownerEntityId ?? null;
}

/**
 * A branch's registration must belong to its operator and sit in the branch's own state. Getting
 * this wrong means invoicing under the wrong GSTIN, which is the mistake people actually make.
 */
export function validateBranchRegistration({ branchState, registration, operatorEntityId }: {
  branchState: string;
  registration: { legalEntityId: string; state: string; gstin: string; stateCode: string } | null;
  operatorEntityId: string | null;
}): { ok: true } | { ok: false; reason: string } {
  if (!registration) return { ok: false, reason: "This branch has no GST registration assigned." };

  if (operatorEntityId && registration.legalEntityId !== operatorEntityId) {
    return { ok: false, reason: "The GST registration belongs to a different business than the one operating this branch." };
  }

  if (registration.state.trim().toLowerCase() !== branchState.trim().toLowerCase()) {
    return {
      ok: false,
      reason: `This branch is in ${branchState}, but the registration is for ${registration.state}. GST registration is state-wise - the branch needs a registration in its own state.`,
    };
  }

  if (stateCodeFromGstin(registration.gstin) !== registration.stateCode) {
    return { ok: false, reason: "The GSTIN does not start with the state code for its state." };
  }

  return { ok: true };
}
