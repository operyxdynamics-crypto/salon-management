"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, Archive, Building2, Check, ChevronRight, CircleDollarSign, ExternalLink, FileCheck2, FileText, LogOut, Plus, Search, ShieldCheck, Store, X } from "lucide-react";
import { inr } from "@/lib/format";

type Plan = {
  id: string; code: string; name: string; description: string | null;
  maxBranches: number; maxStaff: number; maxServices: number; maxMonthlyAppointments: number; maxStorageMb: number;
  /** Rupees, not paise - the UI should never divide. */
  monthlyPrice: number; annualPrice: number; setupFee: number;
  trialDays: number; isPublic: boolean; isActive: boolean; sortOrder: number; features: string[];
};
type WorkItem = { kind: string; id: string; title: string; detail: string; days: number | null };
type Lead = {
  id: string; salonName: string; contactName: string; phone: string; email: string | null; city: string | null;
  branchCount: number; staffCount: number; source: string | null; status: string; notes: string | null;
  interestedPlan: string | null; followUpAt: string | null; createdAt: string;
};
type CategoryTemplate = { id: string; name: string; description: string | null; color: string | null; icon: string | null; sortOrder: number; isActive: boolean };
type Document = { id: string; branchId: string | null; type: string; fileName: string; status: string; reviewNote: string | null; createdAt: string };
type Branch = { id: string; name: string; city: string; address: string; phone: string | null; email: string | null; publicationStatus: string; isPublished: boolean; submittedAt: string | null; appointments: number; staff: number; invoices: number; checklist: Record<string, boolean>; reviews: Array<{ id: string; toStatus: string; note: string | null; reviewer: string; createdAt: string }> };
type Tenant = {
  id: string; name: string; slug: string; legalName: string | null; gstin: string | null; panNumber: string | null; status: string; onboardingStep: number; createdAt: string;
  owner: { id: string; name: string; email: string | null; phone: string | null; isActive: boolean } | null; customerCount: number; serviceCount: number;
  subscription: {
    id: string; planId: string; planName: string; planCode: string;
    status: string; billingPeriod: string;
    trialEndsAt: string | null; currentPeriodEnd: string | null; monthlyValuePaise: number;
  } | null;
  documents: Document[]; branches: Branch[];
  notes: Array<{ id: string; note: string; author: string; createdAt: string }>; invitations: Array<{ id: string; email: string; status: string; expiresAt: string }>;
};
export type AdminConsoleData = {
  adminName: string;
  metrics: {
    tenants: number; activeTenants: number; pendingBranches: number; approvedBranches: number;
    appointments: number; recordedRevenue: number;
    /** The subscription business, in rupees per month. */
    mrr: number; trialing: number; paying: number; pastDue: number;
  };
  plans: Plan[];
  worklist: WorkItem[];
  leads: Lead[];
  categoryTemplates: CategoryTemplate[];
  tenants: Tenant[];
  auditLogs: Array<{ id: string; action: string; entity: string; entityId: string | null; tenantId: string | null; actor: string; createdAt: string }>;
};

