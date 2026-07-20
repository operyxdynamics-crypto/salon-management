"use client";

import { FormEvent, useState } from "react";
import { Copy, Rocket } from "lucide-react";
import type { PipelineLead, PlanOption } from "./pipeline-board";

/**
 * Lead → trial, without retyping anything.
 *
 * The salon name, city, phone, plan and add-ons all come from the lead. The only thing this asks
 * for is the owner's name and email, because that is the only thing a salesperson does not already
 * have written down — and it is the one field that must be right, since it decides who gets the
 * keys to the account.
 */

const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export function ConvertLead({ lead, plans, onDone }: { lead: PipelineLead; plans: PlanOption[]; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ url: string; trialEndsAt: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  const plan = plans.find((option) => option.id === lead.interestedPlanId) ?? null;
  const packs = lead.quotedAddOns.filter((line) => line.quantity > 0);

  async function convert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const trialDays = String(form.get("trialDays") || "");

    setBusy(true); setError("");
    const response = await fetch("/api/v1/admin/leads/convert", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        leadId: lead.id,
        ownerName: form.get("ownerName"),
        ownerEmail: form.get("ownerEmail"),
        trialDays: trialDays === "" ? undefined : Number(trialDays),
      }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(result.error?.message ?? "Unable to convert this lead");
    setDone({ url: `${window.location.origin}${result.data.invitationUrl}`, trialEndsAt: result.data.trialEndsAt ?? null });
  }

  /**
   * The invitation link, shown once.
   *
   * It is not stored anywhere readable and cannot be shown again - only reissued. That is
   * deliberate: a link sitting in a database is a way into someone else's salon.
   */
  if (done) return <div className="mt-5 space-y-4">
    <div className="rounded-2xl border border-[#BFE3D3] bg-[#E9F7F1] p-4">
      <strong className="text-sm text-[#0B6B4F]">{lead.salonName} is live on a trial.</strong>
      <p className="mt-1 text-xs text-[#0B6B4F]/80">
        It has moved from Pipeline to Trials.
        {done.trialEndsAt && ` The trial ends ${new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(done.trialEndsAt))}.`}
      </p>
    </div>

    <div>
      <p className="text-sm font-bold">Send the owner this link</p>
      <p className="mt-0.5 text-xs text-[#9CA3AF]">They set their own password on it. We never know or set a salon&apos;s password.</p>
      <div className="mt-2 flex gap-2">
        <input readOnly value={done.url} className="field flex-1 bg-[#F7F6F9] text-xs" onFocus={(event) => event.currentTarget.select()} />
        <button
          type="button"
          onClick={() => { void navigator.clipboard.writeText(done.url); setCopied(true); }}
          className="shrink-0 rounded-xl border border-[#E3D9EE] px-3 text-xs font-bold text-[#5B2A86] transition hover:bg-[#F3E8FF]"
        >
          <Copy size={13} className="mr-1 inline" />{copied ? "Copied" : "Copy"}
        </button>
      </div>
      {/* Once this panel closes the link is gone. Saying so beats finding out. */}
      <p className="mt-2 text-[11px] font-semibold text-[#865C12]">
        Copy it now — it is shown once and cannot be retrieved, only reissued.
      </p>
    </div>

    {/* Done - not a reload - because the one-time invitation link above must survive until the
        admin says they have copied it. The parent closes the panel and refreshes in place. */}
    <button onClick={onDone} className="primary w-full">Done</button>
  </div>;

  return <form onSubmit={convert} className="mt-5 space-y-4">
    <div className="rounded-2xl border border-[#EFEAF3] bg-[#FCFBFD] p-4 text-sm">
      <p className="text-xs font-extrabold uppercase tracking-wider text-[#9CA3AF]">What gets created</p>
      <dl className="mt-2.5 space-y-1.5 text-[#6B7280]">
        <Row label="Salon" value={lead.salonName} />
        <Row label="First branch" value={lead.city || "Main"} />
        <Row label="Plan" value={plan ? plan.name : "Cheapest public plan — nothing was quoted"} />
        {packs.length > 0 && <Row label="Add-ons" value={packs.map((line) => `${line.quantity} × ${line.name}`).join(", ")} />}
        {lead.quotedMonthly !== null && <Row label="Quoted" value={`${rupees.format(lead.quotedMonthly)}/mo before GST`} />}
      </dl>
    </div>

    {!plan && (
      <p className="rounded-xl border border-[#F3E4C0] bg-[#FFFBF0] p-3 text-xs text-[#865C12]">
        No quote saved against this lead, so it will start on the cheapest public plan. Build a quote
        first if you have agreed something different — changing it later means a subscription change
        on their record.
      </p>
    )}

    <label className="block text-sm font-bold">Owner&apos;s name
      <input name="ownerName" required defaultValue={lead.contactName} className="field mt-2" />
    </label>

    <label className="block text-sm font-bold">Owner&apos;s email
      <input name="ownerEmail" type="email" required defaultValue={lead.email ?? ""} className="field mt-2" />
      {/* This decides who gets the keys. It is the one field on the page worth double-checking. */}
      <span className="mt-1 block text-xs font-normal text-[#9CA3AF]">The invitation goes here, and this becomes the account owner. Check it.</span>
    </label>

    <label className="block text-sm font-bold">Trial days
      <input name="trialDays" type="number" min={0} max={90} placeholder={plan ? "Plan default" : "14"} className="field mt-2" />
      <span className="mt-1 block text-xs font-normal text-[#9CA3AF]">Leave blank for the plan&apos;s own length.</span>
    </label>

    {error && <div className="rounded-2xl bg-[#FDECEC] p-3 text-sm font-bold text-[#94302E]">{error}</div>}

    <button disabled={busy} className="primary w-full"><Rocket size={15} /> Start the trial</button>
    <p className="text-center text-[11px] text-[#9CA3AF]">
      This creates a trial, not a customer. It appears under Trials and adds nothing to MRR until you mark it paid.
    </p>
  </form>;
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3">
    <dt className="shrink-0">{label}</dt>
    <dd className="text-right font-semibold text-[#1F2937]">{value}</dd>
  </div>;
}
