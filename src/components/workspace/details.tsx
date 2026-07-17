"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Boxes,
  CalendarDays,
  ChevronRight,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Clock,
  CreditCard,
  Gift,
  GripVertical,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Mail,
  MapPin,
  Monitor,
  Moon,
  PackagePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Phone,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Star,
  SunMedium,
  TrendingUp,
  UserCheck,
  UserRound,
  Users,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import { BrandMark, brandName } from "@/components/brand-mark";
import { newId } from "@/lib/client-id";
import { inr, initials } from "@/lib/format";
import type { AppointmentDetail, CustomerProfile, ServiceProfile, WorkspaceData } from "@/lib/operations-types";

import { CustomerPicker } from "@/components/workspace/customer/customer-picker";
import type { CustomerChoice } from "@/components/workspace/customer/types";
import { SubmitFn } from "@/components/workspace/contracts";
import { getAppointmentDetail, getCustomerProfile, getServiceProfile } from "@/components/workspace/details-api";
import { Avatar, Card, Empty, Field, Info, Row, SlotMessage, Source, Status, WorkspaceDateInput, WorkspaceDateTimeInput, WorkspaceSelect, canCheckoutAppointmentStatus, canOpen, formatDate, formatDateTime, formatTime, nextStatuses, packageBalanceLabel, statusActionStyle, title, toIndiaDateTimeInput } from "@/components/workspace/shared-ui";

/** A status transition as the imperative action reception takes, not the resulting state. */
function statusActionLabel(status: string) {
  return ({
    CONFIRMED: "Confirm",
    CHECKED_IN: "Check in",
    IN_SERVICE: "Start service",
    COMPLETED: "Complete",
    CANCELLED: "Cancel",
    NO_SHOW: "Mark no-show",
    WAITLISTED: "Waitlist",
  } as Record<string, string>)[status] ?? title(status);
}

