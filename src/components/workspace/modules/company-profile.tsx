"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AlertTriangle, Building2, CheckCircle2, Plus, Store } from "lucide-react";
import type { WorkspaceData } from "@/lib/operations-types";
import { isValidGstinFormat, stateFromGstin } from "@/lib/gst";

import { queryWorkspace } from "@/components/workspace/client";
import { SubmitFn } from "@/components/workspace/contracts";
import { Card, Empty, SlotMessage, WorkspaceSelect } from "@/components/workspace/shared-ui";

type Registration = {
  id: string;
  gstin: string;
  state: string;
  stateCode: string;
  address: string | null;
  isActive: boolean;
};

type Entity = {
  id: string;
  type: "COMPANY" | "FRANCHISEE";
  name: string;
  legalName: string;
  panNumber: string | null;
  cin: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  isActive: boolean;
  registrations: Registration[];
  _count: { operatedBranches: number; ownedBranches: number };
};

type CompanyPayload = {
  entities: Entity[];
  states: Array<{ code: string; name: string }>;
};

/** A registration created by the backfill for a state with no GSTIN yet. */
function isPlaceholder(registration: Registration) {
  return registration.gstin.startsWith("UNREGISTERED");
}

export function CompanyProfileView({ data, submit }: { data: WorkspaceData; submit: SubmitFn }) {
  // `data` drives capability flags - it is not unused.
  const [payload, setPayload] = useState<CompanyPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editingEntity, setEditingEntity] = useState<Entity | null>(null);
  const [addingFranchisee, setAddingFranchisee] = useState(false);
  const [addingRegistrationFor, setAddingRegistrationFor] = useState<Entity | null>(null);
  const [gstinInput, setGstinInput] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setPayload(await queryWorkspace<CompanyPayload>("/api/v1/operations/company"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load company profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function saveEntity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = {
      type: addingFranchisee ? "FRANCHISEE" : (editingEntity?.type ?? "COMPANY"),
      name: String(form.get("name") || "").trim(),
      legalName: String(form.get("legalName") || "").trim(),
      panNumber: String(form.get("panNumber") || "").trim() || null,
      cin: String(form.get("cin") || "").trim() || null,
      email: String(form.get("email") || "").trim() || null,
      phone: String(form.get("phone") || "").trim() || null,
    };

    const result = editingEntity
      ? await submit("/api/v1/operations/company", { id: editingEntity.id, kind: "entity", patch: values }, "Saved.", "PATCH", false)
      : await submit("/api/v1/operations/company", values, "Business added.", "POST", false);

    if (result.ok) {
      setEditingEntity(null);
      setAddingFranchisee(false);
      await load();
    } else {
      setError(result.error);
    }
  }

  async function saveRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!addingRegistrationFor) return;
    const form = new FormData(event.currentTarget);
    const gstin = String(form.get("gstin") || "").trim().toUpperCase();
    const derivedState = stateFromGstin(gstin);

    if (!isValidGstinFormat(gstin)) {
      return setError("That does not look like a valid GSTIN. It is 15 characters, and the first two are the state code.");
    }

    const result = await submit("/api/v1/operations/company", {
      kind: "registration",
      legalEntityId: addingRegistrationFor.id,
      gstin,
      // The GSTIN carries its own state. There is nothing for the owner to choose, and nothing to
      // get wrong - so we do not ask.
      state: derivedState,
      address: String(form.get("address") || "").trim() || null,
    }, "GST registration added.", "POST", false);

    if (result.ok) {
      setAddingRegistrationFor(null);
      setGstinInput("");
      await load();
    } else {
      setError(result.error);
    }
  }

  const entities = payload?.entities || [];
  const company = entities.find((entity) => entity.isPrimary);
  const franchisees = entities.filter((entity) => !entity.isPrimary);
  const gstinState = gstinInput.length >= 2 ? stateFromGstin(gstinInput) : null;

  // The state-wise registration model only needs explaining once it bites: a second state, or a
  // franchisee with registrations of its own.
  const showsRegistrationDetail = data.identity.capabilities.hasMultipleStates
    || data.identity.capabilities.hasFranchises
    || (company?.registrations.length ?? 0) > 1;

  if (loading && !payload) return <SlotMessage text="Loading company profile..." loading />;

  return <div className="space-y-4">
    {error && <p className="flex items-start gap-2 rounded-2xl border border-[#e9c2b9] bg-[#fff0ec] p-3 text-sm font-bold text-[#984f43]"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}</p>}

    <Card title="Your company" action={<button type="button" onClick={() => { setEditingEntity(company ?? null); setAddingFranchisee(false); }} className="rounded-full border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-extrabold text-[#173279]">Edit</button>}>
      {company ? <div className="grid gap-4 sm:grid-cols-2">
        <Detail label="Trading name" value={company.name} />
        <Detail label="Legal name (on invoices)" value={company.legalName} />
        <Detail label="PAN" value={company.panNumber || "Not set"} muted={!company.panNumber} />
        <Detail label="CIN" value={company.cin || "Not set"} muted={!company.cin} />
      </div> : <Empty text="No company profile yet. Run the entity backfill." />}
    </Card>

    {(editingEntity || addingFranchisee) && <Card title={addingFranchisee ? "Add a franchisee" : "Edit business"}>
      <form onSubmit={saveEntity} className="grid gap-3 sm:grid-cols-2">
        {addingFranchisee && <p className="sm:col-span-2 rounded-2xl border border-[#cadced] bg-[#eef5fc] p-3 text-xs font-bold text-[#315d89]">
          A franchisee is a separate registered business. Its invoices are issued in its own name, under its own GSTIN, and its sales are not your company&apos;s revenue.
        </p>}
        <label className="text-xs font-bold text-[#737174]">Trading name<input name="name" required defaultValue={editingEntity?.name || ""} className="field mt-1" placeholder="Lumiere Studio" /></label>
        <label className="text-xs font-bold text-[#737174]">Legal name<input name="legalName" required defaultValue={editingEntity?.legalName || ""} className="field mt-1" placeholder="Lumiere Beauty Pvt Ltd" /></label>
        <label className="text-xs font-bold text-[#737174]">PAN<input name="panNumber" defaultValue={editingEntity?.panNumber || ""} className="field mt-1 uppercase" placeholder="ABCDE1234F" /></label>
        <label className="text-xs font-bold text-[#737174]">CIN<input name="cin" defaultValue={editingEntity?.cin || ""} className="field mt-1" placeholder="Optional" /></label>
        <label className="text-xs font-bold text-[#737174]">Email<input name="email" type="email" defaultValue={editingEntity?.email || ""} className="field mt-1" /></label>
        <label className="text-xs font-bold text-[#737174]">Phone<input name="phone" defaultValue={editingEntity?.phone || ""} className="field mt-1" /></label>
        <div className="flex gap-2 sm:col-span-2">
          <button type="submit" className="primary justify-center">Save</button>
          <button type="button" onClick={() => { setEditingEntity(null); setAddingFranchisee(false); }} className="rounded-xl border border-[#E5E7EB] bg-white px-4 py-2.5 text-sm font-extrabold text-[#737174]">Cancel</button>
        </div>
      </form>
    </Card>}

    {entities.map((entity) => <Card
      key={entity.id}
      title={showsRegistrationDetail ? `GST registrations - ${entity.name}` : "GST"}
      action={<button type="button" onClick={() => { setAddingRegistrationFor(entity); setGstinInput(""); }} className="primary"><Plus size={15} /> Add GSTIN</button>}
    >
      {/* A salon in one state has one GSTIN and does not need to be taught that registration is
          state-wise. The explanation appears only when it starts to matter - a second state, or a
          franchisee with its own registrations. */}
      {showsRegistrationDetail && <p className="-mt-2 mb-4 text-sm font-semibold text-[#737174]">
        GST registration is state-wise: one GSTIN per state. Branches in the same state share one; a branch in another state needs its own.
      </p>}

      {addingRegistrationFor?.id === entity.id && <form onSubmit={saveRegistration} className="mb-4 grid gap-3 rounded-2xl border border-[#DDE7EF] bg-[#F7FAFC] p-4 sm:grid-cols-2">
        <label className="text-xs font-bold text-[#737174]">
          GSTIN
          <input
            name="gstin"
            required
            value={gstinInput}
            onChange={(event) => setGstinInput(event.target.value.toUpperCase())}
            maxLength={15}
            className="field mt-1 font-mono uppercase"
            placeholder="29AABCU9603R1ZM"
          />
          {/* The state is read from the GSTIN, not chosen. Its first two digits are the state code,
              so asking the owner to pick a state would only create a way to get it wrong. */}
          <span className={`mt-1 block text-xs font-bold ${gstinState ? "text-[#0f6f57]" : "text-[#737174]"}`}>
            {gstinState ? `State: ${gstinState}` : "The state is read from the first two digits."}
          </span>
        </label>
        <label className="text-xs font-bold text-[#737174]">Principal place of business<input name="address" className="field mt-1" placeholder="Registered address in this state" /></label>
        <div className="flex gap-2 sm:col-span-2">
          <button type="submit" disabled={!isValidGstinFormat(gstinInput)} className="primary justify-center disabled:opacity-45">Add registration</button>
          <button type="button" onClick={() => setAddingRegistrationFor(null)} className="rounded-xl border border-[#E5E7EB] bg-white px-4 py-2.5 text-sm font-extrabold text-[#737174]">Cancel</button>
        </div>
      </form>}

      {entity.registrations.length ? <div className="grid gap-2">
        {entity.registrations.map((registration) => <div key={registration.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 ${isPlaceholder(registration) ? "border-[#ecd7a7] bg-[#fff7df]" : "border-[#E5E7EB] bg-white"}`}>
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-extrabold">
              {isPlaceholder(registration) ? <AlertTriangle size={14} className="shrink-0 text-[#865c12]" /> : <CheckCircle2 size={14} className="shrink-0 text-[#0f6f57]" />}
              <span className="truncate">{registration.state}</span>
              <span className="rounded-full bg-[#F7FAFC] px-2 py-0.5 text-[10px] text-[#737174]">{registration.stateCode}</span>
            </p>
            <p className={`mt-1 font-mono text-xs font-bold ${isPlaceholder(registration) ? "text-[#865c12]" : "text-[#737174]"}`}>
              {isPlaceholder(registration) ? "No GSTIN yet - branches in this state cannot issue GST invoices" : registration.gstin}
            </p>
          </div>
        </div>)}
      </div> : <Empty text="No GST registrations yet." />}
    </Card>)}

    {/* Until you actually franchise, this is a concept you do not need. It stays a single quiet
        line rather than a section of the app. */}
    {!franchisees.length && !addingFranchisee ? <p className="px-1 text-xs font-semibold text-[#9a938b]">
      Franchising this brand?{" "}
      <button type="button" onClick={() => { setAddingFranchisee(true); setEditingEntity(null); }} className="font-extrabold text-[#5B2A86] underline underline-offset-2">
        Add a franchisee
      </button>{" "}
      to let a separate business run a branch under its own GSTIN.
    </p> : <Card
      title="Franchisees"
      action={<button type="button" onClick={() => { setAddingFranchisee(true); setEditingEntity(null); }} className="primary"><Plus size={15} /> Add franchisee</button>}
    >
      <p className="-mt-2 mb-4 text-sm font-semibold text-[#737174]">Separate businesses operating under your brand. A franchisee that runs its own branch bills under its own GSTIN.</p>
      {franchisees.length ? <div className="grid gap-3 md:grid-cols-2">
        {franchisees.map((entity) => <div key={entity.id} className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 font-extrabold"><Store size={14} className="shrink-0 text-[#1789AA]" /><span className="truncate">{entity.name}</span></p>
              <p className="mt-0.5 truncate text-xs text-[#737174]">{entity.legalName}</p>
            </div>
            <button type="button" onClick={() => { setEditingEntity(entity); setAddingFranchisee(false); }} className="shrink-0 rounded-full border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-extrabold text-[#173279]">Edit</button>
          </div>
          <p className="mt-3 border-t border-[#E5E7EB] pt-3 text-xs font-bold text-[#737174]">
            Operates {entity._count.operatedBranches} branch{entity._count.operatedBranches === 1 ? "" : "es"} - {entity.registrations.length} GST registration{entity.registrations.length === 1 ? "" : "s"}
          </p>
        </div>)}
      </div> : <Empty text="No franchisees yet. Every branch is operated by your company." />}
    </Card>}
  </div>;
}

function Detail({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return <div className="rounded-2xl bg-[#F7FAFC] p-3">
    <p className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[#737174]">{label}</p>
    <p className={`mt-1 font-bold ${muted ? "text-[#9a938b]" : "text-[#1F2937]"}`}>{value}</p>
  </div>;
}

export { Building2 };
