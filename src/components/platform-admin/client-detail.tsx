"use client";

import { useState } from "react";
import { inr } from "@/lib/format";

type Health = { band: string; evidence: string[] };
type Subscription = {
  planId: string; planName: string; status: string; billingPeriod: string;
  trialEndsAt: string | null; currentPeriodEnd: string | null;
  agreedPrice: number | null; listMonthly: number;
} | null;

type Props = {
  tenant: { id: string; name: string; slug: string; legalName: string | null; gstin: string | null; status: string; createdAt: string; customerCount: number; serviceCount: number };
  health: Health;
  subscription: Subscription;
  plans: Array<{ id: string; name: string; maxBranches: number; maxStaff: number }>;
  people: Array<{ id: string; name: string; email: string | null; role: string; isActive: boolean }>;
  branches: Array<{ id: string; name: string; city: string; publicationStatus: string; appointments: number; staff: number; invoices: number; checklist: Record<string, boolean> }>;
  documents: Array<{ id: string; type: string; fileName: string; status: string; createdAt: string }>;
  notes: Array<{ id: string; note: string; author: string; createdAt: string }>;
  invitations: Array<{ id: string; email: string; status: string }>;
  events: Array<{ id: string; kind: string; fromValue: number | null; toValue: number | null; reason: string | null; actor: string; createdAt: string }>;
};

const readable = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const day = (value: string) => new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(value));

const BAND_STYLE: Record<string, string> = {
  DORMANT: "bg-[#FDECEC] text-[#94302E]", AT_RISK: "bg-[#FFF7DF] text-[#865C12]",
  WATCH: "bg-[#FFF7DF] text-[#865C12]", NEW: "bg-[#F3E8FF] text-[#5B2A86]", HEALTHY: "bg-[#E9F7F1] text-[#0B6B4F]",
};
const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-[#E9F7F1] text-[#0B6B4F]", TRIALING: "bg-[#F3E8FF] text-[#5B2A86]",
  PAST_DUE: "bg-[#FFF7DF] text-[#865C12]", SUSPENDED: "bg-[#FDECEC] text-[#94302E]", CANCELLED: "bg-[#FDECEC] text-[#94302E]",
};

