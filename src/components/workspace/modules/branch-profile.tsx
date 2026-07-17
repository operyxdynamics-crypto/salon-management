"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { WorkspaceData } from "@/lib/operations-types";

import { queryWorkspace } from "@/components/workspace/client";
import { SubmitFn } from "@/components/workspace/contracts";
import { Card, Empty, SlotMessage, WorkspaceSelect } from "@/components/workspace/shared-ui";

type Entity = {
  id: string;
  name: string;
  legalName: string;
  type: "COMPANY" | "FRANCHISEE";
  registrations: Array<{ id: string; gstin: string; state: string; stateCode: string }>;
};

type BranchPayload = {
  branch: {
    id: string;
    name: string;
    /// The branch's invoice series code. Null until it is set; billing is blocked without it.
    invoiceCode: string | null;
    phone: string | null;
    email: string | null;
    address: string;
    city: string;
    state: string;
    postalCode: string;
    ownershipModel: "COCO" | "FOCO" | "FOFO";
    ownerEntityId: string | null;
    operatorEntityId: string | null;
    gstRegistrationId: string | null;
  };
  entities: Entity[];
  gstStatus: { ok: boolean; reason: string | null };
};

const OWNERSHIP = [
  { value: "COCO", label: "Company owned, company operated", description: "You own it and you run it. Your company invoices." },
  { value: "FOCO", label: "Franchise owned, company operated", description: "A franchisee funded it, you run it. Your company still invoices." },
  { value: "FOFO", label: "Franchise owned, franchise operated", description: "The franchisee owns and runs it, and invoices under its own GSTIN. Its sales are not your revenue." },
];

