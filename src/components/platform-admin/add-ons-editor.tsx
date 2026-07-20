"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { inr } from "@/lib/format";
import { useToast } from "./toast";

/**
 * The other half of the catalogue.
 *
 * A plan sets a base; these extend it without a tier change. The whole reason they exist is that
 * "you have run out of appointments, buy the ₹12,000 plan" is not an offer a salon with five
 * branches will accept - and a limit that can only be escaped by a tier change is a reason to leave
 * rather than a reason to spend.
 */

type AddOn = {
  id: string; code: string; name: string; description: string | null;
  limitField: string | null; unitAmount: number; unitPrice: number;
  isMetered: boolean; isActive: boolean; sortOrder: number; subscribers: number;
};

const LIMIT_LABEL: Record<string, string> = {
  maxBranches: "branches",
  maxStaff: "staff seats",
  maxServices: "services",
  maxMonthlyAppointments: "bookings a month",
};

export function AddOnsEditor({ addOns }: { addOns: AddOn[] }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>, addOn: AddOn | null) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const limitField = String(form.get("limitField") || "");

    setBusy(true); setError("");
    const response = await fetch("/api/v1/admin/add-ons", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: addOn?.id,
        code: String(form.get("code") || ""),
        name: String(form.get("name") || ""),
        description: String(form.get("description") || "") || undefined,
        limitField: limitField || null,
        unitAmount: Number(form.get("unitAmount") || 1),
        unitPriceRupees: Number(form.get("unitPrice") || 0),
        isMetered: form.get("isMetered") === "on",
        isActive: form.get("isActive") === "on",
        sortOrder: Number(form.get("sortOrder") || 0),
      }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(result.error?.message ?? "Unable to save add-on");
    // In-place refresh: the list updates without a white flash or lost scroll.
    setEditing(null);
    if (!addOn) formElement.reset();
    toast(addOn ? `${addOn.name} saved.` : "Add-on created.");
    router.refresh();
  }

  return <div className="space-y-4">
    {error && <div className="rounded-2xl bg-[#FDECEC] p-4 text-sm font-bold text-[#94302E]">{error}</div>}

    {addOns.map((addOn) => <section key={addOn.id} className="rounded-2xl border border-[#EFEAF3] bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-serif text-2xl">{addOn.name}</h3>
            {!addOn.isActive && <span className="rounded-full bg-[#F7F6F9] px-2 py-0.5 text-[10px] font-bold uppercase text-[#9CA3AF]">Retired</span>}
            {addOn.isMetered && <span className="rounded-full bg-[#FFF7DF] px-2 py-0.5 text-[10px] font-bold uppercase text-[#865C12]">Metered</span>}
          </div>
          <p className="mt-0.5 text-sm text-[#737174]">
            {inr.format(addOn.unitPrice)}/mo for +{addOn.unitAmount.toLocaleString("en-IN")}
            {addOn.limitField ? ` ${LIMIT_LABEL[addOn.limitField] ?? addOn.limitField}` : " credits"}
          </p>
          <p className="mt-0.5 text-xs text-[#9CA3AF]">
            {addOn.subscribers} subscription{addOn.subscribers === 1 ? "" : "s"} · {addOn.code}
          </p>
        </div>
        <button onClick={() => setEditing(editing === addOn.id ? null : addOn.id)} className="rounded-full border border-[#E3D9EE] px-4 py-2 text-sm font-bold text-[#5B2A86] transition hover:bg-[#F3E8FF]">
          {editing === addOn.id ? "Cancel" : "Edit"}
        </button>
      </div>

      {editing === addOn.id && <form onSubmit={(event) => void save(event, addOn)} className="mt-5 border-t border-[#EFEAF3] pt-5">
        <Fields addOn={addOn} />
        <button disabled={busy} className="primary mt-5">Save add-on</button>
      </form>}
    </section>)}

    <details className="rounded-2xl border border-dashed border-[#D9C7EA] bg-white p-6">
      <summary className="cursor-pointer text-sm font-bold text-[#5B2A86]"><Plus size={14} className="mr-1 inline" />New add-on</summary>
      <form onSubmit={(event) => void save(event, null)} className="mt-5 border-t border-[#EFEAF3] pt-5">
        <Fields addOn={null} />
        <button disabled={busy} className="primary mt-5">Create add-on</button>
      </form>
    </details>
  </div>;
}

function Fields({ addOn }: { addOn: AddOn | null }) {
  return <>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field name="name" label="Name" defaultValue={addOn?.name ?? ""} />
      <Field name="code" label="Code" defaultValue={addOn?.code ?? ""} readOnly={Boolean(addOn)} />
      <Field name="unitAmount" label="One pack adds" type="number" defaultValue={addOn?.unitAmount ?? 500} />
      <Field name="unitPrice" label="Price per pack ₹" type="number" defaultValue={addOn?.unitPrice ?? 500} />
      <label className="text-sm font-bold">Extends
        <select name="limitField" defaultValue={addOn?.limitField ?? ""} className="field mt-2">
          <option value="">Nothing — it&apos;s metered</option>
          {Object.entries(LIMIT_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <Field name="sortOrder" label="Order" type="number" defaultValue={addOn?.sortOrder ?? 0} />
      <label className="text-sm font-bold sm:col-span-2">Description<input name="description" defaultValue={addOn?.description ?? ""} className="field mt-2" /></label>
    </div>
    <div className="mt-3 flex flex-wrap gap-5">
      <label className="flex items-center gap-2 text-sm font-bold">
        <input name="isMetered" type="checkbox" defaultChecked={addOn?.isMetered ?? false} /> Metered (consumed, not a ceiling)
      </label>
      <label className="flex items-center gap-2 text-sm font-bold">
        <input name="isActive" type="checkbox" defaultChecked={addOn?.isActive ?? true} /> Available to sell
      </label>
    </div>
  </>;
}

function Field({ name, label, type = "text", defaultValue, readOnly }: { name: string; label: string; type?: string; defaultValue: string | number; readOnly?: boolean }) {
  return <label className="text-sm font-bold">{label}
    <input name={name} type={type} defaultValue={defaultValue} readOnly={readOnly} required className={`field mt-2 ${readOnly ? "bg-[#F7F6F9] text-[#9CA3AF]" : ""}`} />
    {/* The code is how a quote refers to this add-on. Changing it would orphan every saved quote. */}
    {readOnly && <span className="mt-1 block text-[11px] font-normal text-[#9CA3AF]">Fixed — saved quotes refer to it.</span>}
  </label>;
}