export function AdminConsole({ data }: { data: AdminConsoleData }) {
  const [selectedId, setSelectedId] = useState(data.tenants[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  /**
   * The panel is organised by job, not by record.
   *
   * "Today" is where the day starts - a queue ordered by what it costs to ignore. Clients, money
   * and plans are the things you go looking for. The old layout made you pick a salon before you
   * could see anything, which is fine for looking something up and useless for running a business.
   */
  const [view, setView] = useState<"today" | "clients" | "leads" | "money" | "plans" | "activity">("today");
  const [tab, setTab] = useState<"overview" | "documents" | "categories" | "activity">("overview");
  const [modal, setModal] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = data.tenants.find((tenant) => tenant.id === selectedId) ?? data.tenants[0];
  const visible = useMemo(() => data.tenants.filter((tenant) => (status === "ALL" || tenant.status === status) && `${tenant.name} ${tenant.legalName} ${tenant.gstin} ${tenant.branches.map((branch) => branch.city).join(" ")}`.toLowerCase().includes(query.toLowerCase())), [data.tenants, query, status]);
  const audit = useMemo(() => data.auditLogs.filter((log) => `${log.action} ${log.entity} ${log.actor} ${data.tenants.find((tenant) => tenant.id === log.tenantId)?.name ?? ""}`.toLowerCase().includes(query.toLowerCase())), [data.auditLogs, data.tenants, query]);

  async function mutate(path: string, body: unknown, success: string, method = "PATCH") {
    setBusy(true); setError(""); setMessage("");
    const response = await fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json(); setBusy(false);
    if (!response.ok) { setError(`${result.error?.message ?? result.error ?? "Unable to update"}`); return false; }
    setMessage(success); window.setTimeout(() => window.location.reload(), 500); return true;
  }
  async function createTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const body = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/v1/admin/tenants", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) return setError(result.error?.message ?? "Unable to create salon");
    setModal(false); setMessage(`Salon created. Owner invitation: ${window.location.origin}${result.data.invitationUrl}`); window.setTimeout(() => window.location.reload(), 2500);
  }
  async function openDocument(id: string) {
    const response = await fetch(`/api/v1/admin/documents/${id}/url`); const result = await response.json();
    if (!response.ok) return setError(result.error?.message ?? "Unable to open document");
    window.open(result.data.url, "_blank", "noopener,noreferrer");
  }

  /**
   * A control room, not a dashboard.
   *
   * Sidebar rather than top tabs: this is a place you work in all day, the section list will keep
   * growing, and a dark rail makes it unmistakable that you are in Operyx's own tool and not
   * inside a salon's workspace. Confusing those two is the expensive mistake here.
   */
  return <main className="min-h-screen bg-[#F7F6F9] text-[#1F2937] lg:grid lg:grid-cols-[212px_1fr]">
    <aside className="flex flex-col gap-5 bg-[#3D1C5A] p-4 text-white lg:min-h-screen">
      <Link href="/admin" className="flex items-center gap-2.5 px-1">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-[#5B2A86]"><ShieldCheck size={17} /></span>
        <span className="leading-none">
          <span className="block text-sm font-bold">Operyx</span>
          <span className="mt-0.5 block text-[9px] uppercase tracking-[0.14em] text-white/50">Control room</span>
        </span>
      </Link>

      <nav className="grid gap-0.5">
        {([
          ["today", "Today", Activity, data.worklist.length],
          ["clients", "Clients", Store, data.tenants.length],
          ["leads", "Enquiries", Search, data.leads.length],
          ["money", "Money", CircleDollarSign, null],
          ["plans", "Plans", FileText, null],
          ["activity", "Activity", FileCheck2, null],
        ] as const).map(([key, text, Icon, count]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${view === key ? "bg-[#5B2A86] text-white" : "text-white/65 hover:bg-white/10 hover:text-white"}`}
          >
            <Icon size={15} className="shrink-0" />
            <span className="flex-1 text-left">{text}</span>
            {count ? <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${view === key ? "bg-white/25" : "bg-white/10"}`}>{count}</span> : null}
          </button>
        ))}
      </nav>

      <div className="mt-auto border-t border-white/10 pt-3">
        <p className="px-1 text-xs font-semibold">{data.adminName}</p>
        <p className="px-1 text-[10px] text-white/45">Platform admin</p>
        <div className="mt-3 flex gap-2">
          <Link href="/" className="flex-1 rounded-lg bg-white/10 px-2 py-2 text-center text-[11px] font-semibold text-white/70 transition hover:text-white">Website</Link>
          <form action="/api/v1/auth/logout" method="post" className="flex-1">
            <button className="w-full rounded-lg bg-white/10 px-2 py-2 text-[11px] font-semibold text-white/70 transition hover:text-white"><LogOut size={12} className="mr-1 inline" />Out</button>
          </form>
        </div>
      </div>
    </aside>

    <div className="min-w-0 p-5 lg:p-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-serif text-3xl tracking-tight">{viewTitle(view)}</h1>
          <p className="mt-1.5 text-sm text-[#737174]">{viewBlurb(view)}</p>
        </div>
        <button onClick={() => setModal(true)} className="primary shrink-0"><Plus size={15} /> New salon</button>
      </div>

      {(message || error) && <div className={`mt-5 rounded-2xl p-4 text-sm font-bold ${error ? "bg-[#FDECEC] text-[#94302E]" : "bg-[#E9F7F1] text-[#0B6B4F]"}`}>{error || message}</div>}

      {view === "today" && <TodayQueue items={data.worklist} metrics={data.metrics} onOpenSalon={(id) => { setSelectedId(id); setView("clients"); setTab("overview"); }} />}
      {view === "leads" && <Enquiries leads={data.leads} plans={data.plans} busy={busy} mutate={mutate} />}
      {view === "money" && <Money metrics={data.metrics} tenants={data.tenants} plans={data.plans} />}
      {view === "plans" && <PlansEditor plans={data.plans} busy={busy} mutate={mutate} />}
      {view === "activity" && <ActivityLog logs={audit} tenants={data.tenants} />}

      {view === "clients" && <div className="mt-7 grid gap-6 xl:grid-cols-[390px_1fr]">
        <aside className="h-fit overflow-hidden rounded-2xl border border-[#EFEAF3] bg-white">
          <div className="border-b border-[#EFEAF3] p-4">
            <div className="flex items-center gap-2 rounded-xl bg-[#F7F6F9] px-3.5 py-2.5">
              <Search size={15} className="text-[#9CA3AF]" />
              <input className="w-full bg-transparent text-sm outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search salon or GSTIN" />
            </div>
            <div className="mt-2.5 flex gap-1.5 overflow-auto pb-0.5">
              {["ALL", "ACTIVE", "PENDING_REVIEW", "DRAFT", "SUSPENDED"].map((item) => (
                <button key={item} onClick={() => setStatus(item)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition ${status === item ? "bg-[#5B2A86] text-white" : "bg-[#F7F6F9] text-[#6B7280] hover:text-[#5B2A86]"}`}>{label(item)}</button>
              ))}
            </div>
          </div>
          <div className="max-h-[640px] overflow-y-auto p-1.5">
            {visible.map((tenant) => (
              <button key={tenant.id} onClick={() => { setSelectedId(tenant.id); setTab("overview"); }} className={`w-full rounded-xl p-3 text-left transition ${selected?.id === tenant.id ? "bg-[#F3E8FF]" : "hover:bg-[#F7F6F9]"}`}>
                <div className="flex items-center gap-2.5">
                  <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${selected?.id === tenant.id ? "bg-white text-[#5B2A86]" : "bg-[#F3E8FF] text-[#5B2A86]"}`}><Store size={16} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <strong className="truncate text-sm">{tenant.name}</strong>
                      {tenant.subscription && <Status value={tenant.subscription.status} />}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-[#9CA3AF]">
                      {tenant.subscription?.planName ?? "No plan"} · {tenant.branches.length} branch{tenant.branches.length === 1 ? "" : "es"}
                    </span>
                  </span>
                </div>
              </button>
            ))}
            {!visible.length && <p className="p-8 text-center text-sm text-[#9CA3AF]">No salons match.</p>}
          </div>
        </aside>
        <section>
          <div className="mb-4 flex gap-2">{(["overview", "documents", "categories"] as const).map((item) => <button key={item} onClick={() => setTab(item)} className={`rounded-full px-4 py-2 text-sm font-bold ${tab === item ? "bg-[#5B2A86] text-white" : "bg-white"}`}>{label(item)}</button>)}</div>
          {selected && tab === "overview" && <Overview tenant={selected} plans={data.plans} busy={busy} mutate={mutate} />}
          {selected && tab === "documents" && <Documents tenant={selected} busy={busy} mutate={mutate} openDocument={openDocument} />}
          {tab === "categories" && <CategoryTemplates templates={data.categoryTemplates} busy={busy} mutate={mutate} />}
        </section>
      </div>}
    </div>
    {modal && <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-5"><form onSubmit={createTenant} className="w-full max-w-xl rounded-3xl bg-white p-7"><div className="flex justify-between"><h2 className="font-serif text-3xl">Create salon</h2><button type="button" onClick={() => setModal(false)}><X /></button></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><Field name="name" label="Salon name" /><Field name="legalName" label="Legal name" required={false} /><Field name="ownerName" label="Owner name" /><Field name="ownerEmail" label="Owner email" type="email" /><Field name="city" label="Primary city" /><label className="text-sm font-bold">Initial plan<select className="field mt-2" name="planId">{data.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label></div><button className="primary mt-6 w-full justify-center">Create and generate invitation</button></form></div>}
  </main>;
}

function viewTitle(view: string) {
  return ({ today: "Today", clients: "Clients", leads: "Enquiries", money: "Money", plans: "Plans", activity: "Activity" } as Record<string, string>)[view] ?? "Operyx";
}
function viewBlurb(view: string) {
  return ({
    today: "What needs you now, ordered by what it costs to ignore.",
    clients: "Every salon on Operyx, their subscription and their setup.",
    leads: "Salons that have enquired but haven't signed up yet.",
    money: "Recurring revenue, what's at risk, and where it comes from.",
    plans: "What we sell, and what it costs. Changes here never re-price existing customers.",
    activity: "Everything that happened, and who did it.",
  } as Record<string, string>)[view] ?? "";
}

/**
 * The work queue.
 *
 * Deliberately not a dashboard. A dashboard tells you how things are; this tells you what to do,
 * top to bottom. An empty list is the goal, not a bug - so it says so rather than showing an
 * apologetic empty state.
 */
function TodayQueue({ items, metrics, onOpenSalon }: {
  items: WorkItem[]; metrics: AdminConsoleData["metrics"]; onOpenSalon: (id: string) => void;
}) {
  /**
   * Severity is carried by colour and a left accent bar, so the shape of the day is readable
   * before a single word is. Red is money leaking now, amber is a customer blocked or about to
   * leave, purple is upcoming, grey is pipeline.
   */
  const tone: Record<string, { wrap: string; chip: string; bar: string }> = {
    PAST_DUE: { wrap: "border-[#F0C4C2] bg-[#FDECEC]", chip: "bg-white/70 text-[#94302E]", bar: "bg-[#C4403E]" },
    TRIAL_EXPIRED: { wrap: "border-[#F0C4C2] bg-[#FDECEC]", chip: "bg-white/70 text-[#94302E]", bar: "bg-[#C4403E]" },
    BRANCH_APPROVAL: { wrap: "border-[#ECD7A7] bg-[#FFF7DF]", chip: "bg-white/70 text-[#865C12]", bar: "bg-[#B57900]" },
    TRIAL_ENDING: { wrap: "border-[#ECD7A7] bg-[#FFF7DF]", chip: "bg-white/70 text-[#865C12]", bar: "bg-[#B57900]" },
    RENEWAL_DUE: { wrap: "border-[#E3D9EE] bg-white", chip: "bg-[#F3E8FF] text-[#5B2A86]", bar: "bg-[#5B2A86]" },
    NEVER_ACTIVATED: { wrap: "border-[#E3D9EE] bg-white", chip: "bg-[#F3E8FF] text-[#5B2A86]", bar: "bg-[#5B2A86]" },
    LEAD_FOLLOW_UP: { wrap: "border-[#E5E7EB] bg-white", chip: "bg-[#F7F6F9] text-[#6B7280]", bar: "bg-[#9CA3AF]" },
  };

  return <div className="mt-6 space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl bg-[#5B2A86] p-4 text-white">
        <p className="text-xs text-white/70">Monthly recurring revenue</p>
        <strong className="mt-1 block text-3xl">{inr.format(metrics.mrr)}</strong>
      </div>
      {[["Paying", String(metrics.paying), ""], ["In trial", String(metrics.trialing), ""], ["Past due", String(metrics.pastDue), metrics.pastDue ? "text-[#C4403E]" : ""]].map(([text, value, cls]) => (
        <div key={text} className="rounded-2xl border border-[#EFEAF3] bg-white p-4"><p className="text-xs text-[#737174]">{text}</p><strong className={`mt-1 block text-3xl ${cls}`}>{value}</strong></div>
      ))}
    </div>

    {items.length === 0 ? (
      <div className="rounded-2xl border border-[#EFEAF3] bg-white p-12 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-[#E9F7F1] text-[#0B6B4F]"><Check size={22} /></span>
        <h3 className="mt-4 font-serif text-2xl">Nothing needs you right now</h3>
        <p className="mt-2 text-sm text-[#737174]">No failed payments, expiring trials, or branches waiting. This is what done looks like.</p>
      </div>
    ) : (
      <div className="space-y-2">
        {items.map((item) => {
          const style = tone[item.kind] ?? tone.LEAD_FOLLOW_UP;
          const isLead = item.kind === "LEAD_FOLLOW_UP";
          return (
            <button
              key={`${item.kind}-${item.id}`}
              onClick={() => !isLead && onOpenSalon(item.id)}
              className={`flex w-full items-stretch gap-0 overflow-hidden rounded-xl border text-left transition hover:shadow-[0_2px_12px_rgba(91,42,134,0.08)] ${style.wrap}`}
            >
              <span className={`w-1 shrink-0 ${style.bar}`} />
              <span className="flex flex-1 items-center gap-3 p-3.5">
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.08em] ${style.chip}`}>{label(item.kind)}</span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm text-[#1F2937]">{item.title}</strong>
                  <span className="mt-0.5 block truncate text-xs text-[#6B7280]">{item.detail}</span>
                </span>
                {!isLead && <ChevronRight size={15} className="shrink-0 text-[#9CA3AF]" />}
              </span>
            </button>
          );
        })}
      </div>
    )}
  </div>;
}

/** Prospects. A lead is not a salon, so it lives here rather than polluting the client list. */
function Enquiries({ leads, plans, busy, mutate }: {
  leads: Lead[]; plans: Plan[]; busy: boolean;
  mutate: (path: string, body: unknown, success: string, method?: string) => Promise<boolean>;
}) {
  const [adding, setAdding] = useState(false);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const followUp = String(form.get("followUpAt") || "");
    await mutate("/api/v1/admin/leads", {
      salonName: form.get("salonName"), contactName: form.get("contactName"), phone: form.get("phone"),
      email: String(form.get("email") || "") || undefined, city: String(form.get("city") || "") || undefined,
      branchCount: Number(form.get("branchCount") || 1), staffCount: Number(form.get("staffCount") || 0),
      source: String(form.get("source") || "") || undefined,
      interestedPlanId: String(form.get("interestedPlanId") || "") || undefined,
      notes: String(form.get("notes") || "") || undefined,
      followUpAt: followUp ? new Date(followUp).toISOString() : undefined,
    }, "Enquiry saved.", "POST");
  }

  return <div className="mt-7 space-y-5">
    <div className="flex justify-end"><button onClick={() => setAdding(!adding)} className="primary"><Plus size={15} /> Add enquiry</button></div>

    {adding && <form onSubmit={create} className="rounded-3xl bg-white p-6">
      <h3 className="font-serif text-2xl">New enquiry</h3>
      <p className="mt-1 text-sm text-[#737174]">Branches and staff decide which plan to quote. Always set a follow-up date — an enquiry with no next step is one being lost.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field name="salonName" label="Salon name" />
        <Field name="contactName" label="Contact person" />
        <Field name="phone" label="Phone" />
        <Field name="email" label="Email" type="email" required={false} />
        <Field name="city" label="City" required={false} />
        <Field name="source" label="Where from" required={false} />
        <Field name="branchCount" label="Branches" type="number" required={false} />
        <Field name="staffCount" label="Staff" type="number" required={false} />
        <Field name="followUpAt" label="Follow up on" type="date" required={false} />
        <label className="text-sm font-bold">Plan discussed<select name="interestedPlanId" className="field mt-2"><option value="">Not yet</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
        <label className="text-sm font-bold sm:col-span-2">Notes<input name="notes" className="field mt-2" /></label>
      </div>
      <button disabled={busy} className="primary mt-5">Save enquiry</button>
    </form>}

    <div className="overflow-hidden rounded-3xl bg-white">
      {leads.length ? <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-[#737174]"><tr><th className="p-4">Salon</th><th className="p-4">Contact</th><th className="p-4">Size</th><th className="p-4">Follow up</th><th className="p-4">Status</th><th className="p-4"></th></tr></thead>
        <tbody>{leads.map((lead) => <tr key={lead.id} className="border-t border-black/6">
          <td className="p-4"><strong>{lead.salonName}</strong><p className="text-xs text-[#737174]">{lead.city || "—"}{lead.source ? ` · ${lead.source}` : ""}</p></td>
          <td className="p-4">{lead.contactName}<p className="text-xs text-[#737174]">{lead.phone}</p></td>
          <td className="p-4 text-xs">{lead.branchCount} branch · {lead.staffCount} staff{lead.interestedPlan ? <p className="text-[#5B2A86]">{lead.interestedPlan}</p> : null}</td>
          <td className="p-4 text-xs">{lead.followUpAt ? formatDate(lead.followUpAt) : <span className="text-[#C4403E]">Not set</span>}</td>
          <td className="p-4"><Status value={lead.status} /></td>
          <td className="p-4">
            <select
              defaultValue={lead.status}
              onChange={(event) => void mutate("/api/v1/admin/leads", { id: lead.id, status: event.target.value }, "Enquiry updated.")}
              className="rounded-lg border border-black/10 px-2 py-1 text-xs font-bold"
            >
              {["NEW", "CONTACTED", "DEMO_BOOKED", "QUOTED", "WON", "LOST"].map((value) => <option key={value} value={value}>{label(value)}</option>)}
            </select>
          </td>
        </tr>)}</tbody>
      </table> : <p className="p-12 text-center text-sm text-[#737174]">No open enquiries. Add one when a salon gets in touch.</p>}
    </div>
  </div>;
}

/** Where the money is, and where it is going. */
function Money({ metrics, tenants, plans }: { metrics: AdminConsoleData["metrics"]; tenants: Tenant[]; plans: Plan[] }) {
  const byPlan = plans.map((plan) => {
    const subscribers = tenants.filter((tenant) => tenant.subscription?.planId === plan.id && tenant.subscription.status === "ACTIVE");
    return { plan, count: subscribers.length, mrr: subscribers.reduce((sum, tenant) => sum + (tenant.subscription?.monthlyValuePaise ?? 0), 0) / 100 };
  });

  return <div className="mt-7 space-y-5">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-3xl bg-[#5B2A86] p-5 text-white"><p className="text-xs opacity-70">Monthly recurring revenue</p><strong className="mt-1 block text-3xl">{inr.format(metrics.mrr)}</strong><p className="mt-1 text-xs opacity-60">Annual divided by 12. Trials count as zero.</p></div>
      <div className="rounded-3xl bg-white p-5"><p className="text-xs text-[#737174]">Paying salons</p><strong className="mt-1 block text-2xl">{metrics.paying}</strong></div>
      <div className="rounded-3xl bg-white p-5"><p className="text-xs text-[#737174]">In trial</p><strong className="mt-1 block text-2xl">{metrics.trialing}</strong><p className="mt-1 text-xs text-[#737174]">Pipeline, not revenue</p></div>
      <div className="rounded-3xl bg-white p-5"><p className="text-xs text-[#737174]">Past due</p><strong className={`mt-1 block text-2xl ${metrics.pastDue ? "text-[#C4403E]" : ""}`}>{metrics.pastDue}</strong></div>
    </div>

    <section className="rounded-3xl bg-white p-6">
      <h3 className="font-serif text-2xl">Revenue by plan</h3>
      <p className="mt-1 text-sm text-[#737174]">Where the money actually comes from — worth knowing before changing a price.</p>
      <table className="mt-5 w-full text-left text-sm">
        <thead className="text-xs uppercase text-[#737174]"><tr><th className="pb-3">Plan</th><th className="pb-3">List price</th><th className="pb-3">Paying</th><th className="pb-3 text-right">MRR</th></tr></thead>
        <tbody>{byPlan.map(({ plan, count, mrr }) => <tr key={plan.id} className="border-t border-black/6">
          <td className="py-3"><strong>{plan.name}</strong></td>
          <td className="py-3 text-[#737174]">{inr.format(plan.monthlyPrice)}/mo</td>
          <td className="py-3">{count}</td>
          <td className="py-3 text-right font-bold">{inr.format(mrr)}</td>
        </tr>)}</tbody>
      </table>
    </section>
  </div>;
}

/** Change what we sell without waiting for a deploy. */
function PlansEditor({ plans, busy, mutate }: {
  plans: Plan[]; busy: boolean;
  mutate: (path: string, body: unknown, success: string, method?: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>, plan: Plan) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const number = (name: string, fallback: number) => { const raw = form.get(name); return raw === null || raw === "" ? fallback : Number(raw); };
    await mutate("/api/v1/admin/plans", {
      id: plan.id, code: plan.code,
      name: String(form.get("name") || plan.name),
      description: String(form.get("description") || "") || undefined,
      monthlyPriceRupees: number("monthlyPrice", plan.monthlyPrice),
      annualPriceRupees: number("annualPrice", plan.annualPrice),
      setupFeeRupees: number("setupFee", plan.setupFee),
      trialDays: number("trialDays", plan.trialDays),
      maxBranches: number("maxBranches", plan.maxBranches),
      maxStaff: number("maxStaff", plan.maxStaff),
      maxServices: number("maxServices", plan.maxServices),
      maxMonthlyAppointments: plan.maxMonthlyAppointments,
      maxStorageMb: plan.maxStorageMb,
      features: plan.features,
      isPublic: form.get("isPublic") === "on",
      isActive: plan.isActive,
      sortOrder: plan.sortOrder,
    }, "Plan saved.", "POST");
  }

  return <div className="mt-7 space-y-4">
    <p className="rounded-2xl bg-[#FFF7DF] p-4 text-sm font-semibold text-[#865C12]">
      Changing a price here never re-prices an existing customer. A salon keeps what they agreed until their subscription is changed. Set any limit to 0 for unlimited.
    </p>
    {plans.map((plan) => <section key={plan.id} className="rounded-3xl bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-serif text-2xl">{plan.name}</h3>
          <p className="text-sm text-[#737174]">{inr.format(plan.monthlyPrice)}/mo · {inr.format(plan.annualPrice)}/yr · {plan.trialDays}-day trial · {plan.isPublic ? "public" : "hidden"}</p>
        </div>
        <button onClick={() => setEditing(editing === plan.id ? null : plan.id)} className="rounded-full border border-black/10 px-4 py-2 text-sm font-bold">{editing === plan.id ? "Cancel" : "Edit"}</button>
      </div>

      {editing === plan.id && <form onSubmit={(event) => void save(event, plan)} className="mt-5 border-t border-black/6 pt-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-bold">Name<input name="name" defaultValue={plan.name} className="field mt-2" /></label>
          <label className="text-sm font-bold">Monthly ₹<input name="monthlyPrice" type="number" defaultValue={plan.monthlyPrice} className="field mt-2" /></label>
          <label className="text-sm font-bold">Annual ₹<input name="annualPrice" type="number" defaultValue={plan.annualPrice} className="field mt-2" /></label>
          <label className="text-sm font-bold">Setup fee ₹<input name="setupFee" type="number" defaultValue={plan.setupFee} className="field mt-2" /></label>
          <label className="text-sm font-bold">Trial days<input name="trialDays" type="number" defaultValue={plan.trialDays} className="field mt-2" /></label>
          <label className="text-sm font-bold">Branches<input name="maxBranches" type="number" defaultValue={plan.maxBranches} className="field mt-2" /></label>
          <label className="text-sm font-bold">Staff<input name="maxStaff" type="number" defaultValue={plan.maxStaff} className="field mt-2" /></label>
          <label className="text-sm font-bold">Services<input name="maxServices" type="number" defaultValue={plan.maxServices} className="field mt-2" /></label>
          <label className="text-sm font-bold lg:col-span-3">Description<input name="description" defaultValue={plan.description ?? ""} className="field mt-2" /></label>
          <label className="mt-8 text-sm font-bold"><input name="isPublic" type="checkbox" defaultChecked={plan.isPublic} /> Show publicly</label>
        </div>
        <button disabled={busy} className="primary mt-5">Save plan</button>
      </form>}
    </section>)}
  </div>;
}

function CategoryTemplates({ templates, busy, mutate }: { templates: CategoryTemplate[]; busy: boolean; mutate: (path: string, body: unknown, success: string, method?: string) => Promise<boolean> }) {
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate("/api/v1/admin/service-category-templates", {
      name: form.get("name"),
      description: form.get("description"),
      color: form.get("color"),
      sortOrder: templates.length,
    }, "Category template created.", "POST");
  }
  return <section className="rounded-3xl bg-white p-6"><h2 className="font-serif text-3xl">Service category templates</h2><p className="mt-2 text-sm text-[#737174]">Active templates are available for salon owners to copy into their own master catalogue.</p><form onSubmit={create} className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_100px_auto]"><Field name="name" label="Template name" /><Field name="description" label="Description" required={false} /><label className="text-sm font-bold">Colour<input className="field mt-2 h-12" name="color" type="color" defaultValue="#1789AA" /></label><button disabled={busy} className="primary self-end justify-center">Add template</button></form><div className="mt-6 grid gap-3 md:grid-cols-2">{templates.map((template) => <div key={template.id} className={`rounded-2xl border border-black/8 p-4 ${template.isActive ? "" : "opacity-50"}`}><div className="flex items-center gap-3"><span className="size-5 rounded-full" style={{ backgroundColor: template.color ?? "#1789AA" }} /><div className="min-w-0 flex-1"><strong>{template.name}</strong><p className="text-xs text-[#737174]">{template.description ?? "No description"}</p></div><button disabled={busy} onClick={() => void mutate(`/api/v1/admin/service-category-templates/${template.id}`, { isActive: !template.isActive }, template.isActive ? "Template archived." : "Template restored.")} className="rounded-full border px-3 py-1.5 text-xs font-bold">{template.isActive ? "Archive" : "Restore"}</button></div></div>)}</div></section>;
}

/**
 * Run one salon's subscription.
 *
 * Everything needed to sell without a payment gateway: put them on a plan, start or extend a
 * trial, agree a different price, and mark them paid when the bank transfer lands. Razorpay will
 * automate the collection later; none of these decisions move.
 */
function SubscriptionPanel({ tenant, plans, busy, mutate }: {
  tenant: Tenant; plans: Plan[]; busy: boolean;
  mutate: (path: string, body: unknown, success: string, method?: string) => Promise<boolean>;
}) {
  const subscription = tenant.subscription;
  const [planId, setPlanId] = useState(subscription?.planId ?? plans[0]?.id ?? "");
  const [period, setPeriod] = useState(subscription?.billingPeriod ?? "MONTHLY");
  const [agreed, setAgreed] = useState("");

  const endpoint = `/api/v1/admin/tenants/${tenant.id}/subscription`;
  const cap = (value: number, noun: string) => value <= 0 ? `unlimited ${noun}` : `${value} ${noun}`;
  const day = (value: string | null) => value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : null;

  const tone = subscription?.status === "ACTIVE" ? "bg-[#dff0e7] text-[#285543]"
    : subscription?.status === "TRIALING" ? "bg-[#EFE8F6] text-[#5B2A86]"
    : subscription?.status === "PAST_DUE" ? "bg-[#FEF3C7] text-[#B45309]"
    : "bg-[#f2ded8] text-[#995849]";

  return <div className="mt-6 rounded-2xl border border-black/8 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <strong className="text-sm">Subscription</strong>
        {subscription && <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>{label(subscription.status)}</span>}
      </div>
      {subscription && subscription.monthlyValuePaise > 0 && (
        <span className="text-sm font-bold text-[#285543]">{inr.format(subscription.monthlyValuePaise / 100)}/month</span>
      )}
    </div>

    {subscription && (
      <p className="mt-1.5 text-xs text-[#737174]">
        {subscription.planName} · billed {subscription.billingPeriod.toLowerCase()}
        {subscription.trialEndsAt ? ` · trial ends ${day(subscription.trialEndsAt)}` : ""}
        {subscription.currentPeriodEnd ? ` · paid to ${day(subscription.currentPeriodEnd)}` : ""}
      </p>
    )}

    <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_140px]">
      <select className="field" value={planId} onChange={(event) => setPlanId(event.target.value)}>
        {/* A limit of 0 means unlimited, so say so rather than printing a literal "0 branches". */}
        {plans.map((plan) => <option key={plan.id} value={plan.id}>
          {plan.name} · {cap(plan.maxBranches, "branches")} · {cap(plan.maxStaff, "staff")}
        </option>)}
      </select>
      <select className="field" value={period} onChange={(event) => setPeriod(event.target.value)}>
        <option value="MONTHLY">Monthly</option>
        <option value="ANNUAL">Annual</option>
      </select>
    </div>

    <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
      {/* A negotiated rate is normal at the franchise end. Recording it here keeps MRR honest
          instead of reporting a list price nobody actually pays. */}
      <input
        className="field"
        type="number"
        value={agreed}
        onChange={(event) => setAgreed(event.target.value)}
        placeholder="Agreed price, if not list (₹)"
      />
      <button
        disabled={busy}
        onClick={() => void mutate(endpoint, {
          planId,
          billingPeriod: period,
          ...(agreed.trim() ? { agreedPriceRupees: Number(agreed) } : {}),
        }, "Subscription updated.", "PATCH")}
        className="primary justify-center"
      >
        Save plan
      </button>
    </div>

    <div className="mt-3 flex flex-wrap gap-2">
      <button disabled={busy} onClick={() => void mutate(endpoint, { status: "TRIALING", trialDays: 14 }, "14-day trial started.", "PATCH")} className="rounded-full border border-black/10 px-3.5 py-2 text-xs font-bold">Start 14-day trial</button>
      <button disabled={busy} onClick={() => void mutate(endpoint, { trialDays: 7 }, "Trial extended.", "PATCH")} className="rounded-full border border-black/10 px-3.5 py-2 text-xs font-bold">Extend 7 days</button>
      {/* Payment received: mark active and set the period they have bought. */}
      <button disabled={busy} onClick={() => void mutate(endpoint, {
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + (period === "ANNUAL" ? 365 : 30) * 86_400_000).toISOString(),
      }, "Marked as paid.", "PATCH")} className="rounded-full bg-[#dff0e7] px-3.5 py-2 text-xs font-bold text-[#285543]">Mark paid</button>
      <button disabled={busy} onClick={() => void mutate(endpoint, { status: "PAST_DUE" }, "Marked past due.", "PATCH")} className="rounded-full bg-[#FEF3C7] px-3.5 py-2 text-xs font-bold text-[#B45309]">Payment failed</button>
      <button disabled={busy} onClick={() => void mutate(endpoint, { status: "CANCELLED" }, "Subscription cancelled.", "PATCH")} className="rounded-full bg-[#f2ded8] px-3.5 py-2 text-xs font-bold text-[#995849]">Cancel</button>
    </div>
  </div>;
}

function Overview({ tenant, plans, busy, mutate }: { tenant: Tenant; plans: Plan[]; busy: boolean; mutate: (path: string, body: unknown, success: string, method?: string) => Promise<boolean> }) {
  const [note, setNote] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [inviteEmail, setInviteEmail] = useState(tenant.invitations[0]?.email ?? "");
  const [invitationUrl, setInvitationUrl] = useState("");
  async function inviteOwner() {
    const response = await fetch(`/api/v1/admin/tenants/${tenant.id}/invitations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: inviteEmail }) });
    const result = await response.json();
    if (response.ok) setInvitationUrl(`${window.location.origin}${result.data.invitationUrl}`);
  }
  return <div className="space-y-5">
    <section className="rounded-3xl bg-white p-6"><div className="flex flex-col justify-between gap-4 md:flex-row"><div><div className="flex items-center gap-3"><h2 className="font-serif text-3xl">{tenant.name}</h2><Status value={tenant.status} /></div><p className="mt-2 text-sm text-[#737174]">{tenant.legalName ?? "Legal name pending"} · {tenant.gstin ?? "GSTIN pending"} · {tenant.panNumber ?? "PAN pending"}</p></div><div className="text-sm"><strong>{tenant.owner?.name ?? "Owner invitation pending"}</strong><p className="text-[#737174]">{tenant.owner?.email ?? tenant.invitations[0]?.email}</p></div></div><div className="mt-6 grid gap-3 sm:grid-cols-4"><Info label="Customers" value={String(tenant.customerCount)} /><Info label="Services" value={String(tenant.serviceCount)} /><Info label="Plan" value={tenant.subscription?.planName ?? "Unassigned"} /><Info label="Owner access" value={tenant.owner?.isActive === false ? "Disabled" : "Enabled"} /></div>
      <SubscriptionPanel tenant={tenant} plans={plans} busy={busy} mutate={mutate} />
      <div className="mt-3 flex flex-wrap gap-2"><button disabled={busy} onClick={() => void mutate(`/api/v1/admin/tenants/${tenant.id}/status`, { status: "ACTIVE", ownerAccess: true }, "Tenant activated.")} className="rounded-full bg-[#dff0e7] px-4 py-2 text-sm font-bold text-[#285543]">Activate access</button><button disabled={busy} onClick={() => void mutate(`/api/v1/admin/tenants/${tenant.id}/status`, { status: "SUSPENDED", ownerAccess: false }, "Tenant suspended.")} className="rounded-full bg-[#f2ded8] px-4 py-2 text-sm font-bold text-[#995849]">Suspend tenant</button><button disabled={busy} onClick={() => void mutate(`/api/v1/admin/tenants/${tenant.id}/status`, { status: "ARCHIVED", ownerAccess: false }, "Tenant archived.")} className="flex items-center gap-2 rounded-full border border-black/10 px-4 py-2 text-sm font-bold"><Archive size={14} /> Archive</button></div>
      {!tenant.owner && <div className="mt-5 rounded-2xl border border-black/8 p-4"><strong className="text-sm">Owner invitation</strong><div className="mt-3 flex gap-2"><input className="field" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="owner@salon.com" /><button onClick={() => void inviteOwner()} className="primary shrink-0">Generate invite</button></div>{invitationUrl && <p className="mt-3 break-all rounded-xl bg-[#F7F6F9] p-3 text-xs font-bold">{invitationUrl}</p>}</div>}
    </section>
    <section className="rounded-3xl bg-white p-6"><h3 className="font-serif text-2xl">Branches</h3><div className="mt-5 space-y-4">{tenant.branches.map((branch) => { const complete = Object.values(branch.checklist).every(Boolean); return <div key={branch.id} className="rounded-2xl border border-black/8 p-5"><div className="flex flex-col justify-between gap-3 md:flex-row"><div><div className="flex items-center gap-2"><strong>{branch.name}</strong><Status value={branch.publicationStatus} /></div><p className="mt-1 text-sm text-[#737174]">{branch.address}, {branch.city}</p><p className="mt-2 text-xs text-[#737174]">{branch.appointments} appointments · {branch.staff} staff · {branch.invoices} invoices</p></div><div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">{Object.entries(branch.checklist).map(([item, done]) => <span key={item} className={done ? "font-bold text-[#285543]" : "text-[#995849]"}>{done ? "✓" : "○"} {label(item)}</span>)}</div></div><textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Decision note" className="field mt-4 min-h-20" /><div className="mt-3 flex flex-wrap gap-2"><button disabled={busy || !complete || branch.publicationStatus !== "PENDING_REVIEW"} onClick={() => void mutate(`/api/v1/admin/branches/${branch.id}/review`, { status: "APPROVED", note: reviewNote }, "Branch approved.")} className="rounded-full bg-[#2f6a55] px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Approve & publish</button><button disabled={busy || branch.publicationStatus !== "PENDING_REVIEW"} onClick={() => void mutate(`/api/v1/admin/branches/${branch.id}/review`, { status: "REJECTED", note: reviewNote }, "Corrections requested.")} className="rounded-full bg-[#f2ded8] px-4 py-2 text-sm font-bold text-[#995849] disabled:opacity-40">Request corrections</button>{branch.publicationStatus === "APPROVED" && <button disabled={busy} onClick={() => void mutate(`/api/v1/admin/branches/${branch.id}/review`, { status: "SUSPENDED", note: reviewNote }, "Branch suspended.")} className="rounded-full border px-4 py-2 text-sm font-bold">Suspend branch</button>}{branch.publicationStatus === "SUSPENDED" && <button disabled={busy} onClick={() => void mutate(`/api/v1/admin/branches/${branch.id}/review`, { status: "APPROVED", note: reviewNote }, "Branch republished.")} className="rounded-full bg-[#2f6a55] px-4 py-2 text-sm font-bold text-white">Republish</button>}</div>{branch.reviews[0] && <p className="mt-3 text-xs text-[#737174]">Latest: {label(branch.reviews[0].toStatus)} by {branch.reviews[0].reviewer}{branch.reviews[0].note ? ` · ${branch.reviews[0].note}` : ""}</p>}</div>; })}</div></section>
    <section className="rounded-3xl bg-white p-6"><h3 className="font-serif text-2xl">Support notes</h3><div className="mt-4 space-y-2">{tenant.notes.map((item) => <div key={item.id} className="rounded-xl bg-[#F7F6F9] p-3 text-sm"><p>{item.note}</p><p className="mt-1 text-xs text-[#737174]">{item.author} · {formatDate(item.createdAt)}</p></div>)}</div><textarea className="field mt-4 min-h-20" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Internal support note" /><button disabled={busy || note.trim().length < 2} onClick={() => void mutate(`/api/v1/admin/tenants/${tenant.id}/notes`, { note }, "Support note added.", "POST")} className="primary mt-3">Add note</button></section>
  </div>;
}

function Documents({ tenant, busy, mutate, openDocument }: { tenant: Tenant; busy: boolean; mutate: (path: string, body: unknown, success: string, method?: string) => Promise<boolean>; openDocument: (id: string) => Promise<void> }) {
  return <section className="rounded-3xl bg-white p-6"><h2 className="font-serif text-3xl">Verification documents</h2><p className="mt-2 text-sm text-[#737174]">Private evidence is served through short-lived signed links.</p><div className="mt-6 space-y-3">{tenant.documents.map((document) => <div key={document.id} className="rounded-2xl border border-black/8 p-4"><div className="flex flex-col justify-between gap-3 md:flex-row md:items-center"><div className="flex items-center gap-3"><FileText className="text-[#5B2A86]" /><div><strong>{label(document.type)}</strong><p className="text-xs text-[#737174]">{document.fileName} · {formatDate(document.createdAt)}</p></div></div><div className="flex items-center gap-2"><Status value={document.status} /><button onClick={() => void openDocument(document.id)} className="rounded-full border px-3 py-2 text-xs font-bold">View</button></div></div>{document.status === "PENDING" && <div className="mt-4 flex gap-2"><button disabled={busy} onClick={() => void mutate(`/api/v1/admin/documents/${document.id}/review`, { status: "APPROVED" }, "Document approved.")} className="rounded-full bg-[#dff0e7] px-4 py-2 text-xs font-bold text-[#285543]">Approve</button><button disabled={busy} onClick={() => void mutate(`/api/v1/admin/documents/${document.id}/review`, { status: "REJECTED", note: "Please upload a clear and current document." }, "Document rejected.")} className="rounded-full bg-[#f2ded8] px-4 py-2 text-xs font-bold text-[#995849]">Reject</button></div>}{document.reviewNote && <p className="mt-3 text-xs text-[#737174]">{document.reviewNote}</p>}</div>)}{!tenant.documents.length && <p className="py-10 text-center text-sm text-[#737174]">No documents uploaded.</p>}</div></section>;
}

function ActivityLog({ logs, tenants }: { logs: AdminConsoleData["auditLogs"]; tenants: Tenant[] }) { return <section className="rounded-3xl bg-white p-6"><h2 className="font-serif text-3xl">System activity</h2><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="text-xs uppercase text-[#737174]"><tr><th className="pb-3">Action</th><th className="pb-3">Tenant</th><th className="pb-3">Entity</th><th className="pb-3">Actor</th><th className="pb-3">Date</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id} className="border-t border-black/6"><td className="py-3 font-bold">{label(log.action)}</td><td>{tenants.find((tenant) => tenant.id === log.tenantId)?.name ?? "Platform"}</td><td>{log.entity}</td><td>{log.actor}</td><td>{formatDate(log.createdAt)}</td></tr>)}</tbody></table></div></section>; }
function Status({ value }: { value: string }) { const good = ["ACTIVE", "APPROVED"].includes(value); const bad = ["REJECTED", "SUSPENDED", "ARCHIVED"].includes(value); return <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold ${good ? "bg-[#dff0e7] text-[#285543]" : bad ? "bg-[#f2ded8] text-[#995849]" : "bg-[#eee6d7] text-[#80632f]"}`}>{label(value)}</span>; }
function Info({ label: text, value }: { label: string; value: string }) { return <div className="rounded-xl bg-[#F7F6F9] p-3"><p className="text-xs text-[#737174]">{text}</p><strong className="mt-1 block text-sm">{value}</strong></div>; }
function Field({ name, label: text, type = "text", required = true }: { name: string; label: string; type?: string; required?: boolean }) { return <label className="text-sm font-bold">{text}<input className="field mt-2" name={name} type={type} required={required} /></label>; }
function label(value: string) { return value.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(value)); }
