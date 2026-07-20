"use client";

import { useMemo, useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { buildQuote, describeLimits, type AddOnLine, type PlanLimits } from "@/lib/packages";
import type { AddOnOption, PipelineLead, PlanOption } from "./pipeline-board";

/**
 * Base plan, plus whatever packs they need, with the total updating as you click.
 *
 * The point is that the salesperson and the salon owner look at the same arithmetic. A quote read
 * off a screen where every line shows its own working - "2 × 500 bookings, ₹1,000" - is a quote the
 * customer can check, and a customer who checks the number does not argue about it three weeks
 * later.
 *
 * The total shown here is only for the conversation. What gets saved is recomputed on the server
 * from the add-on records, because a price that travelled through a browser is not evidence.
 */

const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const paise = (value: number) => rupees.format(value / 100);

export function QuoteBuilder({ lead, plans, addOns, busy, onSave }: {
  lead: PipelineLead;
  plans: PlanOption[];
  addOns: AddOnOption[];
  busy: boolean;
  onSave: (body: unknown) => Promise<boolean>;
}) {
  const [planId, setPlanId] = useState(lead.interestedPlanId ?? plans[0]?.id ?? "");
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(lead.quotedAddOns.map((line) => [line.code, line.quantity])));

  const plan = plans.find((option) => option.id === planId) ?? plans[0];

  const lines: AddOnLine[] = useMemo(() => addOns.map((addOn) => ({
    code: addOn.code, name: addOn.name,
    limitField: (addOn.limitField as keyof PlanLimits | null) ?? null,
    unitAmount: addOn.unitAmount, unitPricePaise: addOn.unitPricePaise,
    quantity: quantities[addOn.code] ?? 0, isMetered: addOn.isMetered,
  })), [addOns, quantities]);

  const quote = useMemo(() => plan ? buildQuote(plan, lines) : null, [plan, lines]);

  /**
   * Does what they told us on the call actually fit inside what we are about to quote?
   *
   * Selling a salon a plan that cannot hold their branches is the fastest way to a refund request,
   * and it is entirely avoidable - we asked them how big they were on the first call.
   */
  const tooSmall = quote ? [
    quote.limits.maxBranches > 0 && lead.branchCount > quote.limits.maxBranches
      ? `They have ${lead.branchCount} branches; this covers ${quote.limits.maxBranches}.` : null,
    quote.limits.maxStaff > 0 && lead.staffCount > quote.limits.maxStaff
      ? `They have ${lead.staffCount} staff; this covers ${quote.limits.maxStaff}.` : null,
  ].filter(Boolean) as string[] : [];

  const nudge = (code: string, by: number) =>
    setQuantities((current) => ({ ...current, [code]: Math.max(0, (current[code] ?? 0) + by) }));

  if (!plan || !quote) return <p className="mt-6 text-sm text-[#9CA3AF]">No plans set up yet.</p>;

  return <div className="mt-5 space-y-5">
    <label className="block text-sm font-bold">Base plan
      <select value={planId} onChange={(event) => setPlanId(event.target.value)} className="field mt-2">
        {plans.map((option) => <option key={option.id} value={option.id}>{option.name} — {paise(option.monthlyPricePaise)}/mo</option>)}
      </select>
      <span className="mt-1.5 block text-xs font-normal text-[#9CA3AF]">{describeLimits(plan)}</span>
    </label>

    <div>
      <p className="text-sm font-bold">Add-ons</p>
      {/* The answer to "we've run out" should be an offer with a price on it, not a tier change. */}
      <p className="mt-0.5 text-xs text-[#9CA3AF]">For a salon that needs more of one thing, not more of everything.</p>
      <div className="mt-3 space-y-2">
        {addOns.map((addOn) => {
          const quantity = quantities[addOn.code] ?? 0;
          return (
            <div key={addOn.code} className={`flex items-center gap-3 rounded-xl border p-3 transition ${quantity > 0 ? "border-[#D9C7EA] bg-[#FAF7FD]" : "border-[#EFEAF3]"}`}>
              <div className="min-w-0 flex-1">
                <strong className="block text-sm leading-tight">{addOn.name}</strong>
                <span className="text-[11px] text-[#9CA3AF]">
                  +{addOn.unitAmount.toLocaleString("en-IN")}{addOn.isMetered ? " credits" : ""} · {paise(addOn.unitPricePaise)}/mo each
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => nudge(addOn.code, -1)} disabled={quantity === 0} className="grid size-7 place-items-center rounded-lg border border-[#E5E7EB] text-[#6B7280] transition hover:bg-[#F7F6F9] disabled:opacity-30">
                  <Minus size={13} />
                </button>
                <span className="w-6 text-center text-sm font-bold tabular-nums">{quantity}</span>
                <button type="button" onClick={() => nudge(addOn.code, 1)} className="grid size-7 place-items-center rounded-lg border border-[#E5E7EB] text-[#6B7280] transition hover:bg-[#F7F6F9]">
                  <Plus size={13} />
                </button>
              </div>
            </div>
          );
        })}
        {!addOns.length && <p className="text-xs text-[#9CA3AF]">No add-ons set up yet.</p>}
      </div>
    </div>

    {tooSmall.length > 0 && (
      <div className="rounded-xl border border-[#F3E4C0] bg-[#FFFBF0] p-3 text-xs text-[#865C12]">
        <strong className="block">This will not fit them</strong>
        {tooSmall.map((reason) => <span key={reason} className="mt-0.5 block">{reason}</span>)}
      </div>
    )}

    <div className="rounded-2xl border border-[#EFEAF3] bg-[#FCFBFD] p-4">
      <p className="text-xs font-extrabold uppercase tracking-wider text-[#9CA3AF]">The quote</p>
      <div className="mt-3 space-y-2">
        {quote.lines.map((line) => (
          <div key={line.label} className="flex items-baseline justify-between gap-3 text-sm">
            <span>
              {line.label}
              {/* Every line carries its own arithmetic so the owner can check the sum themselves. */}
              <span className="block text-[11px] text-[#9CA3AF]">{line.detail}</span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{paise(line.monthlyPaise)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-1 border-t border-[#EFEAF3] pt-3 text-sm">
        <Row label="Subtotal" value={paise(quote.netMonthlyPaise)} />
        <Row label="GST 18%" value={paise(quote.taxPaise)} muted />
        <div className="flex items-baseline justify-between pt-1.5 text-base font-extrabold">
          <span>Per month</span>
          <span className="tabular-nums">{paise(quote.grossMonthlyPaise)}</span>
        </div>
      </div>
      <p className="mt-3 border-t border-[#EFEAF3] pt-3 text-[11px] text-[#9CA3AF]">
        They get {describeLimits(quote.limits)}.
      </p>
    </div>

    <button
      disabled={busy}
      onClick={() => void onSave({
        leadId: lead.id,
        planId,
        addOns: Object.entries(quantities).map(([code, quantity]) => ({ code, quantity })),
      })}
      className="primary w-full"
    >
      <Check size={15} /> Save quote &amp; mark quoted
    </button>
    <p className="text-center text-[11px] text-[#9CA3AF]">
      Saved against the lead with today&apos;s prices, so a price change next month never rewrites what they were told.
    </p>
  </div>;
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between ${muted ? "text-[#9CA3AF]" : ""}`}>
      <span>{label}</span><span className="tabular-nums">{value}</span>
    </div>
  );
}