export function ClientDetail(props: Props) {
  const { tenant, health, subscription, plans, people, branches, documents, notes, events } = props;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [planId, setPlanId] = useState(subscription?.planId ?? plans[0]?.id ?? "");
  const [period, setPeriod] = useState(subscription?.billingPeriod ?? "MONTHLY");
  const [agreed, setAgreed] = useState(subscription?.agreedPrice ? String(subscription.agreedPrice) : "");
  const [note, setNote] = useState("");

  async function call(path: string, body: unknown, success: string, method = "PATCH") {
    setBusy(true); setError(""); setMessage("");
    const response = await fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return setError(result.error?.message ?? "Unable to update");
    setMessage(success);
    window.setTimeout(() => window.location.reload(), 600);
  }

  const subscriptionEndpoint = `/api/v1/admin/tenants/${tenant.id}/subscription`;
  // A cancellation without a reason is a number nobody can learn from, so it is asked for here.
  const cancel = () => {
    const reason = window.prompt("Why are they leaving? This is the most useful thing we record.");
    if (reason === null) return;
    void call(subscriptionEndpoint, { status: "CANCELLED", note: reason || "No reason given" }, "Cancelled.");
  };

  return <div className="mt-4 space-y-5">
    <header className="rounded-2xl border border-[#EFEAF3] bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-serif text-3xl">{tenant.name}</h1>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${BAND_STYLE[health.band]}`}>{readable(health.band)}</span>
            {subscription && <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${STATUS_STYLE[subscription.status] ?? ""}`}>{readable(subscription.status)}</span>}
          </div>
          <p className="mt-1.5 text-sm text-[#737174]">
            {tenant.legalName ?? "No legal name"} · {tenant.gstin ?? "No GSTIN"} · customer since {day(tenant.createdAt)}
          </p>
          <p className="mt-1 text-xs text-[#6B7280]">{health.evidence.join(" · ")}</p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          {[["Branches", branches.length], ["Services", tenant.serviceCount], ["Customers", tenant.customerCount]].map(([text, value]) => (
            <div key={String(text)} className="rounded-xl bg-[#F7F6F9] px-4 py-2"><p className="text-[10px] uppercase text-[#9CA3AF]">{text}</p><strong className="text-lg">{value}</strong></div>
          ))}
        </div>
      </div>
    </header>

    {(message || error) && <div className={`rounded-2xl p-4 text-sm font-bold ${error ? "bg-[#FDECEC] text-[#94302E]" : "bg-[#E9F7F1] text-[#0B6B4F]"}`}>{error || message}</div>}

    <section className="rounded-2xl border border-[#EFEAF3] bg-white p-6">
      <h2 className="font-serif text-2xl">Subscription</h2>
      {subscription ? (
        <p className="mt-1 text-sm text-[#737174]">
          {subscription.planName} · {subscription.billingPeriod.toLowerCase()} · {inr.format(subscription.agreedPrice ?? subscription.listMonthly)}/mo
          {subscription.agreedPrice ? " (agreed)" : ""}
          {subscription.trialEndsAt ? ` · trial ends ${day(subscription.trialEndsAt)}` : ""}
          {subscription.currentPeriodEnd ? ` · paid to ${day(subscription.currentPeriodEnd)}` : ""}
        </p>
      ) : <p className="mt-1 text-sm text-[#C4403E]">No subscription. This salon cannot be billed or limited.</p>}

      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_140px_1fr_auto]">
        <select className="field" value={planId} onChange={(event) => setPlanId(event.target.value)}>
          {plans.map((plan) => <option key={plan.id} value={plan.id}>
            {plan.name} · {plan.maxBranches <= 0 ? "∞" : plan.maxBranches} branches · {plan.maxStaff <= 0 ? "∞" : plan.maxStaff} staff
          </option>)}
        </select>
        <select className="field" value={period} onChange={(event) => setPeriod(event.target.value)}>
          <option value="MONTHLY">Monthly</option><option value="ANNUAL">Annual</option>
        </select>
        <input className="field" type="number" value={agreed} onChange={(event) => setAgreed(event.target.value)} placeholder="Agreed price ₹, if not list" />
        <button disabled={busy} onClick={() => void call(subscriptionEndpoint, { planId, billingPeriod: period, ...(agreed.trim() ? { agreedPriceRupees: Number(agreed) } : {}) }, "Subscription saved.")} className="primary justify-center">Save</button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => void call(subscriptionEndpoint, { status: "TRIALING", trialDays: 14 }, "Trial started.")} className="rounded-full border border-[#E3D9EE] px-3.5 py-2 text-xs font-bold text-[#5B2A86]">Start 14-day trial</button>
        <button disabled={busy} onClick={() => void call(subscriptionEndpoint, { trialDays: 7 }, "Trial extended.")} className="rounded-full border border-[#E3D9EE] px-3.5 py-2 text-xs font-bold text-[#5B2A86]">Extend 7 days</button>
        <button disabled={busy} onClick={() => void call(subscriptionEndpoint, { status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + (period === "ANNUAL" ? 365 : 30) * 86_400_000).toISOString() }, "Marked paid.")} className="rounded-full bg-[#E9F7F1] px-3.5 py-2 text-xs font-bold text-[#0B6B4F]">Mark paid</button>
        <button disabled={busy} onClick={() => void call(subscriptionEndpoint, { status: "PAST_DUE" }, "Marked past due.")} className="rounded-full bg-[#FFF7DF] px-3.5 py-2 text-xs font-bold text-[#865C12]">Payment failed</button>
        <button disabled={busy} onClick={cancel} className="rounded-full bg-[#FDECEC] px-3.5 py-2 text-xs font-bold text-[#94302E]">Cancel</button>
      </div>
    </section>

    <div className="grid gap-5 xl:grid-cols-2">
      <section className="rounded-2xl border border-[#EFEAF3] bg-white p-6">
        <h2 className="font-serif text-2xl">Branches</h2>
        <div className="mt-4 space-y-3">
          {branches.map((branch) => {
            const complete = Object.values(branch.checklist).every(Boolean);
            const pending = branch.publicationStatus === "PENDING_REVIEW";
            return <div key={branch.id} className={`rounded-xl border p-4 ${pending ? "border-[#ECD7A7] bg-[#FFF7DF]" : "border-[#EFEAF3]"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <strong className="text-sm">{branch.name}</strong>
                  <p className="text-xs text-[#9CA3AF]">{branch.city} · {branch.invoices} bills · {branch.staff} staff</p>
                </div>
                <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold uppercase text-[#6B7280]">{readable(branch.publicationStatus)}</span>
              </div>
              {pending && <div className="mt-3">
                {/* They have paid and cannot go live until this is done. It is the fastest thing
                    on the list and the most damaging to leave sitting. */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                  {Object.entries(branch.checklist).map(([item, done]) => (
                    <span key={item} className={done ? "text-[#0B6B4F]" : "text-[#94302E]"}>{done ? "✓" : "○"} {readable(item)}</span>
                  ))}
                </div>
                <button
                  disabled={busy || !complete}
                  onClick={() => void call(`/api/v1/admin/branches/${branch.id}/review`, { status: "APPROVED", note: "Approved from client page" }, "Branch approved.")}
                  className="mt-3 rounded-full bg-[#0B6B4F] px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
                >
                  {complete ? "Approve & publish" : "Checklist incomplete"}
                </button>
              </div>}
            </div>;
          })}
          {!branches.length && <p className="text-sm text-[#9CA3AF]">No branches yet.</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-[#EFEAF3] bg-white p-6">
        <h2 className="font-serif text-2xl">Subscription history</h2>
        <p className="mt-1 text-sm text-[#737174]">Every change, and who made it.</p>
        <div className="mt-4 space-y-2">
          {events.map((event) => (
            <div key={event.id} className="flex items-start justify-between gap-3 border-b border-[#EFEAF3] pb-2 text-sm last:border-0">
              <div className="min-w-0">
                <strong className="text-[13px]">{readable(event.kind)}</strong>
                {event.fromValue !== null && event.toValue !== null && event.fromValue !== event.toValue && (
                  <span className="ml-1.5 text-xs text-[#6B7280]">{inr.format(event.fromValue)} → {inr.format(event.toValue)}</span>
                )}
                {event.reason && <p className="truncate text-xs text-[#9CA3AF]">{event.reason}</p>}
              </div>
              <span className="shrink-0 text-right text-[11px] text-[#9CA3AF]">{day(event.createdAt)}<br />{event.actor}</span>
            </div>
          ))}
          {!events.length && <p className="text-sm text-[#9CA3AF]">No changes recorded yet.</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-[#EFEAF3] bg-white p-6">
        <h2 className="font-serif text-2xl">People</h2>
        <div className="mt-4 space-y-2">
          {people.map((person) => (
            <div key={person.id} className="flex items-center justify-between border-b border-[#EFEAF3] pb-2 text-sm last:border-0">
              <div><strong>{person.name}</strong><p className="text-xs text-[#9CA3AF]">{person.email ?? "No email"}</p></div>
              <span className="text-xs text-[#6B7280]">{readable(person.role)}{person.isActive ? "" : " · disabled"}</span>
            </div>
          ))}
          {!people.length && <p className="text-sm text-[#9CA3AF]">No staff yet — the owner invitation may still be pending.</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-[#EFEAF3] bg-white p-6">
        <h2 className="font-serif text-2xl">Notes</h2>
        <p className="mt-1 text-sm text-[#737174]">Internal. The salon never sees these.</p>
        <textarea className="field mt-3 min-h-20" value={note} onChange={(event) => setNote(event.target.value)} placeholder="What happened on the call?" />
        <button
          disabled={busy || note.trim().length < 2}
          onClick={() => void call(`/api/v1/admin/tenants/${tenant.id}/notes`, { note }, "Note added.", "POST")}
          className="primary mt-2"
        >Add note</button>
        <div className="mt-4 space-y-2">
          {notes.map((item) => (
            <div key={item.id} className="rounded-xl bg-[#F7F6F9] p-3 text-sm">
              <p>{item.note}</p>
              <p className="mt-1 text-xs text-[#9CA3AF]">{item.author} · {day(item.createdAt)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>

    {documents.length > 0 && <section className="rounded-2xl border border-[#EFEAF3] bg-white p-6">
      <h2 className="font-serif text-2xl">Verification documents</h2>
      <div className="mt-4 space-y-2">
        {documents.map((document) => (
          <div key={document.id} className="flex items-center justify-between border-b border-[#EFEAF3] pb-2 text-sm last:border-0">
            <div><strong>{readable(document.type)}</strong><p className="text-xs text-[#9CA3AF]">{document.fileName}</p></div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#6B7280]">{readable(document.status)}</span>
              {document.status === "PENDING" && <>
                <button disabled={busy} onClick={() => void call(`/api/v1/admin/documents/${document.id}/review`, { status: "APPROVED" }, "Document approved.")} className="rounded-lg bg-[#E9F7F1] px-2.5 py-1 text-xs font-bold text-[#0B6B4F]">Approve</button>
                <button disabled={busy} onClick={() => void call(`/api/v1/admin/documents/${document.id}/review`, { status: "REJECTED", note: "Please upload a clear, current document." }, "Document rejected.")} className="rounded-lg bg-[#FDECEC] px-2.5 py-1 text-xs font-bold text-[#94302E]">Reject</button>
              </>}
            </div>
          </div>
        ))}
      </div>
    </section>}
  </div>;
}
