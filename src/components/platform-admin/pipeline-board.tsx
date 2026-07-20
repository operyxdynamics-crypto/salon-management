"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, Plus, X } from "lucide-react";
import { ConvertLead } from "./convert-lead";
import { QuoteBuilder } from "./quote-builder";
import { useToast } from "./toast";

/**
 * The pipeline, laid out the way Operyx actually sells.
 *
 * Columns are the stages of a real conversation - a lead arrives, you ring them, you demo, you
 * quote, you close - so the board answers "who am I about to win?" by being looked at, rather than
 * by being filtered. A table sorted by date cannot do that: it shows you everything at once, which
 * is the same as showing you nothing.
 *
 * Lost is hidden behind a toggle. It is worth keeping and not worth seeing every day.
 */

export type PipelineLead = {
  id: string; salonName: string; contactName: string; phone: string; email: string | null; city: string | null;
  branchCount: number; staffCount: number; source: string | null; status: string; notes: string | null;
  interestedPlanId: string | null; interestedPlan: string | null; followUpAt: string | null;
  quotedMonthly: number | null; quotedAt: string | null;
  quotedAddOns: Array<{ code: string; name: string; quantity: number; unitAmount: number; unitPricePaise: number }>;
};

export type PlanOption = {
  id: string; name: string; monthlyPricePaise: number;
  maxBranches: number; maxStaff: number; maxServices: number; maxMonthlyAppointments: number;
};

export type AddOnOption = {
  code: string; name: string; limitField: string | null;
  unitAmount: number; unitPricePaise: number; isMetered: boolean;
};

/** The columns, in the order the conversation happens. */
const STAGES = [
  { key: "NEW", label: "New lead", hint: "Arrived, not yet called" },
  { key: "CONTACTED", label: "Contacted", hint: "Spoken to" },
  { key: "DEMO_BOOKED", label: "Demo", hint: "Shown the product" },
  { key: "QUOTED", label: "Quoted", hint: "Price on the table" },
  { key: "WON", label: "Won", hint: "Ready to start" },
] as const;

const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const day = (value: string) => new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(value));
const overdue = (lead: PipelineLead) => Boolean(lead.followUpAt && new Date(lead.followUpAt) < new Date());