export function AppointmentDrawer({ appointmentId, data, submit, close, openCustomer, openService, openSale, openInvoice }: {
  appointmentId: string;
  data: WorkspaceData;
  submit: SubmitFn;
  close: () => void;
  openCustomer: (id: string) => void;
  openService: (id: string) => void;
  openSale: (appointment: AppointmentDetail) => void;
  openInvoice: (invoiceId?: string) => void;
}) {
  const [detail, setDetail] = useState<AppointmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  // Cancel and no-show need a reason. It is an auditable field, so it is captured in a proper
  // dialog, not a window.prompt that cannot validate or be styled.
  const [pendingReason, setPendingReason] = useState<"CANCELLED" | "NO_SHOW" | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [reasonBusy, setReasonBusy] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setDetail(await getAppointmentDetail(appointmentId));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load appointment");
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => event.key === "Escape" && close();
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [close]);

  async function updateStatus(value: string, cancellationReason?: string) {
    if (!detail) return;
    // A reason-bearing status opens the dialog first; it comes back here with the reason.
    if (["CANCELLED", "NO_SHOW"].includes(value) && !cancellationReason) {
      setReasonText("");
      setPendingReason(value as "CANCELLED" | "NO_SHOW");
      return;
    }
    const result = await submit(`/api/v1/operations/appointments/${detail.id}`, {
      branchId: detail.branch.id,
      status: value,
      cancellationReason,
      idempotencyKey: `drawer-status-${detail.id}-${newId()}`,
    }, `Appointment moved to ${title(value)}.`, "PATCH", false);
    if (result.ok) await load();
    return result;
  }

  async function confirmReason() {
    if (!pendingReason || reasonText.trim().length < 3) return;
    setReasonBusy(true);
    const result = await updateStatus(pendingReason, reasonText.trim());
    setReasonBusy(false);
    if (result?.ok) setPendingReason(null);
  }

  async function reschedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    const form = new FormData(event.currentTarget);
    const result = await submit(`/api/v1/operations/appointments/${detail.id}`, {
      branchId: detail.branch.id,
      startsAt: new Date(String(form.get("startsAt"))).toISOString(),
      staffId: form.get("staffId") || null,
      notes: form.get("notes") || undefined,
      idempotencyKey: `drawer-edit-${detail.id}-${newId()}`,
    }, "Appointment updated.", "PATCH", false);
    if (result.ok) {
      setEditing(false);
      await load();
    }
  }

  const durationMinutes = detail ? Math.round((new Date(detail.endsAt).getTime() - new Date(detail.startsAt).getTime()) / 60_000) : 0;
  const alert = detail?.customer.allergies || detail?.customer.notes;
  // What the booking is worth, so reception sees it without opening billing.
  const appointmentValue = detail?.serviceLines.reduce((sum, line) => sum + line.price, 0) ?? 0;
  // Reaching the customer - "running late?" - is a constant reception task, so make the number
  // actionable rather than decorative. Strip everything but digits and a leading +.
  const dialNumber = detail ? detail.customer.phone.replace(/[^\d+]/g, "") : "";
  const whatsappNumber = dialNumber.replace(/^\+/, "");

  return <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Appointment details" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <aside className="flex h-full w-full flex-col bg-[#F6F7FB] pb-[env(safe-area-inset-bottom)] shadow-2xl sm:max-w-xl">
      {/* Header carries the one-glance summary: who, when, status. No serif, no navy slab. */}
      <div className="shrink-0 border-b border-[#E8EAF0] bg-white px-5 py-4 pt-[calc(1rem+env(safe-area-inset-top))] sm:pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {detail && <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#EFE8F6] text-sm font-extrabold text-[#5B2A86]">{initials(detail.customer.name)}</span>}
            <div className="min-w-0">
              <h2 className="truncate text-lg font-extrabold text-[#1F2937]">{detail?.customer.name || "Appointment"}</h2>
              {detail && <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-[#6B7280]">
                <Clock size={12} />{formatDate(new Date(detail.startsAt))} · {formatTime(detail.startsAt)} · {durationMinutes} min
              </p>}
            </div>
          </div>
          <button type="button" onClick={close} className="grid size-9 shrink-0 place-items-center rounded-full bg-[#F6F7FB] text-[#6B7280] transition hover:bg-[#EFE8F6]" aria-label="Close"><X size={17} /></button>
        </div>
        {detail && <div className="mt-3 flex flex-wrap items-center gap-2">
          <Status value={detail.status} />
          <Source value={detail.source} />
          <span className="text-xs font-semibold text-[#9CA3AF]">{detail.branch.name}{detail.resource ? ` · ${detail.resource.name}` : ""}</span>
        </div>}
      </div>

      {/* The actions, with a real hierarchy instead of four competing pills.
       *
       *   - One primary button (take payment, or the next step in the visit) fills the width.
       *   - Everything else - the other status changes, reschedule, cancel, no-show - lives behind
       *     a single quiet "More" button, so the common act is obvious and the rare/destructive
       *     ones are one tap away without shouting. */}
      {detail && detail.permissions.canWrite && !loading && !error && (() => {
        const forward = nextStatuses(detail.status).filter((value) => !["CANCELLED", "NO_SHOW"].includes(value));
        const risky = nextStatuses(detail.status).filter((value) => ["CANCELLED", "NO_SHOW"].includes(value));
        const canSell = detail.permissions.canSell && !detail.invoice && canCheckoutAppointmentStatus(detail.status);
        // The single loudest button: take the money if it is due, else move the visit forward.
        const primary = canSell
          ? { label: "Take payment", icon: <ReceiptText size={15} />, run: () => openSale(detail) }
          : forward[0]
            ? { label: statusActionLabel(forward[0]), icon: null, run: () => void updateStatus(forward[0]) }
            : null;
        const secondaryForward = canSell ? forward : forward.slice(1);

        return <div className="relative shrink-0 border-b border-[#E8EAF0] bg-white px-5 pb-4">
          <div className="flex items-center gap-2">
            {primary && <button
              type="button"
              onClick={primary.run}
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#12916C] px-4 text-sm font-extrabold text-white transition hover:bg-[#0B6B4F]"
            >{primary.icon}{primary.label}</button>}

            {detail.invoice && <button
              type="button"
              onClick={() => openInvoice(detail.invoice?.id)}
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-[#A9DFCB] bg-[#E9F7F1] px-4 text-sm font-extrabold text-[#0B6B4F]"
            ><ReceiptText size={15} /> {detail.invoice.number}</button>}

            <button
              type="button"
              onClick={() => setMoreOpen((value) => !value)}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-extrabold text-[#5B2A86] transition hover:bg-[#EFE8F6]"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
            >More <ChevronRight size={14} className={`transition ${moreOpen ? "rotate-90" : ""}`} /></button>
          </div>

          {moreOpen && <>
            <button type="button" className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setMoreOpen(false)} />
            <div className="absolute right-5 top-full z-20 mt-1 w-56 overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white p-1.5 shadow-[0_18px_50px_rgba(31,41,55,.15)]" role="menu">
              {secondaryForward.map((value) => <button
                key={value}
                type="button"
                onClick={() => { setMoreOpen(false); void updateStatus(value); }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-[#1F2937] transition hover:bg-[#F6F7FB]"
              ><CheckCircle2 size={15} className="text-[#12916C]" />{statusActionLabel(value)}</button>)}

              <button
                type="button"
                onClick={() => { setMoreOpen(false); setEditing(true); }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-[#1F2937] transition hover:bg-[#F6F7FB]"
              ><Clock size={15} className="text-[#5B2A86]" />Reschedule or reassign</button>

              {risky.length > 0 && <div className="my-1 border-t border-[#F0F0F3]" />}
              {risky.map((value) => <button
                key={value}
                type="button"
                onClick={() => { setMoreOpen(false); void updateStatus(value); }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-[#94302E] transition hover:bg-[#FDECEC]"
              ><X size={15} />{statusActionLabel(value)}</button>)}
            </div>
          </>}
        </div>;
      })()}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        {loading ? <SlotMessage text="Loading appointment..." loading /> : error ? <SlotMessage text={error} error /> : detail && <>
          {editing && <Card title="Reschedule or reassign"><AppointmentEditForm detail={detail} data={data} submit={submit} onSaved={async () => { setEditing(false); await load(); }} /></Card>}

          {/* An allergy is the first thing to see, not a note buried in the customer card. */}
          {alert && <div className="flex items-start gap-2 rounded-2xl border border-[#F5C6C4] bg-[#FDECEC] p-4 text-sm font-bold text-[#94302E]">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            {detail.customer.allergies ? `Allergy: ${detail.customer.allergies}` : detail.customer.notes}
          </div>}

          <Card title="Customer" action={<button type="button" onClick={() => openCustomer(detail.customer.id)} className="text-sm font-bold text-[#5B2A86]">View profile <ChevronRight size={14} className="inline" /></button>}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-[#6B7280]"><Phone size={13} className="mr-1 inline" />{detail.customer.phone}{detail.customer.email ? <><Mail size={13} className="ml-3 mr-1 inline" />{detail.customer.email}</> : null}</p>
              <div className="flex gap-2">
                <a href={`tel:${dialNumber}`} className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-extrabold text-[#5B2A86] transition hover:bg-[#EFE8F6]"><Phone size={13} /> Call</a>
                <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-[#A9DFCB] bg-[#E9F7F1] px-3 py-1.5 text-xs font-extrabold text-[#0B6B4F] transition hover:bg-[#D6F0E5]"><MessageCircle size={13} /> WhatsApp</a>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3"><Info label="Completed visits" value={String(detail.customer.visitCount)} tone="green" /><Info label="Loyalty balance" value={`${detail.customer.loyaltyBalance} points`} tone="violet" /></div>
          </Card>

          <Card title="Services">
            <div className="space-y-2">{detail.serviceLines.map((line) => <div key={line.id} className="flex items-start justify-between gap-3 rounded-2xl border border-[#E8EAF0] p-3">
              <div className="min-w-0">
                <button type="button" onClick={() => openService(line.serviceId)} className="text-left text-sm font-bold text-[#1F2937] hover:text-[#5B2A86]">{line.serviceName}</button>
                <p className="mt-0.5 text-xs text-[#9CA3AF]">{formatTime(line.startsAt)} - {formatTime(line.endsAt)} · {line.durationMinutes} min · {line.staffName}</p>
              </div>
              <div className="shrink-0 text-right"><strong className="tabular-nums">{inr.format(line.price)}</strong><p className="text-xs text-[#9CA3AF]">{line.taxRate}% GST</p></div>
            </div>)}</div>
            {/* What the booking is worth. If it is already billed the invoice total is the truth;
                otherwise this is the expected amount. */}
            <div className="mt-3 flex items-center justify-between border-t border-[#E8EAF0] pt-3">
              <span className="text-sm font-bold text-[#6B7280]">{detail.invoice ? "Billed" : "Expected"}</span>
              <strong className="text-lg tabular-nums text-[#5B2A86]">{inr.format(detail.invoice ? detail.invoice.total : appointmentValue)}</strong>
            </div>
          </Card>

          {detail.invoice && <Card title="Billing">
            <div className="flex items-center justify-between gap-4">
              <div><p className="font-bold">{detail.invoice.number}</p><p className="text-xs text-[#9CA3AF]">{title(detail.invoice.status)} · {detail.invoice.payments.map((payment) => title(payment.method)).join(", ") || "No payment"}</p></div>
              <strong className="text-xl tabular-nums text-[#5B2A86]">{inr.format(detail.invoice.total)}</strong>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3"><Info label="Paid" value={inr.format(detail.invoice.paid)} tone="green" /><Info label="Outstanding" value={inr.format(detail.invoice.outstanding)} tone={detail.invoice.outstanding > 0 ? "amber" : "green"} /></div>
          </Card>}

          {(detail.notes || detail.cancellationReason) && <Card title="Notes">
            {detail.notes && <p className="text-sm">{detail.notes}</p>}
            {detail.cancellationReason && <p className="mt-3 rounded-xl bg-[#FDECEC] p-3 text-sm font-bold text-[#94302E]">Reason: {detail.cancellationReason}</p>}
          </Card>}

          <Card title="History">
            <div className="space-y-3">{detail.history.length ? detail.history.map((entry) => <div key={entry.id} className="flex gap-3 border-l-2 border-[#5B2A86] pl-4"><div><p className="text-sm font-bold">{title(entry.status)}</p><p className="text-xs text-[#9CA3AF]">{formatDateTime(entry.createdAt)}{entry.note ? ` · ${entry.note}` : ""}</p></div></div>) : <Empty text="No status changes yet." />}</div>
          </Card>
        </>}
      </div>
    </aside>

    {/* Cancel / no-show reason - an auditable field, captured properly. */}
    {pendingReason && <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4" onMouseDown={(event) => event.target === event.currentTarget && setPendingReason(null)}>
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-extrabold text-[#1F2937]">{pendingReason === "CANCELLED" ? "Cancel this appointment?" : "Mark as no-show?"}</h3>
        <p className="mt-1 text-sm font-semibold text-[#6B7280]">The reason is recorded against the appointment and shows in reports.</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {(pendingReason === "CANCELLED"
            ? ["Customer requested", "Customer rescheduled", "Salon unable to service", "Duplicate booking"]
            : ["Did not arrive", "Unreachable on call", "Arrived too late"]
          ).map((preset) => <button key={preset} type="button" onClick={() => setReasonText(preset)} className={`rounded-full border px-3 py-1.5 text-xs font-extrabold transition ${reasonText === preset ? "border-[#5B2A86] bg-[#5B2A86] text-white" : "border-[#E5E7EB] bg-white text-[#6B7280]"}`}>{preset}</button>)}
        </div>
        <textarea className="field mt-3 min-h-20" value={reasonText} onChange={(event) => setReasonText(event.target.value)} maxLength={300} placeholder="Pick a reason or describe what happened" autoFocus />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setPendingReason(null)} className="rounded-xl border border-[#E5E7EB] bg-white py-3 text-sm font-extrabold text-[#6B7280]">Keep it</button>
          <button type="button" disabled={reasonText.trim().length < 3 || reasonBusy} onClick={() => void confirmReason()} className="rounded-xl bg-[#984f43] py-3 text-sm font-extrabold text-white disabled:opacity-45">{pendingReason === "CANCELLED" ? "Cancel appointment" : "Mark no-show"}</button>
        </div>
      </div>
    </div>}
  </div>;
}

export function AppointmentEditForm({ detail, data, submit, onSaved }: { detail: AppointmentDetail; data: WorkspaceData; submit: SubmitFn; onSaved: () => Promise<void> }) {
  const branchServices = data.services.filter((service) => service.isActive);
  const branchStaff = data.staff.filter((member) => member.branchIds.includes(detail.branch.id));
  const branchResources = data.resources.filter((resource) => resource.branchId === detail.branch.id);
  const [customer, setCustomer] = useState<CustomerChoice | null>(data.customers.find((item) => item.id === detail.customer.id) || { id: detail.customer.id, name: detail.customer.name, phone: detail.customer.phone, email: detail.customer.email });
  const [startsAt, setStartsAt] = useState(toIndiaDateTimeInput(detail.startsAt));
  const [source, setSource] = useState(detail.source);
  const [resourceId, setResourceId] = useState(detail.resource?.id || "");
  const [notes, setNotes] = useState(detail.notes || "");
  const [lines, setLines] = useState(detail.serviceLines.map((line) => ({
    serviceId: line.serviceId,
    staffId: line.staffId || "",
    durationMinutes: line.durationMinutes,
    price: line.price,
    taxRate: line.taxRate,
  })));

  function updateLine(index: number, patch: Partial<(typeof lines)[number]>) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  }

  function addLine() {
    const service = branchServices[0];
    if (!service) return;
    setLines((current) => [...current, { serviceId: service.id, staffId: "", durationMinutes: service.durationMinutes, price: service.price, taxRate: service.taxRate }]);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customer || !lines.length) return;
    const result = await submit(`/api/v1/operations/appointments/${detail.id}`, {
      branchId: detail.branch.id,
      customerId: customer.id,
      startsAt: new Date(startsAt).toISOString(),
      source,
      resourceId: resourceId || null,
      notes: notes || undefined,
      serviceLines: lines.map((line) => ({
        serviceId: line.serviceId,
        staffId: line.staffId || null,
        durationMinutes: Number(line.durationMinutes),
        price: Number(line.price),
        taxRate: Number(line.taxRate),
      })),
      idempotencyKey: `appointment-edit-${detail.id}-${newId()}`,
    }, "Appointment updated.", "PATCH", false);
    if (result.ok) await onSaved();
  }

  return <form onSubmit={save} className="mt-5 grid gap-4">
    <div className="grid gap-3 lg:grid-cols-2">
      <WorkspaceDateTimeInput label="Start date and time" value={startsAt} onChange={setStartsAt} />
      <WorkspaceSelect label="Booking source" value={source} onChange={setSource} options={["MARKETPLACE", "SALON_WEBSITE", "PHONE", "WALK_IN", "STAFF_CREATED"].map((value) => ({ value, label: title(value) }))} />
      <label className="text-sm font-bold text-[#1F2937] lg:col-span-2">Customer<CustomerPicker branchId={detail.branch.id} value={customer?.id || ""} initialCustomers={data.customers} onChange={setCustomer} submit={submit} /></label>
      <div className="lg:col-span-2"><WorkspaceSelect label="Room or resource" value={resourceId} onChange={setResourceId} options={[{ value: "", label: "No room/resource required" }, ...branchResources.map((resource) => ({ value: resource.id, label: resource.name, description: title(resource.type) }))]} /></div>
    </div>

    <div className="rounded-2xl border border-black/10 bg-[#F7FAFC] p-4">
      <div className="flex items-center justify-between gap-3"><h4 className="font-bold">Service lines</h4><button type="button" onClick={addLine} className="rounded-full bg-[#173279] px-3 py-1.5 text-xs font-extrabold text-white">Add service</button></div>
      <div className="mt-3 space-y-3">{lines.map((line, index) => {
        const selectedService = branchServices.find((service) => service.id === line.serviceId);
        return <div key={`${line.serviceId}-${index}`} className="rounded-2xl bg-white p-3">
          <div className="grid gap-2 lg:grid-cols-[1fr_1fr_110px_110px_90px_auto] lg:items-end">
            <WorkspaceSelect label="Service" value={line.serviceId} onChange={(value) => {
              const service = branchServices.find((item) => item.id === value);
              updateLine(index, { serviceId: value, durationMinutes: service?.durationMinutes ?? line.durationMinutes, price: service?.price ?? line.price, taxRate: service?.taxRate ?? line.taxRate });
            }} options={branchServices.map((service) => ({ value: service.id, label: service.name, description: service.category }))} compact />
            <WorkspaceSelect label="Professional" value={line.staffId} onChange={(value) => updateLine(index, { staffId: value })} options={[{ value: "", label: "Any qualified professional" }, ...branchStaff.map((member) => ({ value: member.id, label: member.name, description: member.role }))]} compact />
            <label className="text-xs font-bold text-[#737174]">Minutes<input className="field mt-1" type="number" min="5" value={line.durationMinutes} onChange={(event) => updateLine(index, { durationMinutes: Number(event.target.value) })} /></label>
            <label className="text-xs font-bold text-[#737174]">Price<input className="field mt-1" type="number" min="0" step="0.01" value={line.price} onChange={(event) => updateLine(index, { price: Number(event.target.value) })} /></label>
            <label className="text-xs font-bold text-[#737174]">GST %<input className="field mt-1" type="number" min="0" max="100" step="0.01" value={line.taxRate} onChange={(event) => updateLine(index, { taxRate: Number(event.target.value) })} /></label>
            <div className="flex gap-1">
              <button type="button" disabled={index === 0} onClick={() => setLines((current) => current.map((item, itemIndex) => itemIndex === index - 1 ? current[index] : itemIndex === index ? current[index - 1] : item))} className="rounded-lg border px-2 py-2 text-xs font-bold disabled:opacity-35">Up</button>
              <button type="button" disabled={lines.length <= 1} onClick={() => setLines((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg border border-[#e9c2b9] bg-[#fff0ec] px-2 py-2 text-xs font-bold text-[#984f43] disabled:opacity-35">Remove</button>
            </div>
          </div>
          <p className="mt-2 text-xs text-[#737174]">{selectedService ? `${selectedService.category} - default ${selectedService.durationMinutes} min - ${inr.format(selectedService.price)}` : "Select a service"}</p>
        </div>;
      })}</div>
    </div>

    <label className="text-sm font-bold text-[#1F2937]">Internal notes<textarea className="field mt-2 min-h-24" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} /></label>
    <button className="primary justify-center">Validate conflicts and save appointment</button>
  </form>;
}

export function CustomerProfileView({ customerId, data, submit, close, openAppointment, bookAppointment, openSale, openInvoice }: { customerId: string; data: WorkspaceData; submit: SubmitFn; close: () => void; openAppointment: (id: string) => void; bookAppointment: (customerId: string) => void; openSale: (customerId: string, branchId?: string) => void; openInvoice: (invoiceId?: string) => void }) {
  const tabs = ["overview", "appointments", "invoices", "loyalty", "benefits", "balances", "notes"] as const;
  const [tab, setTab] = useState<(typeof tabs)[number]>("overview");
  const [branchId, setBranchId] = useState(data.identity.branchId || "all");
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const canStartSale = canOpen(data.identity.role, "Point of sale");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ branchId, page: String(page), pageSize: "20" });
    if (status) params.set("status", status);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    try {
      setProfile(await getCustomerProfile(customerId, params));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load customer");
    } finally {
      setLoading(false);
    }
  }, [branchId, customerId, dateFrom, dateTo, page, status]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    const form = new FormData(event.currentTarget);
    const mutationBranchId = branchId === "all" ? data.identity.branches[0]?.id : branchId;
    if (!mutationBranchId) return;
    const result = await submit(`/api/v1/operations/customers/${customerId}`, {
      branchId: mutationBranchId,
      name: form.get("name"),
      email: form.get("email") || null,
      birthday: form.get("birthday") ? new Date(String(form.get("birthday"))).toISOString() : null,
      allergies: form.get("allergies") || null,
      tags: String(form.get("tags") || "").split(",").map((item) => item.trim()).filter(Boolean),
      notes: form.get("notes") || null,
      whatsappConsent: form.get("whatsappConsent") === "on",
      smsConsent: form.get("smsConsent") === "on",
      emailConsent: form.get("emailConsent") === "on",
    }, "Customer profile updated.", "PATCH", false);
    if (result.ok) await load();
  }

  const dial = profile ? profile.customer.phone.replace(/[^\d+]/g, "") : "";

  return <div className="space-y-4">
    {/* Header: who they are, how to reach them, and the two acts you take on a customer. No navy
        slab, no serif - matched to the appointment drawer. */}
    <div className="rounded-[var(--radius-lg,16px)] border border-[#E8EAF0] bg-white p-5 shadow-sm">
      <button type="button" onClick={close} className="mb-3 inline-flex items-center gap-1 text-xs font-bold text-[#5B2A86] transition hover:opacity-80"><ChevronRight size={13} className="rotate-180" /> Back</button>
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[#EFE8F6] text-lg font-extrabold text-[#5B2A86]">{profile ? initials(profile.customer.name) : "…"}</span>
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-extrabold tracking-tight text-[#1F2937]">{profile?.customer.name || "Loading…"}</h2>
            <p className="mt-0.5 text-sm font-semibold text-[#6B7280]">{profile?.customer.phone}{profile?.customer.email ? ` · ${profile.customer.email}` : ""}</p>
            {profile?.customer.tags.length ? <div className="mt-2 flex flex-wrap gap-1.5">{profile.customer.tags.map((tag) => <span key={tag} className="rounded-full bg-[#EFE8F6] px-2 py-0.5 text-[11px] font-bold text-[#5B2A86]">{tag}</span>)}</div> : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {profile && <>
            <a href={`tel:${dial}`} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm font-extrabold text-[#5B2A86] transition hover:bg-[#EFE8F6]"><Phone size={15} /> Call</a>
            <a href={`https://wa.me/${dial.replace(/^\+/, "")}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#A9DFCB] bg-[#E9F7F1] px-3 text-sm font-extrabold text-[#0B6B4F] transition hover:bg-[#D6F0E5]"><MessageCircle size={15} /> WhatsApp</a>
          </>}
          {canStartSale && <button type="button" disabled={!profile} onClick={() => profile && openSale(profile.customer.id, branchId === "all" ? undefined : branchId)} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-extrabold text-[#5B2A86] transition hover:bg-[#EFE8F6] disabled:opacity-45"><ReceiptText size={15} /> New bill</button>}
          <button type="button" disabled={!profile} onClick={() => profile && bookAppointment(profile.customer.id)} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#5B2A86] px-4 text-sm font-extrabold text-white transition hover:bg-[#4A2270] disabled:opacity-45"><CalendarDays size={15} /> Book</button>
        </div>
      </div>
      {data.identity.role === "OWNER" && <div className="mt-4 max-w-xs"><WorkspaceSelect value={branchId} onChange={(value) => { setBranchId(value); setPage(1); }} options={[{ value: "all", label: "All branches" }, ...data.identity.branches.map((branch) => ({ value: branch.id, label: branch.name, description: branch.city }))]} /></div>}
    </div>

    {loading ? <SlotMessage text="Loading customer history..." loading /> : error ? <SlotMessage text={error} error /> : profile && <>
      {/* The allergy first, in red - the one thing that must not be missed before serving them. */}
      {profile.customer.allergies && <div className="flex items-start gap-2 rounded-2xl border border-[#F5C6C4] bg-[#FDECEC] p-4 text-sm font-bold text-[#94302E]"><AlertTriangle size={16} className="mt-0.5 shrink-0" />Allergy: {profile.customer.allergies}</div>}
      {profile.customer.isArchived && <div className="rounded-2xl border border-[#E3E6EC] bg-[#F6F7FA] p-4 text-sm font-bold text-[#6B7280]">This customer is archived. Some actions are restricted.</div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Info label="Appointments" value={String(profile.summary.appointments)} tone="blue" />
        <Info label="Completed visits" value={String(profile.summary.completedVisits)} tone="green" />
        <Info label="Lifetime spend" value={inr.format(profile.summary.lifetimeSpend)} tone="green" />
        <Info label="Outstanding" value={inr.format(profile.summary.outstanding)} tone={profile.summary.outstanding > 0 ? "amber" : "green"} />
        <Info label="Loyalty" value={`${profile.summary.loyaltyBalance} pts`} tone="violet" />
        <Info label="Wallet" value={inr.format(profile.summary.walletBalance)} tone="amber" />
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-[#E8EAF0] bg-white p-1.5">{tabs.map((value) => <button type="button" key={value} onClick={() => setTab(value)} className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-bold transition ${tab === value ? "bg-[#EFE8F6] text-[#5B2A86]" : "text-[#6B7280] hover:bg-[#F6F7FB]"}`}>{title(value)}</button>)}</div>
      {tab === "overview" && <div className="grid gap-5 lg:grid-cols-2"><Card title="Contact and profile"><div className="grid gap-3 sm:grid-cols-2"><Info label="Phone" value={profile.customer.phone} /><Info label="Email" value={profile.customer.email || "Not provided"} /><Info label="Birthday" value={profile.customer.birthday ? formatDate(new Date(profile.customer.birthday)) : "Not provided"} /><Info label="Customer since" value={formatDate(new Date(profile.customer.createdAt))} /></div><div className="mt-4 flex flex-wrap gap-2">{profile.customer.tags.map((tag) => <span key={tag} className="rounded-full bg-[#E8FBFB] px-3 py-1 text-xs font-bold text-[#1969A2]">{tag}</span>)}</div></Card><Card title="Alerts and preferences"><p className="text-sm"><strong>Allergies:</strong> {profile.customer.allergies || "None recorded"}</p><p className="mt-3 text-sm"><strong>Notes:</strong> {profile.customer.notes || "None recorded"}</p><p className="mt-3 text-sm"><strong>Preferences:</strong> {profile.customer.preferences ? JSON.stringify(profile.customer.preferences) : "None recorded"}</p></Card></div>}
      {(tab === "appointments" || tab === "invoices") && <div className="grid gap-2 rounded-2xl bg-white p-4 md:grid-cols-4"><WorkspaceDateInput value={dateFrom} onChange={(value) => { setDateFrom(value); setPage(1); }} /><WorkspaceDateInput value={dateTo} onChange={(value) => { setDateTo(value); setPage(1); }} />{tab === "appointments" && <WorkspaceSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={[{ value: "", label: "All statuses" }, ...["CONFIRMED", "CHECKED_IN", "IN_SERVICE", "COMPLETED", "CANCELLED", "NO_SHOW"].map((value) => ({ value, label: title(value) }))]} />}<button type="button" onClick={() => { setDateFrom(""); setDateTo(""); setStatus(""); setPage(1); }} className="rounded-xl border border-black/10 px-4 text-sm font-bold">Clear filters</button></div>}
      {tab === "appointments" && <Card title="Appointments and visits">{profile.appointments.length ? profile.appointments.map((appointment) => <button type="button" key={appointment.id} onClick={() => openAppointment(appointment.id)} className="flex w-full items-center justify-between gap-4 border-t border-black/5 py-4 text-left first:border-0"><div><p className="font-bold">{appointment.services.join(", ")}</p><p className="mt-1 text-xs text-[#737174]">{formatDateTime(appointment.startsAt)}  -  {appointment.branchName}  -  {appointment.staff.join(", ")}</p></div><div className="flex items-center gap-2"><Status value={appointment.status} /><ChevronRight size={15} /></div></button>) : <Empty text="No appointments match these filters." />}<Pager page={page} total={profile.pagination.appointmentsTotal} pageSize={profile.pagination.pageSize} setPage={setPage} /></Card>}
      {tab === "invoices" && <Card title="Invoices and payments">{profile.invoices.length ? profile.invoices.map((invoice) => <button type="button" key={invoice.id} onClick={() => openInvoice(invoice.id)} className="w-full border-t border-black/5 py-4 text-left transition first:border-0 hover:bg-[#F7FAFC]"><div className="flex flex-col justify-between gap-3 md:flex-row md:items-start"><div><div className="flex flex-wrap items-center gap-2"><p className="font-extrabold">{invoice.number}</p><Status value={invoice.status} /><span className="rounded-full bg-[#F7FAFC] px-2.5 py-1 text-[11px] font-extrabold text-[#7b5514]">{invoice.taxMode === "GST" ? "GST" : "Non-GST"}</span></div><p className="mt-1 text-xs text-[#737174]">{formatDateTime(invoice.createdAt)} - {invoice.branchName} - {title(invoice.type)}</p><p className="mt-2 text-xs text-[#737174]">{invoice.lines.map((line) => `${line.description} x ${line.quantity}`).join(" - ")}</p></div><div className="text-left md:text-right"><strong className="text-lg">{inr.format(invoice.total)}</strong><p className="text-xs font-bold text-[#1789AA]">Paid {inr.format(invoice.paid)}</p><p className={`text-xs font-bold ${invoice.outstanding ? "text-[#984f43]" : "text-[#737174]"}`}>{invoice.outstanding ? `${inr.format(invoice.outstanding)} outstanding` : "Fully paid"}</p><span className="mt-2 inline-flex items-center gap-1 rounded-full border border-black/10 px-3 py-1 text-xs font-extrabold">Open invoice <ChevronRight size={13} /></span></div></div></button>) : <Empty text="No invoices match these filters." />}<Pager page={page} total={profile.pagination.invoicesTotal} pageSize={profile.pagination.pageSize} setPage={setPage} /></Card>}
      {tab === "loyalty" && <Card title="Loyalty ledger">{profile.loyalty.length ? profile.loyalty.map((entry) => <Row key={entry.id} primary={entry.reason} secondary={`${formatDateTime(entry.createdAt)}${entry.expiresAt ? `  -  Expires ${formatDate(new Date(entry.expiresAt))}` : ""}`} value={`${entry.points > 0 ? "+" : ""}${entry.points} pts`} />) : <Empty text="No loyalty activity." />}</Card>}
      {tab === "benefits" && <div className="grid gap-5 lg:grid-cols-3"><Card title="Memberships">{profile.memberships.length ? profile.memberships.map((item) => <Row key={item.id} primary={item.name} secondary={`${formatDate(new Date(item.startsAt))} - ${formatDate(new Date(item.endsAt))}`} value={title(item.status)} />) : <Empty text="No memberships." />}</Card><Card title="Packages">{profile.packages.length ? profile.packages.map((item) => <Row key={item.id} primary={item.name} secondary={`Expires ${formatDate(new Date(item.expiresAt))}`} value={packageBalanceLabel(item.balance)} />) : <Empty text="No packages." />}</Card><Card title="Gift cards">{profile.giftCards.length ? profile.giftCards.map((item) => <Row key={item.id} primary={item.code} secondary={`${item.branchName || "All branches"} - ${title(item.status)}${item.expiresAt ? ` - Expires ${formatDate(new Date(item.expiresAt))}` : ""}`} value={inr.format(item.balance)} />) : <Empty text="No gift cards." />}</Card></div>}
      {tab === "balances" && <div className="grid gap-5 lg:grid-cols-[1fr_340px]"><Card title="Customer balance history">{profile.benefitTransactions.length ? profile.benefitTransactions.map((entry) => <div key={entry.id} className="flex items-center justify-between gap-4 border-t border-black/5 py-4 first:border-0"><div><p className="font-bold">{title(entry.kind)}</p><p className="mt-1 text-xs text-[#737174]">{formatDateTime(entry.createdAt)} - {entry.note || title(entry.sourceType)}</p></div><div className="text-right text-sm font-bold">{entry.points !== null ? `${entry.points > 0 ? "+" : ""}${entry.points} pts` : entry.amount !== null ? inr.format(entry.amount) : "-"}</div></div>) : <Empty text="No wallet, reward, package, gift card, membership, refund, or adjustment activity yet." />}</Card><Card title="Current balances"><div className="grid gap-3"><Info label="Wallet balance" value={inr.format(profile.summary.walletBalance)} tone="green" /><Info label="Loyalty points" value={`${profile.summary.loyaltyBalance} pts`} tone="violet" /><Info label="Reward value" value={inr.format(profile.summary.rewardValue)} tone="amber" /><Info label="Active gift cards" value={String(profile.giftCards.filter((card) => card.status === "ACTIVE" && card.balance > 0).length)} tone="blue" /></div></Card></div>}
      {tab === "notes" && <div className="grid gap-5 lg:grid-cols-[1fr_360px]"><Card title="Operational profile">{profile.permissions.canWrite ? <form onSubmit={save} className="grid gap-3 sm:grid-cols-2"><Field name="name" label="Name" defaultValue={profile.customer.name} /><Field name="email" label="Email" type="email" defaultValue={profile.customer.email || ""} required={false} /><Field name="birthday" label="Birthday" type="date" defaultValue={profile.customer.birthday?.slice(0, 10) || ""} required={false} /><Field name="allergies" label="Allergies and sensitivities" defaultValue={profile.customer.allergies || ""} required={false} /><Field name="tags" label="Tags" defaultValue={profile.customer.tags.join(", ")} required={false} /><Field name="notes" label="Notes and preferences" defaultValue={profile.customer.notes || ""} required={false} /><div className="grid gap-2 text-sm"><label><input type="checkbox" name="whatsappConsent" defaultChecked={profile.customer.whatsappConsent} /> WhatsApp consent</label><label><input type="checkbox" name="smsConsent" defaultChecked={profile.customer.smsConsent} /> SMS consent</label><label><input type="checkbox" name="emailConsent" defaultChecked={profile.customer.emailConsent} /> Email consent</label></div><button className="primary justify-center sm:col-span-2">Save customer profile</button></form> : <p className="text-sm text-[#737174]">This profile is read-only for your role.</p>}</Card><Card title="Communications"><p className="text-sm text-[#737174]">Communication history is unavailable until SMS, WhatsApp, and email delivery records are linked directly to customer profiles.</p></Card></div>}
    </>}
  </div>;
}

export function ServiceProfileView({ serviceId, data, close, openAppointment }: { serviceId: string; data: WorkspaceData; close: () => void; openAppointment: (id: string) => void }) {
  const [profile, setProfile] = useState<ServiceProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const branchId = data.identity.branchId || "all";
    queueMicrotask(() => setLoading(true));
    getServiceProfile(serviceId, branchId, controller.signal)
      .then((result) => {
        setProfile(result);
        setError("");
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Unable to load service");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [data.identity.branchId, serviceId]);
  return <div className="space-y-5">
    <div className="rounded-3xl bg-[#173279] p-6 text-white"><button type="button" onClick={close} className="text-xs font-bold text-[#16B994]">Back to workspace</button><div className="mt-3 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-white/50">{profile?.service.category || "Service"}</p><h2 className="mt-2 font-serif text-3xl">{profile?.service.name || "Service profile"}</h2><p className="mt-2 max-w-2xl text-sm text-white/60">{profile?.service.description || "No service description has been added."}</p></div>{profile && <div className="flex gap-2"><Status value={profile.service.isActive ? "ACTIVE" : "ARCHIVED"} /><Status value={profile.service.onlineBooking ? "ONLINE" : "IN_SALON_ONLY"} /></div>}</div></div>
    {loading ? <SlotMessage text="Loading service operations..." loading /> : error ? <SlotMessage text={error} error /> : profile && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><Info label="Master price" value={inr.format(profile.service.price)} tone="green" /><Info label="Duration" value={`${profile.service.durationMinutes} min`} tone="blue" /><Info label="GST" value={`${profile.service.taxRate}%`} tone="rose" /><Info label="Bookings" value={String(profile.metrics.bookings)} tone="blue" /><Info label="Completion" value={`${profile.metrics.completed}/${profile.metrics.bookings}`} tone="green" /><Info label="Recorded revenue" value={inr.format(profile.metrics.revenue)} tone="green" /></div>
      <div className="grid gap-5 xl:grid-cols-2"><Card title="Branch pricing and availability">{profile.branchOverrides.length ? profile.branchOverrides.map((override) => <div key={override.branchId} className="grid grid-cols-2 gap-3 border-t border-black/5 py-4 first:border-0 sm:grid-cols-5"><div className="col-span-2 font-bold sm:col-span-1">{override.branchName}</div><span>{inr.format(override.price)}</span><span>{override.durationMinutes} min</span><span>{override.taxRate}% GST</span><Status value={override.isActive ? "ACTIVE" : "INACTIVE"} /></div>) : <Empty text="No branch overrides are configured." />}</Card><Card title="Qualified professionals">{profile.qualifiedStaff.length ? profile.qualifiedStaff.map((member) => <Row key={member.id} primary={member.name} secondary={member.branchNames.join(", ")} value={member.role} />) : <Empty text="No qualified professionals are assigned." />}</Card></div>
      <Card title="Booking performance"><div className="grid gap-3 sm:grid-cols-4"><Info label="Completed" value={String(profile.metrics.completed)} tone="green" /><Info label="Cancelled" value={String(profile.metrics.cancelled)} tone="rose" /><Info label="No-shows" value={String(profile.metrics.noShows)} tone="amber" /><Info label="Average selling price" value={inr.format(profile.metrics.averageSellingPrice)} tone="blue" /></div></Card>
      <Card title="Recent service history">{profile.appointments.length ? profile.appointments.map((appointment) => <button type="button" key={`${appointment.id}-${appointment.startsAt}`} onClick={() => openAppointment(appointment.id)} className="flex w-full items-center justify-between gap-4 border-t border-black/5 py-4 text-left first:border-0"><div><p className="font-bold">{appointment.customerName}</p><p className="text-xs text-[#737174]">{formatDateTime(appointment.startsAt)}  -  {appointment.branchName}  -  {appointment.staffName}</p></div><div className="flex items-center gap-3"><strong>{inr.format(appointment.price)}</strong><Status value={appointment.status} /><ChevronRight size={15} /></div></button>) : <Empty text="No booking history for this service." />}</Card>
      {profile.permissions.canEdit && <p className="rounded-2xl bg-[#e8efe9] p-4 text-sm font-bold text-[#1789AA]">You can edit this service and its branch overrides from the Services workspace.</p>}
    </>}
  </div>;
}

export function Pager({ page, total, pageSize, setPage }: { page: number; total: number; pageSize: number; setPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-black/8 pt-4 text-sm"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border px-3 py-2 font-bold disabled:opacity-40">Previous</button><span className="text-center text-xs font-bold text-[#737174] sm:text-sm">Page {page} of {pages}</span><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded-lg border px-3 py-2 font-bold disabled:opacity-40">Next</button></div>;
}
