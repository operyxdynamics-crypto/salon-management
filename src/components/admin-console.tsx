"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, Archive, Building2, Check, ChevronRight, CircleDollarSign, ExternalLink, FileCheck2, FileText, LogOut, Plus, Search, ShieldCheck, Store, X } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { inr } from "@/lib/format";

type Plan = { id: string; code: string; name: string; description: string | null; maxBranches: number; maxStaff: number; maxServices: number; maxMonthlyAppointments: number; maxStorageMb: number };
type CategoryTemplate = { id: string; name: string; description: string | null; color: string | null; icon: string | null; sortOrder: number; isActive: boolean };
type Document = { id: string; branchId: string | null; type: string; fileName: string; status: string; reviewNote: string | null; createdAt: string };
type Branch = { id: string; name: string; city: string; address: string; phone: string | null; email: string | null; publicationStatus: string; isPublished: boolean; submittedAt: string | null; appointments: number; staff: number; invoices: number; checklist: Record<string, boolean>; reviews: Array<{ id: string; toStatus: string; note: string | null; reviewer: string; createdAt: string }> };
type Tenant = {
  id: string; name: string; slug: string; legalName: string | null; gstin: string | null; panNumber: string | null; status: string; onboardingStep: number; createdAt: string;
  owner: { id: string; name: string; email: string | null; phone: string | null; isActive: boolean } | null; customerCount: number; serviceCount: number;
  subscription: { id: string; planId: string; planName: string; planCode: string } | null; documents: Document[]; branches: Branch[];
  notes: Array<{ id: string; note: string; author: string; createdAt: string }>; invitations: Array<{ id: string; email: string; status: string; expiresAt: string }>;
};
export type AdminConsoleData = {
  adminName: string;
  metrics: { tenants: number; activeTenants: number; pendingBranches: number; approvedBranches: number; appointments: number; recordedRevenue: number };
  plans: Plan[];
  categoryTemplates: CategoryTemplate[];
  tenants: Tenant[];
  auditLogs: Array<{ id: string; action: string; entity: string; entityId: string | null; tenantId: string | null; actor: string; createdAt: string }>;
};