export function PipelineBoard({ leads, plans, addOns }: { leads: PipelineLead[]; plans: PlanOption[]; addOns: AddOnOption[] }) {
  const router = useRouter();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showLost, setShowLost] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const open = leads.find((lead) => lead.id === openId) ?? null;
  const lost = useMemo(() => leads.filter((lead) => lead.status === "LOST"), [leads]);

  /**
   * Save, refresh in place, say so.
   *
   * `router.refresh()` re-renders the server data without unmounting this component, so the open
   * panel stays open and simply shows the new values - moving a lead's stage no longer throws the
   * admin back to the top of the board.
   */
  async function send(body: unknown, method: "POST" | "PATCH", path = "/api/v1/admin/leads", success = "Saved.") {
    setBusy(true); setError("");
    const response = await fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(result.error?.message ?? "Unable to save"); return false; }
    toast(success);
    router.refresh();
    return true;
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const followUp = String(form.get("followUpAt") || "");
    const saved = await send({
      salonName: form.get("salonName"), contactName: form.get("contactName"), phone: form.get("phone"),
      email: String(form.get("email") || "") || undefined,
      city: String(form.get("city") || "") || undefined,
      source: String(form.get("source") || "") || undefined,
      branchCount: Number(form.get("branchCount") || 1),
      staffCount: Number(form.get("staffCount") || 0),
      notes: String(form.get("notes") || "") || undefined,
      // Dates are entered as a local day; noon avoids a timezone shift landing it on the day before.
      followUpAt: followUp ? new Date(`${followUp}T12:00:00`).toISOString() : undefined,
    }, "POST", "/api/v1/admin/leads", "Lead added.");
    // Closing unmounts the form, which also clears it for the next lead.
    if (saved) setAdding(false);
  }

  return <div className="mt-6 space-y-5">
    <div className="flex flex-wrap items-center justify-end gap-3">
      {lost.length > 0 && (
        <button onClick={() => setShowLost(!showLost)} className="text-xs font-bold text-[#9CA3AF] underline underline-offset-4 transition hover:text-[#5B2A86]">
          {showLost ? "Hide" : "Show"} {lost.length} lost
        </button>
      )}
      <button onClick={() => setAdding(!adding)} className="primary"><Plus size={15} /> Add lead</button>
    </div>

    {error && <div className="rounded-2xl bg-[#FDECEC] p-4 text-sm font-bold text-[#94302E]">{error}</div>}

    {adding && <form onSubmit={create} className="rounded-2xl border border-[#EFEAF3] bg-white p-6">
      <h3 className="font-serif text-2xl">New lead</h3>
      <p className="mt-1 text-sm text-[#737174]">
        Branches and staff are what decide the quote, so ask for them on the first call. Always set a
        follow-up date — a lead with no next step is a lead being lost.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field name="salonName" label="Salon name" />
        <Field name="contactName" label="Contact person" />
        <Field name="phone" label="Phone" />
        <Field name="email" label="Email" type="email" required={false} />
        <Field name="city" label="City" required={false} />
        <label className="text-sm font-bold">Where from
          <input name="source" list="lead-sources" className="field mt-2" placeholder="Meta ads" />
          {/* Suggestions, not a fixed list. Channels change faster than a dropdown gets updated. */}
          <datalist id="lead-sources">
            {["Meta ads", "Google", "Referral", "Walk-in", "Cold call", "Instagram", "Exhibition"].map((source) => <option key={source} value={source} />)}
          </datalist>
        </label>
        <Field name="branchCount" label="Branches" type="number" required={false} defaultValue="1" />
        <Field name="staffCount" label="Staff" type="number" required={false} defaultValue="0" />
        <Field name="followUpAt" label="Follow up on" type="date" required={false} />
        <label className="text-sm font-bold sm:col-span-2 lg:col-span-3">What they asked for<input name="notes" className="field mt-2" placeholder="Wants online booking and GST invoices" /></label>
      </div>
      <button disabled={busy} className="primary mt-5">Save lead</button>
    </form>}

    <div className="grid gap-3 lg:grid-cols-5">
      {STAGES.map((stage) => {
        const column = leads.filter((lead) => lead.status === stage.key);
        const value = column.reduce((sum, lead) => sum + (lead.quotedMonthly ?? 0), 0);
        return (
          <section key={stage.key} className="rounded-2xl border border-[#EFEAF3] bg-white p-3">
            <header className="px-1 pb-2">
              <h3 className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-[#6B7280]">
                {stage.label}
                <span className="rounded-full bg-[#F3E8FF] px-2 py-0.5 text-[10px] tabular-nums text-[#5B2A86]">{column.length}</span>
              </h3>
              <p className="mt-0.5 text-[10px] text-[#9CA3AF]">{value > 0 ? `${rupees.format(value)}/mo quoted` : stage.hint}</p>
            </header>

            <div className="space-y-2">
              {column.map((lead) => (
                <button
                  key={lead.id}
                  onClick={() => setOpenId(lead.id)}
                  className="w-full rounded-xl border border-[#EFEAF3] bg-[#FCFBFD] p-3 text-left transition hover:border-[#D9C7EA] hover:bg-[#F9F6FC]"
                >
                  <strong className="block text-sm leading-tight">{lead.salonName}</strong>
                  <span className="mt-0.5 block text-[11px] text-[#9CA3AF]">
                    {lead.branchCount} branch{lead.branchCount === 1 ? "" : "es"}
                    {lead.staffCount > 0 && ` · ${lead.staffCount} staff`}
                    {lead.city && ` · ${lead.city}`}
                  </span>
                  {lead.quotedMonthly !== null && (
                    <span className="mt-1.5 block text-xs font-bold text-[#5B2A86]">{rupees.format(lead.quotedMonthly)}/mo</span>
                  )}
                  <span className={`mt-1.5 block text-[11px] font-semibold ${overdue(lead) ? "text-[#C4403E]" : lead.followUpAt ? "text-[#6B7280]" : "text-[#C4403E]"}`}>
                    {lead.followUpAt ? `${overdue(lead) ? "Overdue" : "Follow up"} ${day(lead.followUpAt)}` : "No follow-up set"}
                  </span>
                </button>
              ))}
              {!column.length && <p className="px-1 py-4 text-center text-[11px] text-[#C9C6CC]">Empty</p>}
            </div>
          </section>
        );
      })}
    </div>

    {showLost && lost.length > 0 && (
      <div className="rounded-2xl border border-[#EFEAF3] bg-white p-4">
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#9CA3AF]">Lost</h3>
        {/* Kept, because the reasons are what tell you whether you lose on price, features or
            follow-up. Three different problems with three different fixes. */}
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {lost.map((lead) => (
            <button key={lead.id} onClick={() => setOpenId(lead.id)} className="rounded-xl border border-[#EFEAF3] p-3 text-left transition hover:border-[#D9C7EA]">
              <strong className="block text-sm">{lead.salonName}</strong>
              <span className="text-[11px] text-[#9CA3AF]">{lead.notes || "No reason recorded"}</span>
            </button>
          ))}
        </div>
      </div>
    )}

    {open && (
      <LeadPanel
        lead={open}
        plans={plans}
        addOns={addOns}
        busy={busy}
        onClose={() => setOpenId(null)}
        onSave={send}
        onDone={() => {
          // Conversion filters the lead out of the board, so close first - otherwise the panel
          // would vanish mid-animation when the refresh lands.
          setOpenId(null);
          toast("Trial started. The salon is now under Trials.");
          router.refresh();
        }}
      />
    )}
  </div>;
}