export function BranchProfileView({ data, submit }: { data: WorkspaceData; submit: SubmitFn }) {
  const [payload, setPayload] = useState<BranchPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ownershipModel, setOwnershipModel] = useState<"COCO" | "FOCO" | "FOFO">("COCO");
  const [ownerEntityId, setOwnerEntityId] = useState("");
  const [operatorEntityId, setOperatorEntityId] = useState("");
  const [gstRegistrationId, setGstRegistrationId] = useState("");
  const branchId = data.identity.branchId || "";

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setError("");
    try {
      const result = await queryWorkspace<BranchPayload>(`/api/v1/operations/branches/${branchId}`);
      setPayload(result);
      setOwnershipModel(result.branch.ownershipModel);
      setOwnerEntityId(result.branch.ownerEntityId || "");
      setOperatorEntityId(result.branch.operatorEntityId || "");
      setGstRegistrationId(result.branch.gstRegistrationId || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load branch");
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await submit(`/api/v1/operations/branches/${branchId}`, {
      name: String(form.get("name") || "").trim(),
      invoiceCode: String(form.get("invoiceCode") || "").trim().toUpperCase(),
      phone: String(form.get("phone") || "").trim() || null,
      email: String(form.get("email") || "").trim() || null,
      address: String(form.get("address") || "").trim(),
      city: String(form.get("city") || "").trim(),
      state: String(form.get("state") || "").trim(),
      postalCode: String(form.get("postalCode") || "").trim(),
      ownershipModel,
      ownerEntityId: ownerEntityId || null,
      operatorEntityId: operatorEntityId || null,
      gstRegistrationId: gstRegistrationId || null,
    }, "Branch saved.", "PATCH", false);

    if (result.ok) await load();
    else setError(result.error);
  }

  if (!branchId) return <Card title="Branch"><Empty text="Select a specific branch to edit its profile." /></Card>;
  if (loading && !payload) return <SlotMessage text="Loading branch..." loading />;
  if (!payload) return <Empty text="Branch not found." />;

  const { branch, entities, gstStatus } = payload;

  // The operator is the supplier. Only its registrations can be used to bill at this branch.
  const operator = entities.find((entity) => entity.id === operatorEntityId);
  const availableRegistrations = operator?.registrations ?? [];
  const selectedRegistration = availableRegistrations.find((registration) => registration.id === gstRegistrationId);

  // Registration is state-wise, so a registration from another state cannot be used here. This is
  // the mistake people actually make, so warn on it live rather than only on save.
  const stateMismatch = Boolean(selectedRegistration && selectedRegistration.state.trim().toLowerCase() !== branch.state.trim().toLowerCase());
  const noRegistrationInState = Boolean(operator && !availableRegistrations.some((registration) => registration.state.trim().toLowerCase() === branch.state.trim().toLowerCase()));

  return <div className="space-y-4">
    {error && <p className="flex items-start gap-2 rounded-2xl border border-[#e9c2b9] bg-[#fff0ec] p-3 text-sm font-bold text-[#984f43]"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}</p>}

    {!gstStatus.ok && <p className="flex items-start gap-2 rounded-2xl border border-[#ecd7a7] bg-[#fff7df] p-3 text-sm font-bold text-[#865c12]">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      {gstStatus.reason} GST invoices are blocked at this branch until it is fixed.
    </p>}

    <form onSubmit={save} className="space-y-4">
      <Card title="Branch details">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-[#737174]">Branch name<input name="name" required defaultValue={branch.name} className="field mt-1" /></label>
          {/* This is what keeps this branch's bills apart from every other branch's. */}
          <label className="text-xs font-bold text-[#737174]">
            Invoice code
            <input name="invoiceCode" required maxLength={4} defaultValue={branch.invoiceCode || ""} placeholder="WHF" className="field mt-1 uppercase" />
            <span className="mt-1 block font-medium normal-case text-[#9CA3AF]">Up to 4 letters, unique to this branch. Bills here read {branch.invoiceCode || "WHF"}/2526/00001.</span>
          </label>
          <label className="text-xs font-bold text-[#737174]">Phone<input name="phone" defaultValue={branch.phone || ""} className="field mt-1" /></label>
          <label className="text-xs font-bold text-[#737174]">Email<input name="email" type="email" defaultValue={branch.email || ""} className="field mt-1" /></label>
          <label className="text-xs font-bold text-[#737174]">Postal code<input name="postalCode" defaultValue={branch.postalCode} className="field mt-1" /></label>
          <label className="text-xs font-bold text-[#737174] sm:col-span-2">Address<input name="address" required defaultValue={branch.address} className="field mt-1" /></label>
          <label className="text-xs font-bold text-[#737174]">City<input name="city" required defaultValue={branch.city} className="field mt-1" /></label>
          <label className="text-xs font-bold text-[#737174]">
            State
            <input name="state" required defaultValue={branch.state} className="field mt-1" />
            <span className="mt-1 block text-xs font-semibold text-[#737174]">Decides which GST registration this branch can bill under.</span>
          </label>
        </div>
      </Card>

    {/* Ownership only exists as a question once there is someone other than you who could own or
        run a branch. Until a franchisee is added in Settings > Company, this whole section is a
        concept the owner does not need to hold in their head. */}
    {(data.identity.capabilities.hasFranchises || branch.ownershipModel !== "COCO") && <>
      <Card title="Ownership">
        <div className="grid gap-2">
          {OWNERSHIP.map((option) => <button
            key={option.value}
            type="button"
            onClick={() => setOwnershipModel(option.value as typeof ownershipModel)}
            className={`rounded-2xl border p-4 text-left transition ${ownershipModel === option.value ? "border-[#173279] bg-[#eef5fc]" : "border-[#E5E7EB] bg-white hover:border-[#16B994]/50"}`}
          >
            <p className="flex items-center gap-2 text-sm font-extrabold text-[#1F2937]">
              {ownershipModel === option.value && <CheckCircle2 size={15} className="shrink-0 text-[#173279]" />}
              {option.label}
            </p>
            <p className="mt-1 text-xs font-semibold text-[#737174]">{option.description}</p>
          </button>)}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <WorkspaceSelect
            label="Owned by"
            value={ownerEntityId}
            onChange={setOwnerEntityId}
            options={[{ value: "", label: "Not set" }, ...entities.map((entity) => ({ value: entity.id, label: entity.name, description: entity.type === "COMPANY" ? "Your company" : "Franchisee" }))]}
          />
          <WorkspaceSelect
            label="Operated by (issues the invoices)"
            value={operatorEntityId}
            onChange={(value) => { setOperatorEntityId(value); setGstRegistrationId(""); }}
            options={[{ value: "", label: "Not set" }, ...entities.map((entity) => ({ value: entity.id, label: entity.name, description: entity.type === "COMPANY" ? "Your company" : "Franchisee" }))]}
          />
        </div>
        <p className="mt-2 text-xs font-semibold text-[#737174]">
          Whoever operates the branch is the supplier, so their name and GSTIN go on every bill raised here.
        </p>
      </Card>
    </>}

      <Card title="GST registration">
        <p className="-mt-2 mb-4 text-sm font-semibold text-[#737174]">
          This branch is in <strong className="text-[#1F2937]">{branch.state}</strong>. It must bill under a registration in that state.
        </p>

        {!operator ? <Empty text="Pick who operates this branch first." /> : availableRegistrations.length ? <>
          <WorkspaceSelect
            label="Bill under"
            value={gstRegistrationId}
            onChange={setGstRegistrationId}
            options={[
              { value: "", label: "No registration" },
              ...availableRegistrations.map((registration) => ({
                value: registration.id,
                label: `${registration.state} - ${registration.gstin}`,
                description: registration.state.trim().toLowerCase() === branch.state.trim().toLowerCase() ? "Matches this branch's state" : `Registered in ${registration.state}`,
              })),
            ]}
          />
          {stateMismatch && <p className="mt-3 flex items-start gap-2 rounded-2xl border border-[#e9c2b9] bg-[#fff0ec] p-3 text-xs font-bold text-[#984f43]">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            That registration is for {selectedRegistration?.state}, but this branch is in {branch.state}. GST registration is state-wise - {operator.name} needs a separate GSTIN for {branch.state}.
          </p>}
        </> : <Empty text={`${operator.name} has no GST registrations yet. Add one in Settings > Company.`} />}

        {noRegistrationInState && operator && <p className="mt-3 flex items-start gap-2 rounded-2xl border border-[#ecd7a7] bg-[#fff7df] p-3 text-xs font-bold text-[#865c12]">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {operator.name} has no GSTIN for {branch.state}. Add one in Settings &gt; Company, or bill this branch Non-GST.
        </p>}
      </Card>

      <button type="submit" disabled={stateMismatch} className="primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-45">Save branch</button>
    </form>
  </div>;
}