export function AdminConsole({ data }: { data: AdminConsoleData }) {
  const [selectedId, setSelectedId] = useState(data.tenants[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
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

  return <main className="min-h-screen bg-[#f3f1ed] text-[#252320]">
    <header className="bg-[#203a36] text-white"><div className="mx-auto flex h-20 max-w-[1600px] items-center justify-between px-5 lg:px-8"><Link href="/admin" className="flex items-center gap-2.5"><BrandMark light /></Link><div className="flex items-center gap-3"><div className="hidden text-right sm:block"><p className="text-sm font-bold">{data.adminName}</p><p className="text-xs text-white/50">Super administrator</p></div><ShieldCheck size={20} /><form action="/api/v1/auth/logout" method="post"><button className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2.5 text-sm font-bold"><LogOut size={16} /> Log out</button></form></div></div></header>
    <div className="mx-auto max-w-[1600px] p-5 lg:p-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-[#9e5d55]">Platform control center</p><h1 className="mt-2 font-serif text-4xl">Salon governance</h1><p className="mt-2 text-[#746d66]">Onboarding, verification, branch publication, subscriptions, access, and system activity.</p></div><div className="flex gap-2"><Link href="/" className="flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-bold"><ExternalLink size={15} /> Marketplace</Link><button onClick={() => setModal(true)} className="primary"><Plus size={15} /> Create salon</button></div></div>
      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">{[
        ["Tenants", data.metrics.tenants, Building2], ["Active", data.metrics.activeTenants, Check], ["Pending branches", data.metrics.pendingBranches, FileCheck2],
        ["Published", data.metrics.approvedBranches, Store], ["Appointments", data.metrics.appointments, Activity], ["Recorded revenue", inr.format(data.metrics.recordedRevenue), CircleDollarSign],
      ].map(([labelText, value, Icon]) => { const MetricIcon = Icon as typeof Building2; return <div key={String(labelText)} className="rounded-3xl bg-white p-5"><MetricIcon size={19} className="text-[#9e5d55]" /><p className="mt-4 text-xs text-[#817970]">{String(labelText)}</p><strong className="mt-1 block text-2xl">{String(value)}</strong></div>; })}</div>
      {(message || error) && <div className={`mt-5 rounded-2xl p-4 text-sm font-bold ${error ? "bg-[#f2ded8] text-[#995849]" : "bg-[#dff0e7] text-[#285543]"}`}>{error || message}</div>}
      <div className="mt-7 grid gap-6 xl:grid-cols-[390px_1fr]">
        <aside className="overflow-hidden rounded-3xl bg-white"><div className="border-b border-black/6 p-5"><div className="flex items-center gap-2 rounded-xl bg-[#f3f1ed] px-4 py-3"><Search size={16} /><input className="w-full bg-transparent text-sm outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search salons, GSTIN, activity" /></div><div className="mt-3 flex gap-2 overflow-auto">{["ALL", "DRAFT", "PENDING_REVIEW", "ACTIVE", "SUSPENDED", "ARCHIVED"].map((item) => <button key={item} onClick={() => setStatus(item)} className={`rounded-full px-3 py-2 text-xs font-bold ${status === item ? "bg-[#203a36] text-white" : "bg-[#f3f1ed]"}`}>{label(item)}</button>)}</div></div><div className="max-h-[700px] overflow-y-auto p-2">{visible.map((tenant) => <button key={tenant.id} onClick={() => { setSelectedId(tenant.id); setTab("overview"); }} className={`w-full rounded-2xl p-4 text-left ${selected?.id === tenant.id ? "bg-[#eee8df]" : "hover:bg-[#f7f5f1]"}`}><div className="flex gap-3"><span className="grid size-10 place-items-center rounded-xl bg-white"><Store size={18} /></span><span className="min-w-0 flex-1"><span className="flex justify-between gap-2"><strong className="truncate text-sm">{tenant.name}</strong><Status value={tenant.status} /></span><span className="mt-1 block text-xs text-[#817970]">{tenant.branches.length} branch · {tenant.subscription?.planName ?? tenant.status}</span></span><ChevronRight size={15} /></div></button>)}{!visible.length && <p className="p-8 text-center text-sm text-[#817970]">No tenants match.</p>}</div></aside>
        <section>
          <div className="mb-4 flex gap-2">{(["overview", "documents", "categories", "activity"] as const).map((item) => <button key={item} onClick={() => setTab(item)} className={`rounded-full px-4 py-2 text-sm font-bold ${tab === item ? "bg-[#203a36] text-white" : "bg-white"}`}>{label(item)}</button>)}</div>
          {selected && tab === "overview" && <Overview tenant={selected} plans={data.plans} busy={busy} mutate={mutate} />}
          {selected && tab === "documents" && <Documents tenant={selected} busy={busy} mutate={mutate} openDocument={openDocument} />}
          {tab === "categories" && <CategoryTemplates templates={data.categoryTemplates} busy={busy} mutate={mutate} />}
          {tab === "activity" && <ActivityLog logs={audit} tenants={data.tenants} />}
        </section>
      </div>
    </div>
    {modal && <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-5"><form onSubmit={createTenant} className="w-full max-w-xl rounded-3xl bg-white p-7"><div className="flex justify-between"><h2 className="font-serif text-3xl">Create salon</h2><button type="button" onClick={() => setModal(false)}><X /></button></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><Field name="name" label="Salon name" /><Field name="legalName" label="Legal name" required={false} /><Field name="ownerName" label="Owner name" /><Field name="ownerEmail" label="Owner email" type="email" /><Field name="city" label="Primary city" /><label className="text-sm font-bold">Initial plan<select className="field mt-2" name="planId">{data.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label></div><button className="primary mt-6 w-full justify-center">Create and generate invitation</button></form></div>}
  </main>;
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
  return <section className="rounded-3xl bg-white p-6"><h2 className="font-serif text-3xl">Service category templates</h2><p className="mt-2 text-sm text-[#817970]">Active templates are available for salon owners to copy into their own master catalogue.</p><form onSubmit={create} className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_100px_auto]"><Field name="name" label="Template name" /><Field name="description" label="Description" required={false} /><label className="text-sm font-bold">Colour<input className="field mt-2 h-12" name="color" type="color" defaultValue="#d19a85" /></label><button disabled={busy} className="primary self-end justify-center">Add template</button></form><div className="mt-6 grid gap-3 md:grid-cols-2">{templates.map((template) => <div key={template.id} className={`rounded-2xl border border-black/8 p-4 ${template.isActive ? "" : "opacity-50"}`}><div className="flex items-center gap-3"><span className="size-5 rounded-full" style={{ backgroundColor: template.color ?? "#d19a85" }} /><div className="min-w-0 flex-1"><strong>{template.name}</strong><p className="text-xs text-[#817970]">{template.description ?? "No description"}</p></div><button disabled={busy} onClick={() => void mutate(`/api/v1/admin/service-category-templates/${template.id}`, { isActive: !template.isActive }, template.isActive ? "Template archived." : "Template restored.")} className="rounded-full border px-3 py-1.5 text-xs font-bold">{template.isActive ? "Archive" : "Restore"}</button></div></div>)}</div></section>;
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
    <section className="rounded-3xl bg-white p-6"><div className="flex flex-col justify-between gap-4 md:flex-row"><div><div className="flex items-center gap-3"><h2 className="font-serif text-3xl">{tenant.name}</h2><Status value={tenant.status} /></div><p className="mt-2 text-sm text-[#817970]">{tenant.legalName ?? "Legal name pending"} · {tenant.gstin ?? "GSTIN pending"} · {tenant.panNumber ?? "PAN pending"}</p></div><div className="text-sm"><strong>{tenant.owner?.name ?? "Owner invitation pending"}</strong><p className="text-[#817970]">{tenant.owner?.email ?? tenant.invitations[0]?.email}</p></div></div><div className="mt-6 grid gap-3 sm:grid-cols-4"><Info label="Customers" value={String(tenant.customerCount)} /><Info label="Services" value={String(tenant.serviceCount)} /><Info label="Plan" value={tenant.subscription?.planName ?? "Unassigned"} /><Info label="Owner access" value={tenant.owner?.isActive === false ? "Disabled" : "Enabled"} /></div>
      <div className="mt-6 grid gap-3 md:grid-cols-[1fr_auto]"><select className="field" defaultValue={tenant.subscription?.planId} id={`plan-${tenant.id}`}>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.maxBranches} branches · {plan.maxStaff} staff · {plan.maxServices} services</option>)}</select><button disabled={busy} onClick={() => { const element = document.getElementById(`plan-${tenant.id}`) as HTMLSelectElement; void mutate(`/api/v1/admin/tenants/${tenant.id}/plan`, { planId: element.value }, "Plan assigned."); }} className="primary justify-center">Assign plan</button></div>
      <div className="mt-3 flex flex-wrap gap-2"><button disabled={busy} onClick={() => void mutate(`/api/v1/admin/tenants/${tenant.id}/status`, { status: "ACTIVE", ownerAccess: true }, "Tenant activated.")} className="rounded-full bg-[#dff0e7] px-4 py-2 text-sm font-bold text-[#285543]">Activate access</button><button disabled={busy} onClick={() => void mutate(`/api/v1/admin/tenants/${tenant.id}/status`, { status: "SUSPENDED", ownerAccess: false }, "Tenant suspended.")} className="rounded-full bg-[#f2ded8] px-4 py-2 text-sm font-bold text-[#995849]">Suspend tenant</button><button disabled={busy} onClick={() => void mutate(`/api/v1/admin/tenants/${tenant.id}/status`, { status: "ARCHIVED", ownerAccess: false }, "Tenant archived.")} className="flex items-center gap-2 rounded-full border border-black/10 px-4 py-2 text-sm font-bold"><Archive size={14} /> Archive</button></div>
      {!tenant.owner && <div className="mt-5 rounded-2xl border border-black/8 p-4"><strong className="text-sm">Owner invitation</strong><div className="mt-3 flex gap-2"><input className="field" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="owner@salon.com" /><button onClick={() => void inviteOwner()} className="primary shrink-0">Generate invite</button></div>{invitationUrl && <p className="mt-3 break-all rounded-xl bg-[#f6f3ee] p-3 text-xs font-bold">{invitationUrl}</p>}</div>}
    </section>
    <section className="rounded-3xl bg-white p-6"><h3 className="font-serif text-2xl">Branches</h3><div className="mt-5 space-y-4">{tenant.branches.map((branch) => { const complete = Object.values(branch.checklist).every(Boolean); return <div key={branch.id} className="rounded-2xl border border-black/8 p-5"><div className="flex flex-col justify-between gap-3 md:flex-row"><div><div className="flex items-center gap-2"><strong>{branch.name}</strong><Status value={branch.publicationStatus} /></div><p className="mt-1 text-sm text-[#817970]">{branch.address}, {branch.city}</p><p className="mt-2 text-xs text-[#817970]">{branch.appointments} appointments · {branch.staff} staff · {branch.invoices} invoices</p></div><div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">{Object.entries(branch.checklist).map(([item, done]) => <span key={item} className={done ? "font-bold text-[#285543]" : "text-[#995849]"}>{done ? "✓" : "○"} {label(item)}</span>)}</div></div><textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Decision note" className="field mt-4 min-h-20" /><div className="mt-3 flex flex-wrap gap-2"><button disabled={busy || !complete || branch.publicationStatus !== "PENDING_REVIEW"} onClick={() => void mutate(`/api/v1/admin/branches/${branch.id}/review`, { status: "APPROVED", note: reviewNote }, "Branch approved.")} className="rounded-full bg-[#2f6a55] px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Approve & publish</button><button disabled={busy || branch.publicationStatus !== "PENDING_REVIEW"} onClick={() => void mutate(`/api/v1/admin/branches/${branch.id}/review`, { status: "REJECTED", note: reviewNote }, "Corrections requested.")} className="rounded-full bg-[#f2ded8] px-4 py-2 text-sm font-bold text-[#995849] disabled:opacity-40">Request corrections</button>{branch.publicationStatus === "APPROVED" && <button disabled={busy} onClick={() => void mutate(`/api/v1/admin/branches/${branch.id}/review`, { status: "SUSPENDED", note: reviewNote }, "Branch suspended.")} className="rounded-full border px-4 py-2 text-sm font-bold">Suspend branch</button>}{branch.publicationStatus === "SUSPENDED" && <button disabled={busy} onClick={() => void mutate(`/api/v1/admin/branches/${branch.id}/review`, { status: "APPROVED", note: reviewNote }, "Branch republished.")} className="rounded-full bg-[#2f6a55] px-4 py-2 text-sm font-bold text-white">Republish</button>}</div>{branch.reviews[0] && <p className="mt-3 text-xs text-[#817970]">Latest: {label(branch.reviews[0].toStatus)} by {branch.reviews[0].reviewer}{branch.reviews[0].note ? ` · ${branch.reviews[0].note}` : ""}</p>}</div>; })}</div></section>
    <section className="rounded-3xl bg-white p-6"><h3 className="font-serif text-2xl">Support notes</h3><div className="mt-4 space-y-2">{tenant.notes.map((item) => <div key={item.id} className="rounded-xl bg-[#f6f3ee] p-3 text-sm"><p>{item.note}</p><p className="mt-1 text-xs text-[#817970]">{item.author} · {formatDate(item.createdAt)}</p></div>)}</div><textarea className="field mt-4 min-h-20" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Internal support note" /><button disabled={busy || note.trim().length < 2} onClick={() => void mutate(`/api/v1/admin/tenants/${tenant.id}/notes`, { note }, "Support note added.", "POST")} className="primary mt-3">Add note</button></section>
  </div>;
}

function Documents({ tenant, busy, mutate, openDocument }: { tenant: Tenant; busy: boolean; mutate: (path: string, body: unknown, success: string, method?: string) => Promise<boolean>; openDocument: (id: string) => Promise<void> }) {
  return <section className="rounded-3xl bg-white p-6"><h2 className="font-serif text-3xl">Verification documents</h2><p className="mt-2 text-sm text-[#817970]">Private evidence is served through short-lived signed links.</p><div className="mt-6 space-y-3">{tenant.documents.map((document) => <div key={document.id} className="rounded-2xl border border-black/8 p-4"><div className="flex flex-col justify-between gap-3 md:flex-row md:items-center"><div className="flex items-center gap-3"><FileText className="text-[#9e5d55]" /><div><strong>{label(document.type)}</strong><p className="text-xs text-[#817970]">{document.fileName} · {formatDate(document.createdAt)}</p></div></div><div className="flex items-center gap-2"><Status value={document.status} /><button onClick={() => void openDocument(document.id)} className="rounded-full border px-3 py-2 text-xs font-bold">View</button></div></div>{document.status === "PENDING" && <div className="mt-4 flex gap-2"><button disabled={busy} onClick={() => void mutate(`/api/v1/admin/documents/${document.id}/review`, { status: "APPROVED" }, "Document approved.")} className="rounded-full bg-[#dff0e7] px-4 py-2 text-xs font-bold text-[#285543]">Approve</button><button disabled={busy} onClick={() => void mutate(`/api/v1/admin/documents/${document.id}/review`, { status: "REJECTED", note: "Please upload a clear and current document." }, "Document rejected.")} className="rounded-full bg-[#f2ded8] px-4 py-2 text-xs font-bold text-[#995849]">Reject</button></div>}{document.reviewNote && <p className="mt-3 text-xs text-[#817970]">{document.reviewNote}</p>}</div>)}{!tenant.documents.length && <p className="py-10 text-center text-sm text-[#817970]">No documents uploaded.</p>}</div></section>;
}

function ActivityLog({ logs, tenants }: { logs: AdminConsoleData["auditLogs"]; tenants: Tenant[] }) { return <section className="rounded-3xl bg-white p-6"><h2 className="font-serif text-3xl">System activity</h2><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="text-xs uppercase text-[#817970]"><tr><th className="pb-3">Action</th><th className="pb-3">Tenant</th><th className="pb-3">Entity</th><th className="pb-3">Actor</th><th className="pb-3">Date</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id} className="border-t border-black/6"><td className="py-3 font-bold">{label(log.action)}</td><td>{tenants.find((tenant) => tenant.id === log.tenantId)?.name ?? "Platform"}</td><td>{log.entity}</td><td>{log.actor}</td><td>{formatDate(log.createdAt)}</td></tr>)}</tbody></table></div></section>; }
function Status({ value }: { value: string }) { const good = ["ACTIVE", "APPROVED"].includes(value); const bad = ["REJECTED", "SUSPENDED", "ARCHIVED"].includes(value); return <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold ${good ? "bg-[#dff0e7] text-[#285543]" : bad ? "bg-[#f2ded8] text-[#995849]" : "bg-[#eee6d7] text-[#80632f]"}`}>{label(value)}</span>; }
function Info({ label: text, value }: { label: string; value: string }) { return <div className="rounded-xl bg-[#f6f3ee] p-3"><p className="text-xs text-[#817970]">{text}</p><strong className="mt-1 block text-sm">{value}</strong></div>; }
function Field({ name, label: text, type = "text", required = true }: { name: string; label: string; type?: string; required?: boolean }) { return <label className="text-sm font-bold">{text}<input className="field mt-2" name={name} type={type} required={required} /></label>; }
function label(value: string) { return value.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(value)); }