/* ------------------------------------------------------------------ the one-lead panel */

function LeadPanel({ lead, plans, addOns, busy, onClose, onSave, onDone }: {
  lead: PipelineLead;
  plans: PlanOption[];
  addOns: AddOnOption[];
  busy: boolean;
  onClose: () => void;
  onSave: (body: unknown, method: "POST" | "PATCH", path?: string, success?: string) => Promise<boolean>;
  onDone: () => void;
}) {
  // Opens on whatever the next thing to do is. A quoted lead is one step from a trial, and a won
  // one is being converted right now - guessing correctly saves a click on every single lead.
  const [tab, setTab] = useState<"details" | "quote" | "start">(
    lead.status === "WON" ? "start" : lead.status === "QUOTED" ? "quote" : "details");

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/25" onClick={onClose}>
      <aside className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl leading-tight">{lead.salonName}</h2>
            <p className="mt-1 text-sm text-[#737174]">
              {lead.contactName} · {lead.city || "no city"}{lead.source ? ` · from ${lead.source}` : ""}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[#9CA3AF] transition hover:bg-[#F7F6F9]"><X size={18} /></button>
        </div>

        {/* The single most useful control on the page. Most of this job is phone calls. */}
        <a href={`tel:${lead.phone}`} className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-[#5B2A86] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#4A2270]">
          <Phone size={15} /> {lead.phone}
        </a>

        <div className="mt-5 flex gap-1 rounded-xl bg-[#F7F6F9] p-1">
          {([["details", "Details"], ["quote", "Quote"], ["start", "Start trial"]] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition ${tab === value ? "bg-white text-[#5B2A86] shadow-sm" : "text-[#6B7280]"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "details" ? (
          <form
            className="mt-5 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const followUp = String(form.get("followUpAt") || "");
              await onSave({
                id: lead.id,
                status: form.get("status"),
                notes: String(form.get("notes") || "") || undefined,
                followUpAt: followUp ? new Date(`${followUp}T12:00:00`).toISOString() : null,
              }, "PATCH");
            }}
          >
            <label className="block text-sm font-bold">Stage
              <select name="status" defaultValue={lead.status} className="field mt-2">
                {[...STAGES.map((stage) => stage.key), "LOST"].map((value) => (
                  <option key={value} value={value}>{value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())}</option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-bold">Next follow-up
              <input name="followUpAt" type="date" defaultValue={lead.followUpAt?.slice(0, 10) ?? ""} className="field mt-2" />
              <span className="mt-1 block text-xs font-normal text-[#9CA3AF]">Clearing this leaves the lead with no next step, which is how leads go quiet.</span>
            </label>

            <label className="block text-sm font-bold">What they said
              <textarea name="notes" defaultValue={lead.notes ?? ""} rows={5} className="field mt-2" placeholder="Wants online booking. Comparing against Zylu. Decision after Diwali." />
            </label>

            <div className="rounded-xl bg-[#F7F6F9] p-3 text-xs text-[#6B7280]">
              <strong className="block text-[#1F2937]">Size on record</strong>
              {lead.branchCount} branch{lead.branchCount === 1 ? "" : "es"} · {lead.staffCount} staff
              {lead.quotedMonthly !== null && lead.quotedAt && (
                <span className="mt-1 block">Quoted {rupees.format(lead.quotedMonthly)}/mo on {day(lead.quotedAt)}</span>
              )}
            </div>

            <button disabled={busy} className="primary w-full">Save</button>
          </form>
        ) : tab === "quote" ? (
          <QuoteBuilder
            lead={lead}
            plans={plans}
            addOns={addOns}
            busy={busy}
            onSave={(body) => onSave(body, "POST", "/api/v1/admin/leads/quote", "Quote saved and lead marked quoted.")}
          />
        ) : (
          <ConvertLead lead={lead} plans={plans} onDone={onDone} />
        )}
      </aside>
    </div>
  );
}

function Field({ name, label, type = "text", required = true, defaultValue }: { name: string; label: string; type?: string; required?: boolean; defaultValue?: string }) {
  return <label className="text-sm font-bold">{label}<input name={name} type={type} required={required} defaultValue={defaultValue} className="field mt-2" /></label>;
}
