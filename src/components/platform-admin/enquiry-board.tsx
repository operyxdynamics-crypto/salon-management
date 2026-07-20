"use client";

import { FormEvent, useState } from "react";
import { Plus } from "lucide-react";

type Lead = {
  id: string; salonName: string; contactName: string; phone: string; email: string | null; city: string | null;
  branchCount: number; staffCount: number; source: string | null; status: string; notes: string | null;
  interestedPlan: string | null; followUpAt: string | null;
};

const STATUSES = ["NEW", "CONTACTED", "DEMO_BOOKED", "QUOTED", "WON", "LOST"] as const;
const readable = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const day = (value: string) => new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(value));

export function EnquiryBoard({ leads, plans }: { leads: Lead[]; plans: Array<{ id: string; name: string }> }) {
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(body: unknown, method: "POST" | "PATCH") {
    setBusy(true); setError("");
    const response = await fetch("/api/v1/admin/leads", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return setError(result.error?.message ?? "Unable to save");
    window.location.reload();
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const followUp = String(form.get("followUpAt") || "");
    await send({
      salonName: form.get("salonName"), contactName: form.get("contactName"), phone: form.get("phone"),
      email: String(form.get("email") || "") || undefined,
      city: String(form.get("city") || "") || undefined,
      source: String(form.get("source") || "") || undefined,
      branchCount: Number(form.get("branchCount") || 1),
      staffCount: Number(form.get("staffCount") || 0),
      interestedPlanId: String(form.get("interestedPlanId") || "") || undefined,
      notes: String(form.get("notes") || "") || undefined,
      // Dates are entered as a local day; noon avoids a timezone shift landing it on the day before.
      followUpAt: followUp ? new Date(`${followUp}T12:00:00`).toISOString() : undefined,
    }, "POST");
  }

  const isOverdue = (lead: Lead) => Boolean(lead.followUpAt && new Date(lead.followUpAt) < new Date());

  return <div className="mt-6 space-y-5">
    <div className="flex justify-end"><button onClick={() => setAdding(!adding)} className="primary"><Plus size={15} /> Add enquiry</button></div>

    {error && <div className="rounded-2xl bg-[#FDECEC] p-4 text-sm font-bold text-[#94302E]">{error}</div>}

    {adding && <form onSubmit={create} className="rounded-2xl border border-[#EFEAF3] bg-white p-6">
      <h3 className="font-serif text-2xl">New enquiry</h3>
      <p className="mt-1 text-sm text-[#737174]">Branches and staff decide which plan to quote. Always set a follow-up date — an enquiry with no next step is one being lost.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field name="salonName" label="Salon name" />
        <Field name="contactName" label="Contact person" />
        <Field name="phone" label="Phone" />
        <Field name="email" label="Email" type="email" required={false} />
        <Field name="city" label="City" required={false} />
        <Field name="source" label="Where from" required={false} />
        <Field name="branchCount" label="Branches" type="number" required={false} defaultValue="1" />
        <Field name="staffCount" label="Staff" type="number" required={false} defaultValue="0" />
        <Field name="followUpAt" label="Follow up on" type="date" required={false} />
        <label className="text-sm font-bold">Plan discussed
          <select name="interestedPlanId" className="field mt-2"><option value="">Not yet</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select>
        </label>
        <label className="text-sm font-bold sm:col-span-2">Notes<input name="notes" className="field mt-2" /></label>
      </div>
      <button disabled={busy} className="primary mt-5">Save enquiry</button>
    </form>}

    <div className="overflow-hidden rounded-2xl border border-[#EFEAF3] bg-white">
      {leads.length ? <table className="w-full text-left text-sm">
        <thead className="bg-[#F7F6F9] text-xs uppercase tracking-wider text-[#9CA3AF]">
          <tr><th className="p-4">Salon</th><th className="p-4">Contact</th><th className="p-4">Size</th><th className="p-4">Follow up</th><th className="p-4">Status</th></tr>
        </thead>
        <tbody>{leads.map((lead) => <tr key={lead.id} className="border-t border-[#EFEAF3]">
          <td className="p-4"><strong>{lead.salonName}</strong><p className="text-xs text-[#9CA3AF]">{lead.city || "—"}{lead.source ? ` · ${lead.source}` : ""}</p></td>
          <td className="p-4">{lead.contactName}<p className="text-xs text-[#9CA3AF]">{lead.phone}</p></td>
          <td className="p-4 text-xs text-[#6B7280]">{lead.branchCount} branch · {lead.staffCount} staff{lead.interestedPlan ? <p className="font-bold text-[#5B2A86]">{lead.interestedPlan}</p> : null}</td>
          <td className="p-4 text-xs">
            {lead.followUpAt
              ? <span className={isOverdue(lead) ? "font-bold text-[#C4403E]" : ""}>{day(lead.followUpAt)}{isOverdue(lead) ? " · overdue" : ""}</span>
              : <span className="text-[#C4403E]">Not set</span>}
          </td>
          <td className="p-4">
            <select
              defaultValue={lead.status}
              disabled={busy}
              onChange={(event) => void send({ id: lead.id, status: event.target.value }, "PATCH")}
              className="rounded-lg border border-[#E5E7EB] px-2 py-1.5 text-xs font-bold"
            >
              {STATUSES.map((value) => <option key={value} value={value}>{readable(value)}</option>)}
            </select>
          </td>
        </tr>)}</tbody>
      </table> : <p className="p-12 text-center text-sm text-[#9CA3AF]">No open enquiries. Add one when a salon gets in touch.</p>}
    </div>
  </div>;
}

function Field({ name, label, type = "text", required = true, defaultValue }: { name: string; label: string; type?: string; required?: boolean; defaultValue?: string }) {
  return <label className="text-sm font-bold">{label}<input name={name} type={type} required={required} defaultValue={defaultValue} className="field mt-2" /></label>;
}
