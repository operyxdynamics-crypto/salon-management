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

import { AppointmentItem, BookingSeed, SubmitFn } from "@/components/workspace/contracts";
import { MoveAppointmentDialog, StatusReasonDialog, statusNeedsReason, terminalMoveMessage, type PendingMove, type PendingStatusChange } from "@/components/workspace/appointment-dialogs";
import { getAppointments } from "@/components/workspace/modules/bookings-api";
import { Card, Empty, Field, Info, Select, SlotMessage, Source, Status, WorkspaceDateInput, WorkspaceSelect, appointmentCardStyle, appointmentDisplayTotal, appointmentDuration, appointmentMobileCardStyle, appointmentPriorityLabel, appointmentQueuePriorityStyle, appointmentServiceLabel, canCheckoutAppointmentStatus, formatClockMinute, formatDate, formatTime, minutesInIndia, minutesToTime, nextStatuses, statusActionStyle, timeToMinutes, title } from "@/components/workspace/shared-ui";

export function AppointmentsView({ data, open, submit, openDetail, openSale, openInvoice }: { data: WorkspaceData; open: (seed?: BookingSeed | React.SyntheticEvent) => void; submit: SubmitFn; openDetail: (id: string) => void; openSale: (item: AppointmentItem) => void; openInvoice: (invoiceId?: string) => void }) {
  const [items, setItems] = useState(data.appointments);
  const [blocks, setBlocks] = useState(data.blockedTimes);
  const [date, setDate] = useState(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()));
  const [listFrom, setListFrom] = useState(date);
  const [listTo, setListTo] = useState(date);
  const [listBranchId, setListBranchId] = useState(data.identity.branchId || "all");
  const [searchQuery, setSearchQuery] = useState("");
  const [moduleView, setModuleView] = useState<"list" | "calendar">("list");
  const [view, setView] = useState<"day" | "week">("day");
  const [layout, setLayout] = useState<"timeline" | "agenda">("timeline");
  const [staffId, setStaffId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<{ page: number; pageSize: number; total: number; pages: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [blockFormOpen, setBlockFormOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);
  const [mobileVisualCalendar, setMobileVisualCalendar] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<PendingStatusChange | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [nowMinutes, setNowMinutes] = useState(() => minutesInIndia(new Date().toISOString()));

  /**
   * Saved views.
   *
   * A receptionist has four questions, not seven dropdowns: who is next, who has not turned up, who
   * still owes money, and who walked in. Those are one tap each. The dropdowns still exist, behind
   * "More filters", for the rare case where none of the four fit.
   */
  const [savedView, setSavedView] = useState<"all" | "waiting" | "unpaid" | "walkins">("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  /** Pixels per minute. A 15-minute service at 1.2 renders 18px tall - unreadable and undraggable. */
  const [zoom, setZoom] = useState(1.2);
  /** Where a dragged appointment would land. Dragging blind and then meeting a dialog is no way to move someone's booking. */
  const [dropPreview, setDropPreview] = useState<{ staffId: string; minutes: number; duration: number } | null>(null);
  const [draggingId, setDraggingId] = useState("");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() + 86_400_000));
  const selectedScopeBranches = useMemo(() => {
    const selected = data.identity.selectedBranchIds?.length ? new Set(data.identity.selectedBranchIds) : null;
    return selected ? data.identity.branches.filter((branch) => selected.has(branch.id)) : data.identity.branches;
  }, [data.identity.branches, data.identity.selectedBranchIds]);
  const selectedScopeBranchIds = selectedScopeBranches.map((branch) => branch.id);
  const selectedScopeBranchKey = selectedScopeBranchIds.join(",");

  useEffect(() => {
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    if (!isMobile && window.localStorage.getItem("operyx-appointments-view") === "calendar") setModuleView("calendar");
  }, []);

  useEffect(() => {
    window.localStorage.setItem("operyx-appointments-view", moduleView);
  }, [moduleView]);

  // Keep the timeline "now" marker live without re-rendering the whole module every second.
  useEffect(() => {
    const timer = window.setInterval(() => setNowMinutes(minutesInIndia(new Date().toISOString())), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setListBranchId(data.identity.scope === "branch" && data.identity.branchId ? data.identity.branchId : "all");
  }, [data.identity.branchId, data.identity.scope, selectedScopeBranchKey]);

  useEffect(() => {
    setPage(1);
  }, [listFrom, listTo, listBranchId, searchQuery, staffId, statusFilter, sourceFilter, moduleView]);

  useEffect(() => {
    const params = moduleView === "list"
      ? new URLSearchParams({ branchId: listBranchId, from: listFrom, to: listTo, page: String(page), pageSize: "25" })
      : new URLSearchParams({ branchId: data.identity.branchId || "all", date, view });
    if (listBranchId === "all" && selectedScopeBranchIds.length) params.set("branchIds", selectedScopeBranchIds.join(","));
    if (staffId) params.set("staffId", staffId);
    if (statusFilter) params.set("status", statusFilter);
    if (sourceFilter) params.set("source", sourceFilter);
    if (moduleView === "list" && searchQuery.trim()) params.set("q", searchQuery.trim());
    queueMicrotask(() => {
      setLoading(true);
      setLoadError("");
    });
    getAppointments(params)
      .then((result) => {
        setItems(Array.isArray(result) ? result : result.appointments);
        setBlocks(Array.isArray(result) ? [] : result.blockedTimes ?? []);
        setPagination(Array.isArray(result) ? null : result.pagination ?? null);
      })
      .catch((requestError) => setLoadError(requestError instanceof Error ? requestError.message : "Unable to load appointments"))
      .finally(() => setLoading(false));
  // `data.appointments` / `data.blockedTimes` are deliberately NOT dependencies: the effect never
  // reads them (they only seed the initial state), but they get a new array reference on every
  // parent render - so listing them here refetched the whole list on every clock tick and every
  // unrelated workspace change. That was the four identical requests in the logs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.identity.branchId, date, view, staffId, statusFilter, sourceFilter, moduleView, listBranchId, listFrom, listTo, searchQuery, page, selectedScopeBranchKey]);

  async function status(id: string, branchId: string, value: string) {
    setActionNotice("");
    if (statusNeedsReason(value)) {
      const item = items.find((appointment) => appointment.id === id);
      setDialogError("");
      setPendingStatus({
        appointmentId: id,
        branchId,
        status: value,
        customer: item?.customer ?? "this appointment",
        startsAt: item?.startsAt ?? new Date().toISOString(),
      });
      return;
    }
    await submit(`/api/v1/operations/appointments/${id}`, { branchId, status: value, idempotencyKey: `status-${id}-${value}-${Date.now()}` }, `Appointment moved to ${title(value)}.`, "PATCH");
  }

  async function confirmStatusReason(cancellationReason: string) {
    if (!pendingStatus) return;
    setDialogBusy(true);
    setDialogError("");
    const result = await submit(`/api/v1/operations/appointments/${pendingStatus.appointmentId}`, {
      branchId: pendingStatus.branchId,
      status: pendingStatus.status,
      cancellationReason,
      idempotencyKey: `status-${pendingStatus.appointmentId}-${pendingStatus.status}-${Date.now()}`,
    }, `Appointment moved to ${title(pendingStatus.status)}.`, "PATCH");
    setDialogBusy(false);
    if (result.ok) setPendingStatus(null);
    else setDialogError("That change could not be saved. Try again.");
  }

  function requestMove(appointmentId: string, targetStaffId: string | null, startsAt: string) {
    const item = items.find((appointment) => appointment.id === appointmentId);
    if (!item) return;
    setActionNotice("");
    if (["COMPLETED", "CANCELLED", "NO_SHOW"].includes(item.status)) {
      setActionNotice(terminalMoveMessage(item.status));
      return;
    }
    setDialogError("");
    setPendingMove({
      appointmentId: item.id,
      branchId: item.branchId,
      customer: item.customer,
      fromStartsAt: item.startsAt,
      toStartsAt: startsAt,
      staffId: targetStaffId,
      staffName: targetStaffId ? data.staff.find((member) => member.id === targetStaffId)?.name || "Selected professional" : "Unassigned",
    });
  }

  async function confirmMove() {
    if (!pendingMove) return;
    setDialogBusy(true);
    setDialogError("");
    const result = await submit(`/api/v1/operations/appointments/${pendingMove.appointmentId}`, {
      branchId: pendingMove.branchId,
      startsAt: pendingMove.toStartsAt,
      staffId: pendingMove.staffId,
      idempotencyKey: `calendar-move-${pendingMove.appointmentId}-${newId()}`,
    }, "Appointment rescheduled.", "PATCH");
    setDialogBusy(false);
    if (result.ok) setPendingMove(null);
    else setDialogError("That slot is no longer available. Pick another time.");
  }

  async function createBlockedTime(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!branch) return;
    const form = new FormData(event.currentTarget);
    const result = await submit("/api/v1/operations/appointments/blocks", {
      branchId: branch.id,
      title: form.get("title"),
      staffId: form.get("staffId") || null,
      resourceId: form.get("resourceId") || null,
      startsAt: new Date(String(form.get("startsAt"))).toISOString(),
      endsAt: new Date(String(form.get("endsAt"))).toISOString(),
      reason: form.get("reason") || null,
      idempotencyKey: `block-${newId()}`,
    }, "Blocked time created.", "POST", false);
    if (result.ok) setBlockFormOpen(false);
  }

  const branch = data.identity.branches.find((item) => item.id === data.identity.branchId);
  const dayOfWeek = new Date(`${date}T12:00:00+05:30`).getUTCDay();
  const hours = branch?.operatingHours.find((item) => item.dayOfWeek === dayOfWeek);
  const openMinutes = hours ? timeToMinutes(hours.opensAt) : 9 * 60;
  const closeMinutes = hours ? timeToMinutes(hours.closesAt) : 20 * 60;
  const timelineHeight = Math.max(120, (closeMinutes - openMinutes) * zoom);
  const visibleStaff = data.staff.filter((member) => (!staffId || member.id === staffId) && (!branch || member.branchIds.includes(branch.id)));
  const columns = [{ id: "", name: "Unassigned", role: "Needs assignment" }, ...visibleStaff];
  const allBranchAgenda = data.identity.scope !== "branch";
  const effectiveLayout = allBranchAgenda || view === "week" ? "agenda" : layout;
  const showNowLine = date === today && nowMinutes >= openMinutes && nowMinutes <= closeMinutes;

  /** Minutes since midnight for a pointer position, snapped to the 15-minute grid. */
  function timelineMinutes(clientY: number, element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    const raw = openMinutes + ((clientY - rect.top) / rect.height) * (closeMinutes - openMinutes);
    return Math.max(openMinutes, Math.min(closeMinutes - 15, Math.round(raw / 15) * 15));
  }

  function timelinePoint(clientY: number, element: HTMLElement) {
    // The ghost and the drop must land on the same minute, or the preview is a lie.
    const rounded = timelineMinutes(clientY, element);
    return new Date(`${date}T${minutesToTime(rounded)}:00+05:30`).toISOString();
  }

  const branchResources = data.resources.filter((resource) => !branch || resource.branchId === branch.id);

  // Saved views filter what has already been fetched, so switching between them is instant and does
  // not cost a round trip.
  const nowMs = Date.now();
  const viewCounts = {
    all: items.length,
    waiting: items.filter((item) => item.status === "CONFIRMED" && new Date(item.startsAt).getTime() < nowMs).length,
    unpaid: items.filter((item) => (item.invoice?.outstanding ?? 0) > 0).length,
    walkins: items.filter((item) => item.source === "WALK_IN").length,
  };
  const viewedItems = items.filter((item) => {
    if (savedView === "waiting") return item.status === "CONFIRMED" && new Date(item.startsAt).getTime() < nowMs;
    if (savedView === "unpaid") return (item.invoice?.outstanding ?? 0) > 0;
    if (savedView === "walkins") return item.source === "WALK_IN";
    return true;
  });

  const savedViews = [
    { id: "all" as const, label: "All", count: viewCounts.all },
    { id: "waiting" as const, label: "Not checked in", count: viewCounts.waiting },
    { id: "unpaid" as const, label: "Owes money", count: viewCounts.unpaid },
    { id: "walkins" as const, label: "Walk-ins", count: viewCounts.walkins },
  ];

  const resultCountLabel = moduleView === "list" && pagination ? `${pagination.total} bookings` : `${items.length} bookings`;
  const canFilterBranches = selectedScopeBranches.length > 1;
  const listedCount = pagination?.total ?? items.length;
  const pendingPaymentCount = items.filter((item) => item.invoice?.outstanding && item.invoice.outstanding > 0).length;
  const alertCount = items.filter((item) => item.customerAllergies || item.customerNotes || item.notes).length;
  const listedValue = items.reduce((sum, item) => sum + appointmentDisplayTotal(item), 0);
  const currentBranchLabel = listBranchId === "all"
    ? data.identity.scope === "multi" ? `${selectedScopeBranches.length} branches` : "All branches"
    : selectedScopeBranches.find((item) => item.id === listBranchId)?.name || "Branch";
  const dateChipLabel = listFrom === today && listTo === today ? "Today" : listFrom === tomorrow && listTo === tomorrow ? "Tomorrow" : listFrom === listTo ? formatDate(new Date(`${listFrom}T12:00:00+05:30`)) : "Custom";
  const branchFilterOptions = [...(canFilterBranches ? [{ value: "all", label: data.identity.scope === "multi" ? "Selected branches" : "All branches" }] : []), ...selectedScopeBranches.map((item) => ({ value: item.id, label: item.name, description: item.city }))];
  const staffFilterOptions = [{ value: "", label: "All professionals" }, ...data.staff.map((item) => ({ value: item.id, label: item.name, description: item.role }))];
  const statusFilterOptions = [{ value: "", label: "All statuses" }, ...["CONFIRMED", "CHECKED_IN", "IN_SERVICE", "COMPLETED", "CANCELLED", "NO_SHOW", "WAITLISTED"].map((item) => ({ value: item, label: title(item) }))];
  const sourceFilterOptions = [{ value: "", label: "All origins" }, ...["MARKETPLACE", "SALON_WEBSITE", "PHONE", "WALK_IN", "STAFF_CREATED"].map((item) => ({ value: item, label: title(item) }))];

  function setMobileDay(value: string) {
    setListFrom(value);
    setListTo(value);
    setDate(value);
    setModuleView("list");
    setPage(1);
  }

  function clearMobileFilters() {
    setSearchQuery("");
    setStaffId("");
    setStatusFilter("");
    setSourceFilter("");
    setListBranchId(data.identity.scope === "branch" && data.identity.branchId ? data.identity.branchId : "all");
    setListFrom(today);
    setListTo(today);
    setDate(today);
    setPage(1);
  }

  return <div className="space-y-5">
    {actionNotice && <div className="flex items-start justify-between gap-3 rounded-2xl border border-[#e9c2b9] bg-[#fff0ec] p-4 text-sm font-bold text-[#984f43]">
      <span className="flex gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{actionNotice}</span>
      <button type="button" onClick={() => setActionNotice("")} className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-extrabold" aria-label="Dismiss">Dismiss</button>
    </div>}

    {pendingStatus && <StatusReasonDialog
      pending={pendingStatus}
      busy={dialogBusy}
      error={dialogError}
      close={() => { setPendingStatus(null); setDialogError(""); }}
      confirm={confirmStatusReason}
    />}

    {pendingMove && <MoveAppointmentDialog
      pending={pendingMove}
      busy={dialogBusy}
      error={dialogError}
      close={() => { setPendingMove(null); setDialogError(""); }}
      confirm={confirmMove}
    />}

    <div className="lg:hidden">
      <div className="sticky top-[calc(72px+env(safe-area-inset-top))] z-20 -mx-3 -mt-4 border-b border-[#E5E7EB] bg-[#F7FAFC]/96 px-3 pb-3 pt-3 backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="inline-flex rounded-2xl bg-white p-1 shadow-sm">
            {(["list", "calendar"] as const).map((item) => <button key={item} type="button" onClick={() => setModuleView(item)} className={`rounded-xl px-3 py-2 text-xs font-extrabold transition ${moduleView === item ? "bg-[#173279] text-white shadow-sm" : "text-[#737174]"}`}>{item === "list" ? "List" : "Calendar"}</button>)}
          </div>
          <button type="button" onClick={() => setMobileSummaryOpen((value) => !value)} className="rounded-full border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-extrabold text-[#7b5514]">{listedCount} bookings</button>
        </div>
        <div className="grid gap-2">
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button type="button" onClick={() => setMobileDay(today)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-extrabold ${listFrom === today && listTo === today ? "bg-[#173279] text-white" : "bg-white text-[#737174]"}`}>Today</button>
            <button type="button" onClick={() => setMobileDay(tomorrow)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-extrabold ${listFrom === tomorrow && listTo === tomorrow ? "bg-[#173279] text-white" : "bg-white text-[#737174]"}`}>Tomorrow</button>
            <div className="w-40 shrink-0"><WorkspaceDateInput value={listFrom} onChange={setMobileDay} /></div>
          </div>
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <span className="truncate rounded-full bg-[#F7FAFC] px-3 py-2 text-xs font-extrabold text-[#7b5514]">{currentBranchLabel}</span>
            <button type="button" onClick={() => setMobileFiltersOpen(true)} className="rounded-full bg-white px-3 py-2 text-xs font-extrabold text-[#173279]"><Search size={13} className="mr-1 inline" />Search</button>
            <button type="button" onClick={() => setMobileFiltersOpen(true)} className="rounded-full bg-white px-3 py-2 text-xs font-extrabold text-[#173279]"><SlidersHorizontal size={13} className="mr-1 inline" />Filter</button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-extrabold">
          {staffId && <span className="rounded-full bg-[#eef5fc] px-3 py-1 text-[#315d89]">{data.staff.find((item) => item.id === staffId)?.name || "Staff"}</span>}
          {statusFilter && <span className="rounded-full bg-[#f5effc] px-3 py-1 text-[#674d8c]">{title(statusFilter)}</span>}
          {searchQuery && <span className="rounded-full bg-[#e7f8f2] px-3 py-1 text-[#0f6f57]">"{searchQuery}"</span>}
        </div>
      </div>

      {mobileSummaryOpen && <div className="mb-3 grid grid-cols-2 gap-2 rounded-3xl border border-[#E5E7EB] bg-white p-3 shadow-sm">
        <Info label="Bookings" value={String(listedCount)} tone="blue" />
        <Info label="Pending pay" value={String(pendingPaymentCount)} tone={pendingPaymentCount ? "amber" : "green"} />
        <Info label="Alerts" value={String(alertCount)} tone={alertCount ? "rose" : "green"} />
        <Info label="Value" value={inr.format(listedValue)} tone="green" />
      </div>}

      {loadError ? <SlotMessage text={loadError} error /> : loading ? <SlotMessage text="Loading appointments..." loading /> : moduleView === "calendar" ? (
        <div className="space-y-3">
          <div className="rounded-3xl border border-[#E5E7EB] bg-[#F7FAFC] p-3">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-xs font-extrabold uppercase tracking-[.14em] text-[#1789AA]">Calendar agenda</p><p className="mt-1 text-sm font-bold text-[#737174]">Mobile shows agenda first. Visual timeline is optional.</p></div>
              <button type="button" onClick={() => setMobileVisualCalendar((value) => !value)} className="rounded-full bg-white px-3 py-2 text-xs font-extrabold text-[#173279]">{mobileVisualCalendar ? "Hide visual" : "Visual calendar"}</button>
            </div>
          </div>
          {mobileVisualCalendar && <div className="rounded-3xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
            <div className="space-y-2">{items.map((item) => <button key={item.id} type="button" onClick={() => openDetail(item.id)} className={`flex w-full gap-3 rounded-2xl border p-3 text-left ${appointmentMobileCardStyle(item, false, Date.now())}`}><div className="w-16 shrink-0 text-sm font-extrabold">{formatTime(item.startsAt)}</div><div className="min-w-0 flex-1"><p className="truncate font-bold">{item.customer}</p><p className="truncate text-xs text-[#737174]">{appointmentServiceLabel(item)} - {item.staff}</p></div><Status value={item.status} /></button>)}</div>
            {!items.length && <Empty text="No appointments on this date." />}
          </div>}
          <AppointmentSmartList items={items} pagination={pagination} page={page} setPage={setPage} onStatus={status} onOpen={openDetail} onSale={openSale} onInvoice={openInvoice} showSummary={false} />
        </div>
      ) : <AppointmentSmartList items={items} pagination={pagination} page={page} setPage={setPage} onStatus={status} onOpen={openDetail} onSale={openSale} onInvoice={openInvoice} showSummary={false} />}

      <button type="button" onClick={() => open()} className="primary fixed inset-x-3 bottom-[calc(5.85rem+env(safe-area-inset-bottom))] z-30 justify-center shadow-[0_18px_42px_rgba(16,26,23,.28)]"><Plus size={16} /> New appointment</button>

      {mobileFiltersOpen && <div className="fixed inset-0 z-50 flex items-end overflow-hidden bg-black/35 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && setMobileFiltersOpen(false)}>
        <section className="mobile-bottom-sheet flex w-full flex-col overflow-hidden rounded-t-[2rem] bg-[#fbfdff] shadow-2xl">
          <div className="mx-auto my-4 h-1.5 w-12 shrink-0 rounded-full bg-black/15" />
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-black/6 px-5 pb-4"><div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-[#1789AA]">Search and filters</p><h3 className="font-serif text-2xl font-semibold">Find appointments</h3></div><button type="button" onClick={() => setMobileFiltersOpen(false)} className="grid size-10 shrink-0 place-items-center rounded-full bg-[#F7FAFC]"><X size={18} /></button></div>
          <div className="mobile-bottom-sheet-body min-h-0 flex-1 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5">
          <div className="grid gap-3">
            <label className="text-sm font-bold">Search customer, mobile, service, ref<input className="field mt-2" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search appointments" /></label>
            <div className="grid grid-cols-2 gap-3"><WorkspaceDateInput label="From" value={listFrom} onChange={(value) => { setListFrom(value); setDate(value); }} /><WorkspaceDateInput label="To" value={listTo} onChange={setListTo} /></div>
            <WorkspaceSelect label="Branch" disabled={!canFilterBranches} value={listBranchId} onChange={setListBranchId} options={branchFilterOptions} />
            <WorkspaceSelect label="Staff" value={staffId} onChange={setStaffId} options={staffFilterOptions} />
            <WorkspaceSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={statusFilterOptions} />
            <WorkspaceSelect label="Source" value={sourceFilter} onChange={setSourceFilter} options={sourceFilterOptions} />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={clearMobileFilters} className="rounded-full border border-[#E5E7EB] bg-white px-4 py-3 text-sm font-extrabold text-[#7b5514]">Clear</button><button type="button" onClick={() => setMobileFiltersOpen(false)} className="primary justify-center">Show appointments</button></div>
          </div>
        </section>
      </div>}
    </div>

    <div className="hidden lg:block">
    <Card title="Appointments" action={<><button type="button" disabled={!branch} onClick={() => setBlockFormOpen((value) => !value)} className="rounded-full border border-[#E5E7EB] bg-[#F7FAFC] px-4 py-2 text-sm font-extrabold text-[#7b5514] disabled:opacity-45">Block time</button><button onClick={() => open()} className="primary"><Plus size={15} /> New appointment</button></>}>
      <div className="mb-5 flex flex-col gap-3 rounded-3xl border border-[#E5E7EB]/45 bg-[#F7FAFC] p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-2xl bg-white p-1 shadow-sm">
          {(["list", "calendar"] as const).map((item) => <button key={item} type="button" onClick={() => setModuleView(item)} className={`rounded-xl px-4 py-2 text-sm font-extrabold transition ${moduleView === item ? "bg-[#173279] text-white shadow-sm" : "text-[#737174] hover:bg-[#f5f0e8]"}`}>{item === "list" ? "List" : "Calendar"}</button>)}
        </div>
        <p className="text-xs font-semibold text-[#737174]">{moduleView === "list" ? "Counter-friendly list for search, quick status changes, and sale handoff." : "Visual schedule for drag/drop, blocked time, and timeline planning."}</p>
      </div>
      {blockFormOpen && branch && <form onSubmit={createBlockedTime} className="mb-5 grid gap-3 rounded-2xl border border-[#ead39c] bg-[#F7FAFC] p-4 md:grid-cols-3">
        <Field name="title" label="Block title" defaultValue="Blocked time" />
        <Select name="staffId" label="Staff, optional" required={false} options={visibleStaff.map((member) => [member.id, member.name])} />
        <Select name="resourceId" label="Resource, optional" required={false} options={branchResources.map((resource) => [resource.id, `${resource.name} - ${title(resource.type)}`])} />
        <Field name="startsAt" label="Starts" type="datetime-local" defaultValue={`${date}T10:00`} />
        <Field name="endsAt" label="Ends" type="datetime-local" defaultValue={`${date}T11:00`} />
        <Field name="reason" label="Reason" required={false} />
        <button className="primary justify-center md:col-span-3">Save blocked time</button>
      </form>}
      {/* Four questions, one tap each. The dropdowns are still here, behind "More filters", for the
          rare case where none of the four fit. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {savedViews.map((view) => <button
          key={view.id}
          type="button"
          onClick={() => setSavedView(view.id)}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-extrabold transition ${savedView === view.id ? "bg-[#5B2A86] text-white shadow-sm" : "bg-[#F6F7FB] text-[#6B7280] hover:bg-[#EFE8F6] hover:text-[#5B2A86]"}`}
        >
          {view.label}
          <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${savedView === view.id ? "bg-white/20" : view.count && view.id !== "all" ? "bg-[#F5D0C5] text-[#984f43]" : "bg-white text-[#9CA3AF]"}`}>{view.count}</span>
        </button>)}

        <div className="ml-auto flex items-center gap-2">
          <div className="relative w-56"><Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-[#9a938b]" /><input className="field pl-10" placeholder="Search name or mobile" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} /></div>
          <button
            type="button"
            onClick={() => setFiltersOpen((value) => !value)}
            className={`rounded-xl border px-3 py-3 text-sm font-extrabold transition ${filtersOpen || staffId || statusFilter || sourceFilter ? "border-[#5B2A86] bg-[#EFE8F6] text-[#5B2A86]" : "border-[#E5E7EB] bg-white text-[#6B7280]"}`}
          >
            <SlidersHorizontal size={15} className="mr-1 inline" />
            More filters
          </button>
        </div>
      </div>

      {filtersOpen && <div className="mb-5 grid gap-2 rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] p-3 md:grid-cols-6">
        {moduleView === "list" ? <>
          <WorkspaceDateInput value={listFrom} onChange={setListFrom} />
          <WorkspaceDateInput value={listTo} onChange={setListTo} />
          <WorkspaceSelect disabled={!canFilterBranches} value={listBranchId} onChange={setListBranchId} options={branchFilterOptions} />
        </> : <>
          <WorkspaceDateInput value={date} onChange={setDate} />
          <WorkspaceSelect value={view} onChange={(value) => setView(value as "day" | "week")} options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }]} />
          <WorkspaceSelect disabled={allBranchAgenda || view === "week"} value={effectiveLayout} onChange={(value) => setLayout(value as "timeline" | "agenda")} options={[{ value: "timeline", label: "Timeline" }, { value: "agenda", label: "Agenda" }]} />
        </>}
        <WorkspaceSelect value={staffId} onChange={setStaffId} options={staffFilterOptions} />
        <WorkspaceSelect value={statusFilter} onChange={setStatusFilter} options={statusFilterOptions} />
        <WorkspaceSelect value={sourceFilter} onChange={setSourceFilter} options={sourceFilterOptions} />
      </div>}
      {loadError ? <SlotMessage text={loadError} error /> : loading ? <SlotMessage text="Loading appointments..." loading /> : moduleView === "list" ? (
        <AppointmentSmartList items={viewedItems} pagination={savedView === "all" ? pagination : null} page={page} setPage={setPage} onStatus={status} onOpen={openDetail} onSale={openSale} onInvoice={openInvoice} />
      ) : effectiveLayout === "agenda" ? (
        allBranchAgenda
          ? <div className="space-y-5">{data.identity.branches.map((agendaBranch) => <section key={agendaBranch.id}><h3 className="mb-2 font-serif text-xl font-bold">{agendaBranch.name}</h3><AppointmentTable data={{ ...data, appointments: viewedItems.filter((item) => item.branchId === agendaBranch.id) }} onStatus={status} onOpen={(item) => openDetail(item.id)} />{blocks.filter((block) => block.branchId === agendaBranch.id).length ? <BlockedTimeList blocks={blocks.filter((block) => block.branchId === agendaBranch.id)} /> : null}</section>)}</div>
          : <><AppointmentTable data={{ ...data, appointments: viewedItems }} onStatus={status} onOpen={(item) => openDetail(item.id)} />{blocks.length ? <BlockedTimeList blocks={blocks} /> : null}</>
      ) : hours?.isClosed ? <SlotMessage text="This branch is closed on the selected day." /> : !hours || !branch ? <SlotMessage text="Operating hours are not configured for this day." error /> : (
        <div className="overflow-x-auto"><div className="min-w-[960px]">
          {/* Zoom. At the old fixed scale a 15-minute service was 18px tall: too small to read and
              too small to grab. */}
          <div className="mb-3 flex items-center justify-end gap-1.5">
            <span className="text-xs font-bold text-[#9CA3AF]">Zoom</span>
            {([["Compact", 0.8], ["Normal", 1.2], ["Roomy", 2]] as const).map(([label, value]) => <button
              key={label}
              type="button"
              onClick={() => setZoom(value)}
              className={`rounded-lg px-2.5 py-1 text-xs font-extrabold transition ${zoom === value ? "bg-[#5B2A86] text-white" : "bg-[#F6F7FB] text-[#6B7280] hover:bg-[#EFE8F6]"}`}
            >{label}</button>)}
          </div>
          <div className="grid border-b border-black/8" style={{ gridTemplateColumns: `80px repeat(${columns.length}, minmax(180px, 1fr))` }}><div />{columns.map((member) => <div key={member.id || "unassigned"} className="border-l border-black/6 p-3 text-center text-sm font-bold">{member.name}<span className="block text-xs font-normal text-[#737174]">{member.role}</span></div>)}</div>
          <div className="relative grid" style={{ gridTemplateColumns: `80px repeat(${columns.length}, minmax(180px, 1fr))` }}>
            {showNowLine && <div className="pointer-events-none absolute left-0 right-0 z-20 flex items-center" style={{ top: (nowMinutes - openMinutes) * zoom }}>
              <span className="w-[80px] shrink-0 pr-2 text-right text-[11px] font-extrabold text-[#D85A30]">{formatClockMinute(nowMinutes)}</span>
              <span className="relative h-0 flex-1 border-t-2 border-[#D85A30]"><span className="absolute -top-[3px] left-0 size-1.5 rounded-full bg-[#D85A30]" /></span>
            </div>}
            <div className="relative" style={{ height: timelineHeight }}>{Array.from({ length: Math.ceil((closeMinutes - openMinutes) / 60) + 1 }, (_, index) => openMinutes + index * 60).map((minute) => <span key={minute} className="absolute right-3 text-xs font-bold text-[#737174]" style={{ top: (minute - openMinutes) * zoom - 7 }}>{formatClockMinute(minute)}</span>)}</div>
            {columns.map((member) => <div
              key={member.id || "unassigned"}
              className="relative border-l border-black/6 bg-[linear-gradient(to_bottom,transparent_71px,rgba(0,0,0,.06)_72px)] bg-[length:100%_72px]"
              style={{ height: timelineHeight, backgroundSize: `100% ${60 * zoom}px` }}
              onDragOver={(event) => {
                event.preventDefault();
                // Show where it would land, snapped to the same 15-minute grid the drop will use.
                const dragged = items.find((item) => item.id === draggingId);
                const minutes = timelineMinutes(event.clientY, event.currentTarget);
                const duration = dragged ? Math.max(15, (new Date(dragged.endsAt).getTime() - new Date(dragged.startsAt).getTime()) / 60_000) : 30;
                setDropPreview({ staffId: member.id, minutes, duration });
              }}
              onDragLeave={() => setDropPreview(null)}
              onDrop={(event) => {
                setDropPreview(null);
                requestMove(event.dataTransfer.getData("text/appointment"), member.id || null, timelinePoint(event.clientY, event.currentTarget));
              }}
              onDoubleClick={(event) => open({ branchId: branch.id, date, startsAt: timelinePoint(event.clientY, event.currentTarget), staffId: member.id || undefined })}
            >
              {/* The ghost. Dragging blind and then meeting a confirmation dialog is no way to move
                  somebody's booking. */}
              {dropPreview?.staffId === member.id && <div
                className="pointer-events-none absolute inset-x-1 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-[#5B2A86] bg-[#EFE8F6]/80 text-[11px] font-extrabold text-[#5B2A86]"
                style={{ top: Math.max(0, dropPreview.minutes - openMinutes) * zoom, height: Math.max(30, dropPreview.duration * zoom) }}
              >
                {formatClockMinute(dropPreview.minutes)}
              </div>}

              {blocks.filter((block) => block.branchId === branch.id && (block.staffId ? block.staffId === member.id : member.id === "" || !block.resourceId)).map((block) => {
                const start = minutesInIndia(block.startsAt);
                const duration = Math.max(15, (new Date(block.endsAt).getTime() - new Date(block.startsAt).getTime()) / 60_000);
                return <div key={block.id} className="absolute inset-x-1 rounded-xl border border-[#e0c26e] bg-[#fff7df]/95 p-2 text-xs font-bold text-[#7b5514] shadow-sm" style={{ top: Math.max(0, start - openMinutes) * zoom, height: Math.max(30, duration * zoom) }}><span>{block.title}</span><span className="mt-1 block font-semibold opacity-75">{block.staffName || block.resourceName || "Branch block"}</span></div>;
              })}
              {viewedItems.filter((item) => (item.staffId || "") === member.id).map((item) => {
                const start = minutesInIndia(item.startsAt);
                const duration = Math.max(15, (new Date(item.endsAt).getTime() - new Date(item.startsAt).getTime()) / 60_000);
                const terminal = ["COMPLETED", "CANCELLED", "NO_SHOW"].includes(item.status);
                return <button
                  type="button"
                  draggable={!terminal}
                  onDragStart={(event) => {
                    if (terminal) return event.preventDefault();
                    event.dataTransfer.setData("text/appointment", item.id);
                    setDraggingId(item.id);
                  }}
                  onDragEnd={() => { setDraggingId(""); setDropPreview(null); }}
                  onClick={() => openDetail(item.id)}
                  key={item.id}
                  className={`absolute inset-x-1 overflow-hidden rounded-xl border-l-4 p-2 text-left text-xs shadow-sm transition hover:brightness-[.98] hover:shadow-md ${terminal ? "cursor-not-allowed opacity-80" : "cursor-grab active:cursor-grabbing"} ${draggingId === item.id ? "opacity-40" : ""} ${appointmentCardStyle(item.status)}`}
                  style={{ top: Math.max(0, start - openMinutes) * zoom, height: Math.max(34, duration * zoom) }}
                >
                  <span className="flex items-center gap-1 font-bold"><GripVertical size={12} />{formatTime(item.startsAt)}  -  {item.customer}</span>
                  <span className="mt-1 block truncate opacity-75">{item.serviceLines.length > 1 ? `${item.serviceLines.length} services` : item.service}{item.resourceName ? ` - ${item.resourceName}` : ""}</span>
                  <Source value={item.source} />
                </button>;
              })}
            </div>)}
          </div>
          {!viewedItems.length && <Empty text={savedView === "all" ? "No appointments for this day. Double-click a slot to create one." : "Nothing matches this view."} />}
        </div></div>
      )}
    </Card>
    </div>
  </div>;
}

export function AppointmentTable({ data, compact, onStatus, onOpen }: { data: WorkspaceData; compact?: boolean; onStatus?: (id: string, branchId: string, value: string) => void; onOpen?: (item: WorkspaceData["appointments"][number]) => void }) {
  const items = compact ? data.appointments.slice(0, 5) : data.appointments;
  return <div className="overflow-x-auto"><table className="w-full min-w-[940px] text-left text-sm"><thead className="text-xs uppercase tracking-wider text-[#737174]"><tr><th className="pb-3">Time</th><th className="pb-3">Branch</th><th className="pb-3">Customer</th><th className="pb-3">Service</th><th className="pb-3">Professional</th><th className="pb-3">Origin</th><th className="pb-3">Status</th>{onStatus && <th className="pb-3">Action</th>}</tr></thead><tbody>{items.map((item) => <tr key={item.id} onClick={() => onOpen?.(item)} className={`border-t border-black/5 ${onOpen ? "cursor-pointer hover:bg-[#faf7f3]" : ""}`}><td className="py-4 font-bold">{formatTime(item.startsAt)}</td><td className="py-4">{item.branchName}</td><td className="py-4">{item.customer}</td><td className="py-4">{item.service}</td><td className="py-4">{item.staff}</td><td className="py-4"><Source value={item.source} /></td><td className="py-4"><Status value={item.status} /></td>{onStatus && <td className="py-4" onClick={(event) => event.stopPropagation()}><WorkspaceSelect value="" onChange={(value) => value && onStatus(item.id, item.branchId, value)} options={[{ value: "", label: "Update" }, ...nextStatuses(item.status).map((value) => ({ value, label: title(value) }))]} compact /></td>}</tr>)}</tbody></table>{!items.length && <Empty text="No appointments for this period." />}</div>;
}

export function AppointmentSmartList({ items, pagination, page, setPage, onStatus, onOpen, onSale, onInvoice, showSummary = true }: {
  items: AppointmentItem[];
  pagination: { page: number; pageSize: number; total: number; pages: number } | null;
  page: number;
  setPage: (page: number) => void;
  onStatus: (id: string, branchId: string, value: string) => void;
  onOpen: (id: string) => void;
  onSale: (item: AppointmentItem) => void;
  onInvoice: (invoiceId?: string) => void;
  showSummary?: boolean;
}) {
  const sortedItems = [...items].sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
  const now = Date.now();
  const nextAppointmentId = sortedItems.find((item) => item.status === "CONFIRMED" && new Date(item.startsAt).getTime() > now)?.id;
  const pendingPayment = items.filter((item) => item.invoice?.outstanding && item.invoice.outstanding > 0).length;
  const alerts = items.filter((item) => item.customerAllergies || item.customerNotes || item.notes).length;
  const totalValue = items.reduce((sum, item) => sum + appointmentDisplayTotal(item), 0);
  return <div className="space-y-4">
    {showSummary && <div className="grid gap-3 sm:grid-cols-4">
      <Info label="Visible bookings" value={String(pagination?.total ?? items.length)} tone="blue" />
      <Info label="Pending payment" value={String(pendingPayment)} tone={pendingPayment ? "amber" : "green"} />
      <Info label="Customer alerts" value={String(alerts)} tone={alerts ? "rose" : "green"} />
      <Info label="Listed value" value={inr.format(totalValue)} tone="green" />
    </div>}
    <div className="hidden overflow-x-auto rounded-3xl border border-black/8 bg-white shadow-sm lg:block">
      <table className="w-full min-w-[1180px] text-left text-sm">
        <thead className="sticky top-0 bg-[#F7FAFC] text-xs uppercase tracking-wider text-[#737174]"><tr><th className="px-4 py-3">When</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Services</th><th className="px-4 py-3">Professional</th><th className="px-4 py-3">Branch</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Actions</th></tr></thead>
        <tbody>{sortedItems.map((item) => <tr key={item.id} onClick={() => onOpen(item.id)} className="cursor-pointer border-t border-black/5 align-top transition hover:bg-[#faf7f3]">
          <td className="px-4 py-4"><strong>{formatTime(item.startsAt)}</strong><p className="mt-1 text-xs text-[#737174]">{formatDate(new Date(item.startsAt))}</p><p className="mt-1 text-[11px] font-bold text-[#1789AA]">#{item.bookingReference.slice(-6).toUpperCase()}</p></td>
          <td className="px-4 py-4"><p className="font-bold">{item.customer}</p><p className="mt-1 text-xs text-[#737174]"><Phone size={12} className="mr-1 inline" />{item.phone}</p>{(item.customerAllergies || item.customerNotes) && <p className="mt-2 rounded-full bg-[#fff0ec] px-2 py-1 text-[11px] font-extrabold text-[#984f43]">Review customer alert</p>}</td>
          <td className="px-4 py-4"><p className="font-bold">{appointmentServiceLabel(item)}</p><p className="mt-1 text-xs text-[#737174]">{appointmentDuration(item)} min - {inr.format(appointmentDisplayTotal(item))}</p>{item.notes && <p className="mt-2 max-w-52 truncate rounded-full bg-[#F7FAFC] px-2 py-1 text-[11px] font-bold text-[#737174]">Note: {item.notes}</p>}</td>
          <td className="px-4 py-4">{item.staff}<p className="mt-1 text-xs text-[#737174]">{item.resourceName || "No resource"}</p></td>
          <td className="px-4 py-4">{item.branchName}</td>
          <td className="px-4 py-4"><Source value={item.source} /></td>
          <td className="px-4 py-4"><Status value={item.status} /></td>
          <td className="px-4 py-4">{item.invoice ? <button type="button" onClick={(event) => { event.stopPropagation(); onInvoice(item.invoice?.id); }} className="text-left"><p className="font-bold text-[#173279]">{item.invoice.number}</p><p className={`mt-1 text-xs font-bold ${item.invoice.outstanding > 0 ? "text-[#b47a18]" : "text-[#3f7c5d]"}`}>{item.invoice.outstanding > 0 ? `${inr.format(item.invoice.outstanding)} due` : title(item.invoice.status)}</p></button> : <span className="rounded-full bg-[#F7FAFC] px-3 py-1 text-xs font-extrabold text-[#7c5a1e]">No invoice</span>}</td>
          <td className="px-4 py-4" onClick={(event) => event.stopPropagation()}><AppointmentRowActions item={item} onStatus={onStatus} onSale={onSale} onInvoice={onInvoice} /></td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="grid gap-3 lg:hidden">{sortedItems.map((item) => {
      const isNext = item.id === nextAppointmentId;
      const priority = appointmentPriorityLabel(item, isNext, now);
      return <article key={item.id} onClick={() => onOpen(item.id)} className={`rounded-3xl border p-4 text-left shadow-sm ${appointmentMobileCardStyle(item, isNext, now)}`}>
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-2xl font-extrabold tracking-tight">{formatTime(item.startsAt)}</p><p className="mt-1 text-[11px] font-bold uppercase tracking-[.12em] text-[#737174]">{formatDate(new Date(item.startsAt))}</p></div>
          <div className="flex flex-col items-end gap-2"><Status value={item.status} />{priority && <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.12em] ${appointmentQueuePriorityStyle(priority).badge}`}>{priority}</span>}</div>
        </div>
        <div className="mt-4">
          <p className="text-lg font-extrabold">{item.customer}</p>
          <p className="mt-1 text-xs font-semibold text-[#737174]"><Phone size={12} className="mr-1 inline" />{item.phone}</p>
        </div>
        <p className="mt-3 font-semibold">{appointmentServiceLabel(item)}</p>
        <p className="mt-1 text-xs text-[#737174]">{item.staff || "Unassigned"} - {item.branchName}</p>
        {(item.customerAllergies || item.customerNotes || item.notes) && <p className="mt-3 rounded-2xl bg-[#fff0ec] p-3 text-xs font-bold text-[#984f43]">{item.customerAllergies || item.customerNotes || item.notes}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2"><Source value={item.source} />{item.invoice ? <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${item.invoice.outstanding > 0 ? "bg-[#F7FAFC] text-[#7b5514]" : "bg-[#e7f8f2] text-[#0f6f57]"}`}>{item.invoice.outstanding > 0 ? `${inr.format(item.invoice.outstanding)} due` : item.invoice.number}</span> : <span className="rounded-full bg-[#F7FAFC] px-3 py-1 text-xs font-extrabold text-[#7c5a1e]">No invoice</span>}</div>
        <div className="mt-4 flex flex-wrap items-center gap-2" onClick={(event) => event.stopPropagation()}>
          <button type="button" onClick={() => onOpen(item.id)} className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-extrabold text-[#25262C] shadow-sm">View details</button>
          <AppointmentRowActions item={item} onStatus={onStatus} onSale={onSale} onInvoice={onInvoice} compact />
        </div>
      </article>;
    })}</div>
    {!items.length && <Empty text="No appointments match these filters." />}
    {pagination && pagination.pages > 1 && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#F7FAFC] p-3 text-sm font-bold text-[#737174]"><span>Page {pagination.page} of {pagination.pages} - {pagination.total} bookings</span><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage(Math.max(1, page - 1))} className="rounded-full border px-4 py-2 disabled:opacity-40">Previous</button><button type="button" disabled={page >= pagination.pages} onClick={() => setPage(Math.min(pagination.pages, page + 1))} className="rounded-full border px-4 py-2 disabled:opacity-40">Next</button></div></div>}
  </div>;
}

export function AppointmentRowActions({ item, onStatus, onSale, onInvoice, compact }: { item: AppointmentItem; onStatus: (id: string, branchId: string, value: string) => void; onSale: (item: AppointmentItem) => void; onInvoice: (invoiceId?: string) => void; compact?: boolean }) {
  const actions = nextStatuses(item.status);
  return <div className={`flex flex-wrap gap-2 ${compact ? "" : "max-w-72"}`}>
    {actions.map((value) => <button type="button" key={value} onClick={() => onStatus(item.id, item.branchId, value)} className={`rounded-full border px-3 py-1.5 text-xs font-extrabold ${statusActionStyle(value)}`}>{title(value)}</button>)}
    {item.invoice ? <button type="button" onClick={() => onInvoice(item.invoice?.id)} className="rounded-full border border-[#a8ead8] bg-[#e7f8f2] px-3 py-1.5 text-xs font-extrabold text-[#0f6f57]">Open invoice</button> : canCheckoutAppointmentStatus(item.status) ? <button type="button" onClick={() => onSale(item)} className="rounded-full border border-[#E5E7EB] bg-[#F7FAFC] px-3 py-1.5 text-xs font-extrabold text-[#7b5514]"><ReceiptText size={12} className="mr-1 inline" />Create sale</button> : <span className="rounded-full border border-[#e9c2b9] bg-[#fff0ec] px-3 py-1.5 text-xs font-extrabold text-[#984f43]">Checkout blocked</span>}
  </div>;
}

export function BlockedTimeList({ blocks }: { blocks: WorkspaceData["blockedTimes"] }) {
  return <div className="mt-3 grid gap-2">{blocks.map((block) => <div key={block.id} className="rounded-2xl border border-[#ead39c] bg-[#F7FAFC] p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{block.title}</strong><span className="text-xs font-bold text-[#7b5514]">{formatTime(block.startsAt)} - {formatTime(block.endsAt)}</span></div><p className="mt-1 text-xs text-[#737174]">{block.staffName || block.resourceName || "Branch block"}{block.reason ? ` - ${block.reason}` : ""}</p></div>)}</div>;
}
