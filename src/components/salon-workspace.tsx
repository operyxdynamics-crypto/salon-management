"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Boxes,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
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
  PackagePlus,
  Phone,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Send,
  Settings,
  Sparkles,
  Star,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { BrandMark, brandName } from "@/components/brand-mark";
import { inr, initials } from "@/lib/format";
import type { AppointmentDetail, CustomerProfile, ServiceProfile, WorkspaceData } from "@/lib/operations-types";

const navItems = ["Overview", "Calendar", "Customers", "Point of sale", "Services", "Inventory", "Team", "Memberships", "Marketing", "Reviews", "Reports", "Settings"] as const;
type NavItem = (typeof navItems)[number];
type ModalName = "appointment" | "customer" | "service" | "stock" | "expense" | "leave" | "staff" | null;
type BookingSeed = {
  branchId?: string;
  date?: string;
  startsAt?: string;
  staffId?: string;
  customerId?: string;
  source?: "WALK_IN" | "PHONE" | "STAFF_CREATED";
};
type MutationResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string; code?: string };
type SubmitFn = <T = unknown>(path: string, body: unknown, message: string, method?: string, closeModal?: boolean) => Promise<MutationResult<T>>;
type WorkspaceDetail = { appointmentId: string | null; customerId: string | null; serviceId: string | null };

const icons: Record<NavItem, typeof LayoutDashboard> = {
  Overview: LayoutDashboard,
  Calendar: CalendarDays,
  Customers: Users,
  "Point of sale": CreditCard,
  Services: Sparkles,
  Inventory: Boxes,
  Team: UserRound,
  Memberships: Gift,
  Marketing: MessageCircle,
  Reviews: Star,
  Reports: BarChart3,
  Settings,
};

export function SalonWorkspace({ initialData, initialDetail }: { initialData: WorkspaceData; initialDetail?: WorkspaceDetail }) {
  const [data, setData] = useState(initialData);
  const [active, setActive] = useState<NavItem>("Overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<ModalName>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState(initialData.identity.branchId || "all");
  const [bookingSeed, setBookingSeed] = useState<BookingSeed>({});
  const [detail, setDetail] = useState<WorkspaceDetail>(initialDetail || { appointmentId: null, customerId: null, serviceId: null });
  const [focusedInvoiceId, setFocusedInvoiceId] = useState<string | null>(null);
  const visibleNavItems = navItems.filter((item) => canOpen(data.identity.role, item));

  const readDetailFromUrl = useCallback((): WorkspaceDetail => {
    const params = new URLSearchParams(window.location.search);
    return {
      appointmentId: params.get("appointmentId"),
      customerId: params.get("customerId"),
      serviceId: params.get("serviceId"),
    };
  }, []);

  useEffect(() => {
    const sync = () => setDetail(readDetailFromUrl());
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [readDetailFromUrl]);

  async function refresh(message?: string, branchId = selectedBranchId) {
    const response = await fetch(`/api/v1/operations/bootstrap?branchId=${encodeURIComponent(branchId)}`, { cache: "no-store" });
    if (response.status === 401 || response.status === 403) {
      window.location.href = "/login";
      return;
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || "Unable to refresh workspace");
    setData(result.data);
    if (message) setNotice(message);
  }

  async function submit<T = unknown>(path: string, body: unknown, message: string, method = "POST", closeModal = true): Promise<MutationResult<T>> {
    const payload = body as Record<string, unknown>;
    const operationBranchId = typeof payload.branchId === "string" ? payload.branchId : selectedBranchId;
    if (path.startsWith("/api/v1/operations/") && operationBranchId === "all") {
      setError("Select a branch before making operational changes.");
      return { ok: false, error: "Select a branch before making operational changes." };
    }
    setBusy(true);
    setError("");
    const response = await fetch(path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, branchId: operationBranchId }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(result.error?.message || result.error || "Unable to save");
      return { ok: false, error: result.error?.message || result.error || "Unable to save", code: result.error?.code };
    }
    if (closeModal) setModal(null);
    await refresh(message);
    return { ok: true, data: result.data as T };
  }

  function openAppointment(seed: BookingSeed | React.SyntheticEvent = {}) {
    setBookingSeed("nativeEvent" in seed ? {} : seed);
    setModal("appointment");
    setError("");
  }

  function navigate(item: NavItem) {
    setActive(item);
    setMenuOpen(false);
    setNotice("");
    setError("");
  }

  function openInvoiceCenter(invoiceId?: string) {
    setFocusedInvoiceId(invoiceId || null);
    navigate("Reports");
  }

  function openDetail(kind: keyof WorkspaceDetail, id: string) {
    const params = new URLSearchParams(window.location.search);
    params.delete("appointmentId");
    params.delete("customerId");
    params.delete("serviceId");
    params.set(kind, id);
    window.history.pushState(null, "", `${window.location.pathname}?${params.toString()}`);
    setDetail({
      appointmentId: kind === "appointmentId" ? id : null,
      customerId: kind === "customerId" ? id : null,
      serviceId: kind === "serviceId" ? id : null,
    });
  }

  function closeDetail() {
    const params = new URLSearchParams(window.location.search);
    params.delete("appointmentId");
    params.delete("customerId");
    params.delete("serviceId");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    setDetail({ appointmentId: null, customerId: null, serviceId: null });
  }

  return (
    <div className="min-h-screen text-[#252320]">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col overflow-hidden bg-[#0e0c09] text-white shadow-[24px_0_60px_rgba(24,18,10,.18)] transition-transform lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-60 bg-[radial-gradient(circle_at_30%_0%,rgba(214,179,94,.34),transparent_62%)]" />
        <div className="relative flex h-24 shrink-0 items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandMark light />
          </Link>
          <button onClick={() => setMenuOpen(false)} className="grid size-10 place-items-center rounded-full bg-white/10 text-white lg:hidden"><X size={20} /></button>
        </div>
        <div className="relative mx-4 shrink-0 rounded-3xl border border-white/10 bg-white/[0.07] p-4 shadow-inner shadow-white/5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#d6b35e]">Workspace</p>
          <p className="mt-1 truncate text-sm font-semibold">{data.identity.tenantName}</p>
          <p className="mt-1 truncate text-xs text-white/55">{data.identity.branchName}</p>
        </div>
        <nav className="relative mt-5 min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {visibleNavItems.map((item) => {
            const Icon = icons[item];
            return <button key={item} onClick={() => navigate(item)} className={`group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm font-bold transition ${active === item ? "bg-[#fffaf0] text-[#16120d] shadow-[0_12px_30px_rgba(0,0,0,.22)]" : "text-white/62 hover:bg-white/10 hover:text-white"}`}><span className={`grid size-8 place-items-center rounded-xl ${active === item ? "bg-[#d6b35e] text-[#16120d]" : "bg-white/8 text-[#d6b35e] group-hover:bg-white/12"}`}><Icon size={17} /></span>{item}</button>;
          })}
        </nav>
        <div className="relative mx-4 mb-4 mt-3 shrink-0 rounded-3xl border border-white/10 bg-white/[0.08] p-3 shadow-inner shadow-white/5">
          <div className="flex items-center gap-3">
            <Avatar name={data.identity.userName} />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{data.identity.userName}</p><p className="text-xs text-white/45">{title(data.identity.role)}</p></div>
          </div>
          <form action="/api/v1/auth/logout" method="post" className="mt-3">
            <button className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white/12 px-3 py-3 text-sm font-bold text-white transition hover:bg-[#d6b35e] hover:text-[#17120b]"><LogOut size={16} /> Log out</button>
          </form>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 flex min-h-20 items-center justify-between border-b border-[#d8c9a4]/40 bg-[#fffaf0]/86 px-4 py-3 shadow-[0_10px_30px_rgba(45,34,20,.05)] backdrop-blur-xl sm:px-7">
          <div className="flex items-center gap-3">
            <button onClick={() => setMenuOpen(true)} className="grid size-11 place-items-center rounded-full border border-[#d8c9a4]/70 bg-white shadow-sm lg:hidden"><Menu size={20} /></button>
            <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9e7a2e]">{formatDate(new Date())}  -  {data.identity.branchCity}</p><h1 className="font-serif text-3xl font-semibold tracking-tight">{active}</h1></div>
          </div>
          <div className="flex items-center gap-2 max-sm:max-w-[54%]">
            <select
              aria-label="Workspace branch"
              value={selectedBranchId}
              onChange={async (event) => {
                const branchId = event.target.value;
                setSelectedBranchId(branchId);
                setBusy(true);
                try {
                  await refresh(undefined, branchId);
                } catch (refreshError) {
                  setError(refreshError instanceof Error ? refreshError.message : "Unable to change branch");
                } finally {
                  setBusy(false);
                }
              }}
              className="field max-w-52 rounded-full py-2.5 font-bold shadow-sm"
            >
              {data.identity.role === "OWNER" && <option value="all">All branches</option>}
              {data.identity.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
            <button onClick={() => refresh("Workspace refreshed from PostgreSQL.")} className="flex items-center gap-2 rounded-full border border-[#d8c9a4]/60 bg-white px-4 py-2.5 text-sm font-bold shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><RefreshCw size={16} /> <span className="hidden sm:inline">Refresh</span></button>
          </div>
        </header>

        <main className="p-4 sm:p-7">
          {notice && <Banner tone="success" text={notice} onClose={() => setNotice("")} />}
          {error && <Banner tone="error" text={error} onClose={() => setError("")} />}
          {detail.customerId ? <CustomerProfileView customerId={detail.customerId} data={data} submit={submit} close={closeDetail} openAppointment={(id) => openDetail("appointmentId", id)} />
            : detail.serviceId ? <ServiceProfileView serviceId={detail.serviceId} data={data} close={closeDetail} openAppointment={(id) => openDetail("appointmentId", id)} />
            : <>
          {active === "Overview" && <Overview data={data} navigate={navigate} openInvoice={openInvoiceCenter} openAppointment={openAppointment} openCustomer={() => setModal("customer")} />}
          {active === "Calendar" && <CalendarViewV2 data={data} open={openAppointment} submit={submit} openDetail={(id) => openDetail("appointmentId", id)} />}
          {active === "Customers" && <CustomersView data={data} open={() => setModal("customer")} submit={submit} openProfile={(id) => openDetail("customerId", id)} />}
          {active === "Point of sale" && <PosViewV2 data={data} submit={submit} openInvoice={openInvoiceCenter} />}
          {active === "Services" && <ServicesViewV2 data={data} open={() => setModal("service")} submit={submit} openProfile={(id) => openDetail("serviceId", id)} />}
          {active === "Inventory" && <InventoryView data={data} open={() => setModal("stock")} submit={submit} />}
          {active === "Team" && <TeamView data={data} openStaff={() => setModal("staff")} openLeave={() => setModal("leave")} submit={submit} />}
          {active === "Memberships" && <BenefitsView data={data} submit={submit} />}
          {active === "Marketing" && <MarketingView data={data} submit={submit} />}
          {active === "Reviews" && <ReviewsView data={data} submit={submit} />}
          {active === "Reports" && <ReportsView data={data} open={() => setModal("expense")} focusedInvoiceId={focusedInvoiceId} />}
          {active === "Settings" && <SettingsView data={data} />}
          </>}
        </main>
      </div>

      {modal && <OperationModal name={modal} data={data} busy={busy} error={error} bookingSeed={bookingSeed} close={() => { setModal(null); setError(""); }} submit={submit} />}
      {detail.appointmentId && <AppointmentDrawer appointmentId={detail.appointmentId} data={data} submit={submit} close={closeDetail} openCustomer={(id) => openDetail("customerId", id)} openService={(id) => openDetail("serviceId", id)} openSale={() => { closeDetail(); navigate("Point of sale"); }} />}
    </div>
  );
}

function Overview({ data, navigate, openInvoice, openAppointment, openCustomer }: { data: WorkspaceData; navigate: (item: NavItem) => void; openInvoice: (invoiceId?: string) => void; openAppointment: (seed?: BookingSeed | React.SyntheticEvent) => void; openCustomer: () => void }) {
  const metrics = [
    ["Today's revenue", inr.format(data.metrics.todayRevenue), "Money collected today", CircleDollarSign, "money"],
    ["Appointments", `${data.metrics.completedAppointments} / ${data.metrics.todayAppointments}`, "Completed vs booked", CalendarDays, "info"],
    ["Customers", String(data.metrics.customerCount), "Total salon profiles", Users, "rose"],
    ["Average ticket", inr.format(data.metrics.averageTicket), "Per paid invoice", CreditCard, "gold"],
  ] as const;
  return <div className="space-y-6">
    <div className="relative overflow-hidden rounded-[2.2rem] border border-[#d6b35e]/30 bg-[#0e0c09] p-6 text-white shadow-[0_24px_70px_rgba(25,18,9,.22)] sm:p-8">
      <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-[#d6b35e]/24 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-32 w-96 rounded-full bg-[#203a36]/70 blur-3xl" />
      <div className="relative flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
        <div>
          <p className="inline-flex rounded-full border border-[#d6b35e]/35 bg-[#d6b35e]/12 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-[#f4e6bd]">Daily command center</p>
          <h2 className="mt-5 font-serif text-4xl leading-tight sm:text-5xl">Good day, {data.identity.userName.split(" ")[0]}.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">{data.metrics.todayAppointments} appointments  -  {data.metrics.lowStockCount} low-stock items  -  {data.metrics.pendingAttendanceCorrections} attendance corrections need attention.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => openAppointment()} className="primary bg-[#d6b35e] text-white"><Plus size={15} />New appointment</button>
          <button onClick={() => navigate("Point of sale")} className="rounded-full border border-white/12 bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white hover:text-[#17120b]"><CreditCard size={15} className="mr-2 inline" />New sale</button>
          <button onClick={openCustomer} className="rounded-full border border-white/12 bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white hover:text-[#17120b]"><Users size={15} className="mr-2 inline" />Add customer</button>
          <button onClick={() => navigate("Inventory")} className="rounded-full border border-white/12 bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white hover:text-[#17120b]"><PackagePlus size={15} className="mr-2 inline" />Stock entry</button>
        </div>
      </div>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([label, value, helper, Icon, tone]) => <button key={label} onClick={() => navigate(label === "Customers" ? "Customers" : label === "Appointments" ? "Calendar" : "Reports")} className="surface-card group rounded-3xl p-5 text-left transition hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(45,34,20,.12)]"><div className={`grid size-11 place-items-center rounded-2xl ${metricTone(tone)}`}><Icon size={20} /></div><p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-[#9a8f82]">{label}</p><strong className="mt-1 block text-2xl tracking-tight">{value}</strong><span className="mt-2 block text-xs text-[#817970]">{helper}</span><span className="mt-4 inline-flex items-center gap-1 text-xs font-extrabold text-[#9e7a2e]">View details <ChevronRight size={14} className="transition group-hover:translate-x-0.5" /></span></button>)}</div>
    {canOpen(data.identity.role, "Team") && <button onClick={() => navigate("Team")} className="surface-card grid w-full gap-3 rounded-3xl p-5 text-left transition hover:-translate-y-0.5 hover:shadow-[0_18px_48px_rgba(45,34,20,.1)] sm:grid-cols-4"><Info label="Present today" value={String(data.metrics.staffPresent)} tone="green" /><Info label="Absent today" value={String(data.metrics.staffAbsent)} tone={data.metrics.staffAbsent ? "rose" : "green"} /><Info label="Late clock-ins" value={String(data.metrics.staffLate)} tone={data.metrics.staffLate ? "amber" : "green"} /><Info label="Pending corrections" value={String(data.metrics.pendingAttendanceCorrections)} tone={data.metrics.pendingAttendanceCorrections ? "violet" : "green"} /></button>}
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Revenue trend"><MiniBars items={data.trends.revenue} money /></Card>
      <Card title="Appointment mix"><MiniBars items={data.trends.appointmentStatus} /></Card>
      <Card title="Booking sources"><MiniBars items={data.trends.bookingSource} /></Card>
      <Card title="Top services"><MiniBars items={data.trends.topServices} /></Card>
    </div>
    <Card title="Today's appointments" action={<button onClick={() => navigate("Calendar")} className="text-sm font-bold text-[#9e5d55]">Open calendar</button>}><AppointmentTable data={data} compact /></Card>
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Stock attention">{data.inventory.filter((item) => item.quantity <= item.reorderLevel).length ? data.inventory.filter((item) => item.quantity <= item.reorderLevel).map((item) => <Row key={item.id} primary={item.name} secondary={`${item.quantity} ${item.unit} on hand`} value="Low stock" />) : <Empty text="No low-stock items." />}</Card>
      <Card title="Recent invoices" action={<button type="button" onClick={() => openInvoice()} className="text-sm font-bold text-[#9e7a2e]">Open invoice center</button>}>{data.recentInvoices.length ? data.recentInvoices.slice(0, 5).map((invoice) => <Row key={invoice.id} primary={invoice.number} secondary={`${invoice.customer} | Click to open invoice`} value={inr.format(invoice.total)} onClick={() => openInvoice(invoice.id)} />) : <Empty text="No invoices recorded yet." />}</Card>
    </div>
  </div>;
}

function CalendarViewV2({ data, open, submit, openDetail }: { data: WorkspaceData; open: (seed?: BookingSeed | React.SyntheticEvent) => void; submit: SubmitFn; openDetail: (id: string) => void }) {
  const [items, setItems] = useState(data.appointments);
  const [date, setDate] = useState(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()));
  const [view, setView] = useState<"day" | "week">("day");
  const [layout, setLayout] = useState<"timeline" | "agenda">("timeline");
  const [staffId, setStaffId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams({ branchId: data.identity.branchId || "all", date, view });
    if (staffId) params.set("staffId", staffId);
    if (statusFilter) params.set("status", statusFilter);
    if (sourceFilter) params.set("source", sourceFilter);
    queueMicrotask(() => {
      setLoading(true);
      setLoadError("");
    });
    fetch(`/api/v1/operations/appointments?${params}`, { cache: "no-store" })
      .then(async (response) => ({ response, result: await response.json() }))
      .then(({ response, result }) => {
        if (!response.ok) throw new Error(result.error?.message || "Unable to load appointments");
        setItems(result.data);
      })
      .catch((requestError) => setLoadError(requestError instanceof Error ? requestError.message : "Unable to load appointments"))
      .finally(() => setLoading(false));
  }, [data.identity.branchId, date, view, staffId, statusFilter, sourceFilter, data.appointments]);

  async function status(id: string, branchId: string, value: string) {
    const cancellationReason = ["CANCELLED", "NO_SHOW"].includes(value) ? window.prompt(`Reason for ${title(value).toLowerCase()}:`)?.trim() : undefined;
    if (["CANCELLED", "NO_SHOW"].includes(value) && !cancellationReason) return;
    await submit(`/api/v1/operations/appointments/${id}`, { branchId, status: value, cancellationReason, idempotencyKey: `status-${id}-${value}-${Date.now()}` }, `Appointment moved to ${title(value)}.`, "PATCH");
  }

  async function moveAppointment(appointmentId: string, targetStaffId: string | null, startsAt: string) {
    const item = items.find((appointment) => appointment.id === appointmentId);
    if (!item) return;
    const result = await submit(`/api/v1/operations/appointments/${item.id}`, {
      branchId: item.branchId,
      startsAt,
      staffId: targetStaffId,
      idempotencyKey: `calendar-move-${item.id}-${crypto.randomUUID()}`,
    }, "Appointment rescheduled.", "PATCH");
    if (result.ok) return;
  }

  const branch = data.identity.branches.find((item) => item.id === data.identity.branchId);
  const dayOfWeek = new Date(`${date}T12:00:00+05:30`).getUTCDay();
  const hours = branch?.operatingHours.find((item) => item.dayOfWeek === dayOfWeek);
  const openMinutes = hours ? timeToMinutes(hours.opensAt) : 9 * 60;
  const closeMinutes = hours ? timeToMinutes(hours.closesAt) : 20 * 60;
  const timelineHeight = Math.max(120, (closeMinutes - openMinutes) * 1.2);
  const visibleStaff = data.staff.filter((member) => (!staffId || member.id === staffId) && (!branch || member.branchIds.includes(branch.id)));
  const columns = [{ id: "", name: "Unassigned", role: "Needs assignment" }, ...visibleStaff];
  const allBranchAgenda = data.identity.scope === "all";
  const effectiveLayout = allBranchAgenda || view === "week" ? "agenda" : layout;

  function timelinePoint(clientY: number, element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    const raw = openMinutes + ((clientY - rect.top) / rect.height) * (closeMinutes - openMinutes);
    const rounded = Math.max(openMinutes, Math.min(closeMinutes - 15, Math.round(raw / 15) * 15));
    return new Date(`${date}T${minutesToTime(rounded)}:00+05:30`).toISOString();
  }

  return <div className="space-y-5">
    <Card title="Appointments" action={<button onClick={() => open()} className="primary"><Plus size={15} /> New appointment</button>}>
      <div className="mb-5 grid gap-2 md:grid-cols-7">
        <input className="field" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        <select className="field" value={view} onChange={(event) => setView(event.target.value as "day" | "week")}><option value="day">Day</option><option value="week">Week</option></select>
        <select className="field" disabled={allBranchAgenda || view === "week"} value={effectiveLayout} onChange={(event) => setLayout(event.target.value as "timeline" | "agenda")}><option value="timeline">Timeline</option><option value="agenda">Agenda</option></select>
        <select className="field" value={staffId} onChange={(event) => setStaffId(event.target.value)}><option value="">All professionals</option>{data.staff.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select className="field" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option>{["CONFIRMED", "CHECKED_IN", "IN_SERVICE", "COMPLETED", "CANCELLED", "NO_SHOW", "WAITLISTED"].map((item) => <option key={item} value={item}>{title(item)}</option>)}</select>
        <select className="field" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="">All origins</option>{["MARKETPLACE", "SALON_WEBSITE", "PHONE", "WALK_IN", "STAFF_CREATED"].map((item) => <option key={item} value={item}>{title(item)}</option>)}</select>
        <div className="rounded-xl bg-[#f5f2ed] px-4 py-3 text-sm font-bold">{loading ? "Loading..." : `${items.length} bookings`}</div>
      </div>
      {loadError ? <SlotMessage text={loadError} error /> : loading ? <SlotMessage text="Loading appointments..." loading /> : effectiveLayout === "agenda" ? (
        allBranchAgenda
          ? <div className="space-y-5">{data.identity.branches.map((agendaBranch) => <section key={agendaBranch.id}><h3 className="mb-2 font-serif text-xl font-bold">{agendaBranch.name}</h3><AppointmentTable data={{ ...data, appointments: items.filter((item) => item.branchId === agendaBranch.id) }} onStatus={status} onOpen={(item) => openDetail(item.id)} /></section>)}</div>
          : <AppointmentTable data={{ ...data, appointments: items }} onStatus={status} onOpen={(item) => openDetail(item.id)} />
      ) : hours?.isClosed ? <SlotMessage text="This branch is closed on the selected day." /> : !hours || !branch ? <SlotMessage text="Operating hours are not configured for this day." error /> : (
        <div className="overflow-x-auto"><div className="min-w-[960px]">
          <div className="grid border-b border-black/8" style={{ gridTemplateColumns: `80px repeat(${columns.length}, minmax(180px, 1fr))` }}><div />{columns.map((member) => <div key={member.id || "unassigned"} className="border-l border-black/6 p-3 text-center text-sm font-bold">{member.name}<span className="block text-xs font-normal text-[#817970]">{member.role}</span></div>)}</div>
          <div className="grid" style={{ gridTemplateColumns: `80px repeat(${columns.length}, minmax(180px, 1fr))` }}>
            <div className="relative" style={{ height: timelineHeight }}>{Array.from({ length: Math.ceil((closeMinutes - openMinutes) / 60) + 1 }, (_, index) => openMinutes + index * 60).map((minute) => <span key={minute} className="absolute right-3 text-xs font-bold text-[#817970]" style={{ top: (minute - openMinutes) * 1.2 - 7 }}>{formatClockMinute(minute)}</span>)}</div>
            {columns.map((member) => <div key={member.id || "unassigned"} className="relative border-l border-black/6 bg-[linear-gradient(to_bottom,transparent_71px,rgba(0,0,0,.06)_72px)] bg-[length:100%_72px]" style={{ height: timelineHeight }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => void moveAppointment(event.dataTransfer.getData("text/appointment"), member.id || null, timelinePoint(event.clientY, event.currentTarget))} onDoubleClick={(event) => open({ branchId: branch.id, date, startsAt: timelinePoint(event.clientY, event.currentTarget), staffId: member.id || undefined })}>
              {items.filter((item) => (item.staffId || "") === member.id).map((item) => {
                const start = minutesInIndia(item.startsAt);
                const duration = Math.max(15, (new Date(item.endsAt).getTime() - new Date(item.startsAt).getTime()) / 60_000);
                return <button type="button" draggable onDragStart={(event) => event.dataTransfer.setData("text/appointment", item.id)} onClick={() => openDetail(item.id)} key={item.id} className={`absolute inset-x-1 overflow-hidden rounded-xl border-l-4 p-2 text-left text-xs shadow-sm transition hover:brightness-[.98] hover:shadow-md ${appointmentCardStyle(item.status)}`} style={{ top: Math.max(0, start - openMinutes) * 1.2, height: Math.max(34, duration * 1.2) }}><span className="flex items-center gap-1 font-bold"><GripVertical size={12} />{formatTime(item.startsAt)}  -  {item.customer}</span><span className="mt-1 block truncate opacity-75">{item.serviceLines.length > 1 ? `${item.serviceLines.length} services` : item.service}</span><Source value={item.source} /></button>;
              })}
            </div>)}
          </div>
          {!items.length && <Empty text="No appointments for this day. Double-click a slot to create one." />}
        </div></div>
      )}
    </Card>
  </div>;
}

function AppointmentTable({ data, compact, onStatus, onOpen }: { data: WorkspaceData; compact?: boolean; onStatus?: (id: string, branchId: string, value: string) => void; onOpen?: (item: WorkspaceData["appointments"][number]) => void }) {
  const items = compact ? data.appointments.slice(0, 5) : data.appointments;
  return <div className="overflow-x-auto"><table className="w-full min-w-[940px] text-left text-sm"><thead className="text-xs uppercase tracking-wider text-[#958d85]"><tr><th className="pb-3">Time</th><th className="pb-3">Branch</th><th className="pb-3">Customer</th><th className="pb-3">Service</th><th className="pb-3">Professional</th><th className="pb-3">Origin</th><th className="pb-3">Status</th>{onStatus && <th className="pb-3">Action</th>}</tr></thead><tbody>{items.map((item) => <tr key={item.id} onClick={() => onOpen?.(item)} className={`border-t border-black/5 ${onOpen ? "cursor-pointer hover:bg-[#faf7f3]" : ""}`}><td className="py-4 font-bold">{formatTime(item.startsAt)}</td><td className="py-4">{item.branchName}</td><td className="py-4">{item.customer}</td><td className="py-4">{item.service}</td><td className="py-4">{item.staff}</td><td className="py-4"><Source value={item.source} /></td><td className="py-4"><Status value={item.status} /></td>{onStatus && <td className="py-4" onClick={(event) => event.stopPropagation()}><select value="" onChange={(event) => event.target.value && onStatus(item.id, item.branchId, event.target.value)} className="rounded-lg border border-black/10 px-2 py-1.5"><option value="">Update</option>{nextStatuses(item.status).map((value) => <option key={value} value={value}>{title(value)}</option>)}</select></td>}</tr>)}</tbody></table>{!items.length && <Empty text="No appointments for this period." />}</div>;
}

function CustomersView({ data, open, submit, openProfile }: { data: WorkspaceData; open: () => void; submit: SubmitFn; openProfile: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<WorkspaceData["customers"][number] | null>(null);
  const customers = data.customers.filter((customer) => `${customer.name} ${customer.phone} ${customer.email || ""} ${customer.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    await submit(`/api/v1/operations/customers/${selected.id}`, {
      name: form.get("name"),
      email: form.get("email") || null,
      birthday: form.get("birthday") ? new Date(String(form.get("birthday"))).toISOString() : null,
      notes: form.get("notes") || null,
      allergies: form.get("allergies") || null,
      tags: String(form.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean),
      whatsappConsent: form.get("whatsappConsent") === "on",
      smsConsent: form.get("smsConsent") === "on",
      emailConsent: form.get("emailConsent") === "on",
    }, "Customer profile updated.", "PATCH");
  }
  async function adjustLoyalty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    await submit(`/api/v1/operations/customers/${selected.id}`, {
      loyaltyAdjustment: Number(form.get("points")),
      loyaltyReason: form.get("reason"),
    }, "Loyalty balance adjusted.", "PATCH");
  }
  return <div className="grid gap-5 xl:grid-cols-[1fr_420px]"><Card title="Customer directory" action={<button onClick={open} className="primary"><Plus size={15} /> Add customer</button>}><label className="mb-5 flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent py-3 text-sm outline-none" placeholder="Search name, phone, email, or tag" /></label><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="text-xs uppercase tracking-wider text-[#958d85]"><tr><th className="pb-3">Customer</th><th className="pb-3">Phone</th><th className="pb-3">Visits</th><th className="pb-3">Spend</th><th className="pb-3">Loyalty</th></tr></thead><tbody>{customers.map((customer) => <tr key={customer.id} onClick={() => setSelected(customer)} className={`cursor-pointer border-t border-black/5 hover:bg-[#faf7f3] ${selected?.id === customer.id ? "bg-[#f4eee8]" : ""}`}><td className="py-4 font-bold">{customer.name}<span className="mt-1 block text-xs font-normal text-[#817970]">{customer.tags.join("  -  ")}</span></td><td className="py-4">{customer.phone}</td><td className="py-4">{customer.visits}</td><td className="py-4">{inr.format(customer.spend)}</td><td className="py-4">{customer.loyalty} pts</td></tr>)}</tbody></table>{!customers.length && <Empty text="No matching customers." />}</div></Card><div>{selected ? <div className="space-y-5"><Card title={selected.name}><div className="grid grid-cols-2 gap-3"><Info label="Lifetime visits" value={String(selected.visits)} /><Info label="Lifetime spend" value={inr.format(selected.spend)} /><Info label="Loyalty" value={`${selected.loyalty} points`} /><Info label="Phone" value={selected.phone} /></div><button type="button" onClick={() => openProfile(selected.id)} className="primary mt-5 w-full justify-center">View complete history <ChevronRight size={15} /></button><form onSubmit={save} className="mt-5 space-y-3"><Field name="name" label="Name" defaultValue={selected.name} /><Field name="email" label="Email" type="email" defaultValue={selected.email || ""} required={false} /><Field name="birthday" label="Birthday" type="date" defaultValue={selected.birthday?.slice(0, 10) || ""} required={false} /><Field name="allergies" label="Allergies and sensitivities" defaultValue={selected.allergies || ""} required={false} /><Field name="tags" label="Tags, comma separated" defaultValue={selected.tags.join(", ")} required={false} /><Field name="notes" label="Notes and preferences" defaultValue={selected.notes || ""} required={false} /><div className="grid gap-2 text-sm"><label><input type="checkbox" name="whatsappConsent" defaultChecked={selected.whatsappConsent} /> WhatsApp consent</label><label><input type="checkbox" name="smsConsent" defaultChecked={selected.smsConsent} /> SMS consent</label><label><input type="checkbox" name="emailConsent" defaultChecked={selected.emailConsent} /> Email consent</label></div><button className="primary w-full justify-center">Save profile</button></form></Card><Card title="Loyalty adjustment"><form onSubmit={adjustLoyalty} className="space-y-3"><Field name="points" label="Points, use minus to deduct" type="number" /><Field name="reason" label="Reason" /><button className="w-full rounded-xl border border-[#203a36] px-4 py-2 text-sm font-bold">Adjust points</button></form></Card></div> : <div className="rounded-3xl bg-white p-8 text-center text-sm text-[#817970]"><Users className="mx-auto mb-4" />Select a customer to open the complete profile.</div>}</div></div>;
}

type CartLine = { type: "SERVICE" | "PRODUCT"; itemId: string; name: string; price: number; taxRate: number; quantity: number; discount: number; staffId?: string; packagePurchaseId?: string };
type InvoiceListData = {
  invoices: Array<{
    id: string;
    number: string;
    customer: { id: string; name: string; phone: string };
    branch: { id: string; name: string };
    type: string;
    status: string;
    taxMode: string;
    subtotal: number;
    discount: number;
    tax: number;
    tip: number;
    total: number;
    paid: number;
    outstanding: number;
    createdAt: string;
    payments: Array<{ method: string; amount: number; reference: string | null }>;
    lineCount: number;
  }>;
  summary: { count: number; subtotal: number; discount: number; tax: number; total: number; paid: number; outstanding: number };
  pagination: { page: number; pageSize: number; total: number };
};
type InvoiceDetail = {
  id: string;
  number: string;
  branch: { id: string; name: string; city?: string | null };
  customer: { id: string; name: string; phone: string; email: string | null };
  appointment: { id: string; startsAt: string; status: string } | null;
  type: string;
  status: string;
  taxMode: string;
  subtotal: number;
  discount: number;
  tax: number;
  tip: number;
  total: number;
  paid: number;
  outstanding: number;
  voidReason: string | null;
  createdAt: string;
  lines: Array<{ id: string; type: string; description: string; quantity: number; unitPrice: number; discount: number; taxRate: number; tax: number; total: number; staff: string | null }>;
  payments: Array<{ id: string; method: string; amount: number; reference: string | null; createdAt: string }>;
  benefits: Array<{ id: string; kind: string; sourceType: string; sourceId: string | null; amount: number | null; points: number | null; note: string | null; createdAt: string }>;
  refunds: Array<{ id: string; number: string; total: number; createdAt: string }>;
};
type AttendanceData = {
  date: string;
  branch: { id: string; name: string };
  rows: Array<{
    staffId: string;
    name: string;
    role: string;
    state: string;
    shift: { id: string; startsAt: string; endsAt: string; type: string } | null;
    firstClockIn: string | null;
    lastClockOut: string | null;
    openAttendanceId: string | null;
    workedMinutes: number;
    expectedMinutes: number;
    varianceMinutes: number;
    lateMinutes: number;
    pendingCorrections: number;
    onLeave: boolean;
    entries: Array<{ id: string; clockIn: string; clockOut: string | null; status: string; source: string; note: string | null }>;
  }>;
};
type PayrollData = {
  dateFrom: string;
  dateTo: string;
  rows: Array<{
    staffId: string;
    name: string;
    role: string;
    workedMinutes: number;
    expectedMinutes: number;
    varianceMinutes: number;
    appointmentsServed: number;
    serviceRevenue: number;
    productRevenue: number;
    serviceCommissions: number;
    productCommissions: number;
    tips: number;
    payableInput: number;
  }>;
  summary: { workedMinutes: number; expectedMinutes: number; appointmentsServed: number; serviceCommissions: number; productCommissions: number; tips: number; payableInput: number };
};

function ServicesView({ data, open, submit, openProfile }: { data: WorkspaceData; open: () => void; submit: SubmitFn; openProfile: (id: string) => void }) {
  async function saveOverride(event: FormEvent<HTMLFormElement>, serviceId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await submit("/api/v1/operations/services/" + serviceId, {
      price: Number(form.get("price")),
      durationMinutes: Number(form.get("durationMinutes")),
      taxRate: Number(form.get("taxRate")),
      isActive: form.get("isActive") === "on",
      onlineBooking: form.get("onlineBooking") === "on",
      bufferBefore: Number(form.get("bufferBefore")),
      bufferAfter: Number(form.get("bufferAfter")),
      sortOrder: Number(form.get("sortOrder")),
    }, "Branch service settings updated.", "PATCH");
  }
  return <Card title="Services and pricing" action={<button onClick={open} className="primary"><Plus size={15} /> New service</button>}>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {data.services.map((service) => (
        <form onSubmit={(event) => saveOverride(event, service.id)} key={service.id} className="rounded-2xl border border-black/8 p-5">
          <span className="rounded-full bg-[#f1e7e2] px-3 py-1 text-xs font-bold text-[#9e5d55]">{service.category}</span>
          <div className="mt-5 flex items-start justify-between gap-3">
            <h3 className="font-serif text-xl font-bold">{service.name}</h3>
            <button type="button" onClick={() => openProfile(service.id)} className="text-xs font-bold text-[#9e5d55]">View profile</button>
          </div>
          <p className="mt-2 text-xs text-[#847c74]">Master: {service.masterDurationMinutes} minutes | {inr.format(service.masterPrice)}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <ServiceSettingField label="Branch price" hint="Before GST" name="price" type="number" step="0.01" defaultValue={service.price} />
            <ServiceSettingField label="Duration" hint="Minutes" name="durationMinutes" type="number" defaultValue={service.durationMinutes} />
            <ServiceSettingField label="GST rate" hint="Percent" name="taxRate" type="number" step="0.01" defaultValue={service.taxRate} />
            <ServiceSettingField label="Sort order" hint="Display order" name="sortOrder" type="number" defaultValue={service.sortOrder} />
            <ServiceSettingField label="Buffer before" hint="Minutes" name="bufferBefore" type="number" defaultValue={service.bufferBefore} />
            <ServiceSettingField label="Buffer after" hint="Minutes" name="bufferAfter" type="number" defaultValue={service.bufferAfter} />
            <label className="flex items-center gap-2 rounded-xl bg-[#f5f2ed] px-3 py-2 text-sm font-bold"><input name="isActive" type="checkbox" defaultChecked={service.isActive} /> Active</label>
            <label className="flex items-center gap-2 rounded-xl bg-[#f5f2ed] px-3 py-2 text-sm font-bold"><input name="onlineBooking" type="checkbox" defaultChecked={service.onlineBooking} /> Online booking</label>
          </div>
          <button className="mt-4 w-full rounded-xl border border-[#203a36] px-4 py-2 text-sm font-bold text-[#203a36]">Save service settings</button>
        </form>
      ))}
    </div>
  </Card>;
}

function ServiceSettingField({ label, hint, name, type, step, defaultValue }: { label: string; hint: string; name: string; type: string; step?: string; defaultValue: number }) {
  return <label className="rounded-xl border border-black/10 bg-white px-3 py-2">
    <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-[#9e5d55]">{label}</span>
    <input className="mt-1 w-full bg-transparent text-sm font-semibold outline-none" aria-label={label} name={name} type={type} step={step} defaultValue={defaultValue} />
    <span className="mt-0.5 block text-[10px] font-semibold text-[#8b8178]">{hint}</span>
  </label>;
}

function ServicesViewV2({ data, open, submit, openProfile }: { data: WorkspaceData; open: () => void; submit: SubmitFn; openProfile: (id: string) => void }) {
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; color: string | null }>>([]);
  const branchId = data.identity.branchId;
  useEffect(() => {
    if (!branchId) return;
    fetch(`/api/v1/operations/service-categories?branchId=${encodeURIComponent(branchId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((result) => setTemplates(result.data?.templates || []))
      .catch(() => setTemplates([]));
  }, [branchId, data.serviceCategories]);
  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await submit("/api/v1/operations/service-categories", {
      name: form.get("name"),
      color: form.get("color"),
      sortOrder: data.serviceCategories.length,
    }, "Service category created.", "POST", false);
    if (result.ok) event.currentTarget.reset();
  }
  return <div className="space-y-5">
    <Card title="Service category master">
      {templates.length > 0 && <div className="mb-5 rounded-2xl bg-[#f5f2ed] p-4"><p className="text-sm font-bold">{brandName} starter templates</p><div className="mt-3 flex flex-wrap gap-2">{templates.filter((template) => !data.serviceCategories.some((category) => category.name.toLowerCase() === template.name.toLowerCase())).map((template) => <button key={template.id} onClick={() => void submit("/api/v1/operations/service-categories", { templateIds: [template.id] }, `${template.name} copied to your catalogue.`, "POST", false)} className="rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-bold"><Plus size={13} className="mr-1 inline" />{template.name}</button>)}</div></div>}
      <form onSubmit={createCategory} className="mb-5 grid gap-2 sm:grid-cols-[1fr_120px_auto]"><input className="field" name="name" required placeholder="New category name" /><input className="field h-12" name="color" type="color" defaultValue="#d19a85" /><button className="primary justify-center">Add category</button></form>
      <div className="flex flex-wrap gap-2">{data.serviceCategories.map((category) => <div key={category.id} className={`flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-bold ${category.isActive ? "bg-white" : "opacity-50"}`}><span className="size-3 rounded-full" style={{ backgroundColor: category.color || "#d19a85" }} />{category.name}<button onClick={() => void submit(`/api/v1/operations/service-categories/${category.id}`, { isActive: !category.isActive }, category.isActive ? "Category archived." : "Category restored.", "PATCH", false)} className="text-xs text-[#9e5d55]">{category.isActive ? "Archive" : "Restore"}</button></div>)}</div>
    </Card>
    <ServicesView data={data} open={open} submit={submit} openProfile={openProfile} />
  </div>;
}

function InventoryView({ data, open, submit }: { data: WorkspaceData; open: () => void; submit: SubmitFn }) {
  const [tab, setTab] = useState<"products" | "purchase" | "transfer" | "stocktake" | "recipes">("products");
  const branchId = data.identity.branchId || "";
  const lowStock = data.inventory.filter((item) => item.quantity <= item.reorderLevel);

  async function createVendor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await submit("/api/v1/operations/inventory/vendors", {
      name: form.get("name"),
      phone: form.get("phone") || undefined,
      email: form.get("email") || undefined,
      gstin: form.get("gstin") || undefined,
      notes: form.get("notes") || undefined,
    }, "Vendor saved.", "POST", false);
    if (result.ok) event.currentTarget.reset();
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await submit("/api/v1/operations/inventory/products", {
      name: form.get("name"),
      sku: form.get("sku"),
      category: form.get("category"),
      unit: form.get("unit"),
      retailPrice: Number(form.get("retailPrice")),
      costPrice: Number(form.get("costPrice")),
      reorderLevel: Number(form.get("reorderLevel")),
      openingQuantity: Number(form.get("openingQuantity") || 0),
      vendorId: form.get("vendorId") || undefined,
      idempotencyKey: `product-${crypto.randomUUID()}`,
    }, "Product created.", "POST", false);
    if (result.ok) event.currentTarget.reset();
  }

  async function recordPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await submit("/api/v1/operations/inventory/purchases", {
      vendorId: form.get("vendorId") || undefined,
      invoiceNumber: form.get("invoiceNumber") || undefined,
      purchasedAt: new Date(String(form.get("purchasedAt"))).toISOString(),
      note: form.get("note") || undefined,
      lines: [{
        inventoryItemId: form.get("inventoryItemId"),
        quantity: Number(form.get("quantity")),
        unitCost: Number(form.get("unitCost")),
        taxRate: Number(form.get("taxRate") || 18),
      }],
      idempotencyKey: `purchase-${crypto.randomUUID()}`,
    }, "Purchase stock added.", "POST", false);
    if (result.ok) event.currentTarget.reset();
  }

  async function transferStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await submit("/api/v1/operations/inventory/transfers", {
      toBranchId: form.get("toBranchId"),
      inventoryItemId: form.get("inventoryItemId"),
      quantity: Number(form.get("quantity")),
      note: form.get("note") || undefined,
      idempotencyKey: `transfer-${crypto.randomUUID()}`,
    }, "Stock transferred.", "POST", false);
    if (result.ok) event.currentTarget.reset();
  }

  async function recordStocktake(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await submit("/api/v1/operations/inventory/stocktakes", {
      countedAt: new Date(String(form.get("countedAt"))).toISOString(),
      note: form.get("note") || undefined,
      lines: [{ inventoryItemId: form.get("inventoryItemId"), countedQty: Number(form.get("countedQty")) }],
      idempotencyKey: `stocktake-${crypto.randomUUID()}`,
    }, "Stocktake saved and variance adjusted.", "POST", false);
    if (result.ok) event.currentTarget.reset();
  }

  async function saveRecipe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await submit("/api/v1/operations/inventory/recipes", {
      serviceId: form.get("serviceId"),
      inventoryItemId: form.get("inventoryItemId"),
      quantity: Number(form.get("quantity")),
    }, "Service consumption recipe saved.", "POST", false);
    if (result.ok) event.currentTarget.reset();
  }

  if (!branchId) return <Card title="Inventory"><SlotMessage text="Select a specific branch before changing inventory." /></Card>;
  return <div className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Info label="Products" value={String(data.inventory.length)} tone="blue" />
      <Info label="Stock value" value={inr.format(data.inventory.reduce((sum, item) => sum + item.stockValue, 0))} tone="green" />
      <Info label="Low stock" value={String(lowStock.length)} tone={lowStock.length ? "amber" : "green"} />
      <Info label="Vendors" value={String(data.vendors.length)} tone="violet" />
    </div>
    <Card title="Inventory operations" action={<button onClick={open} className="primary"><PackagePlus size={15} /> Quick movement</button>}>
      <div className="mb-5 flex flex-wrap gap-2">{(["products", "purchase", "transfer", "stocktake", "recipes"] as const).map((value) => <button key={value} type="button" onClick={() => setTab(value)} className={`rounded-full px-4 py-2 text-sm font-bold ${tab === value ? "bg-[#203a36] text-white" : "bg-[#f5f2ed] text-[#615a52]"}`}>{title(value)}</button>)}</div>
      {tab === "products" && <div className="grid gap-5 xl:grid-cols-[1fr_360px]"><div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead className="text-xs uppercase tracking-wider text-[#958d85]"><tr><th className="pb-3">Product</th><th className="pb-3">SKU</th><th className="pb-3">On hand</th><th className="pb-3">Value</th><th className="pb-3">Status</th></tr></thead><tbody>{data.inventory.map((item) => <tr key={item.id} className="border-t border-black/5"><td className="py-4"><strong>{item.name}</strong><p className="text-xs text-[#817970]">{item.category}  -  {item.unit}</p></td><td className="py-4">{item.sku}</td><td className="py-4">{item.quantity} {item.unit}</td><td className="py-4">{inr.format(item.stockValue)}</td><td className="py-4"><Status value={item.quantity <= item.reorderLevel ? "LOW_STOCK" : "HEALTHY"} /></td></tr>)}</tbody></table>{!data.inventory.length && <Empty text="No products created yet." />}</div><div className="space-y-5"><form onSubmit={createProduct} className="rounded-2xl bg-[#f8f4ef] p-4"><h3 className="font-bold">Add product</h3><div className="mt-3 grid gap-3"><Field name="name" label="Product name" /><Field name="sku" label="SKU / barcode" /><Field name="category" label="Category" /><Field name="unit" label="Unit" defaultValue="pcs" /><Field name="retailPrice" label="Retail price" type="number" /><Field name="costPrice" label="Cost price" type="number" /><Field name="reorderLevel" label="Low-stock level" type="number" /><Field name="openingQuantity" label="Opening stock" type="number" defaultValue="0" required={false} /><Select name="vendorId" label="Vendor, optional" required={false} options={data.vendors.map((vendor) => [vendor.id, vendor.name])} /><button className="primary justify-center">Create product</button></div></form><form onSubmit={createVendor} className="rounded-2xl bg-[#eef6f1] p-4"><h3 className="font-bold">Add vendor</h3><div className="mt-3 grid gap-3"><Field name="name" label="Vendor name" /><Field name="phone" label="Phone" required={false} /><Field name="email" label="Email" type="email" required={false} /><Field name="gstin" label="GSTIN" required={false} /><Field name="notes" label="Notes" required={false} /><button className="rounded-full bg-[#315b4c] px-4 py-3 text-sm font-bold text-white">Save vendor</button></div></form></div></div>}
      {tab === "purchase" && <div className="grid gap-5 xl:grid-cols-[380px_1fr]"><form onSubmit={recordPurchase} className="rounded-2xl bg-[#fff8ec] p-4"><h3 className="font-bold">Record purchase</h3><div className="mt-3 grid gap-3"><Select name="vendorId" label="Vendor, optional" required={false} options={data.vendors.map((vendor) => [vendor.id, vendor.name])} /><Field name="invoiceNumber" label="Supplier invoice no." required={false} /><Field name="purchasedAt" label="Purchase date" type="datetime-local" /><Select name="inventoryItemId" label="Product" options={data.inventory.map((item) => [item.id, item.name])} /><Field name="quantity" label="Quantity" type="number" /><Field name="unitCost" label="Unit cost" type="number" /><Field name="taxRate" label="GST rate" type="number" defaultValue="18" /><Field name="note" label="Note" required={false} /><button className="primary justify-center">Add purchase stock</button></div></form><div><h3 className="mb-3 font-bold">Recent purchase entries</h3>{data.purchaseEntries.length ? data.purchaseEntries.map((purchase) => <Row key={purchase.id} primary={purchase.invoiceNumber || "Purchase entry"} secondary={`${purchase.vendor || "No vendor"}  -  ${formatDate(new Date(purchase.purchasedAt))}  -  ${purchase.lines} line(s)`} value={inr.format(purchase.total)} />) : <Empty text="No purchase entries yet." />}</div></div>}
      {tab === "transfer" && <div className="grid gap-5 xl:grid-cols-[380px_1fr]"><form onSubmit={transferStock} className="rounded-2xl bg-[#f3f7ff] p-4"><h3 className="font-bold">Branch transfer</h3><div className="mt-3 grid gap-3"><Select name="toBranchId" label="Send to branch" options={data.identity.branches.filter((branch) => branch.id !== branchId).map((branch) => [branch.id, branch.name])} /><Select name="inventoryItemId" label="Product" options={data.inventory.map((item) => [item.id, item.name])} /><Field name="quantity" label="Quantity" type="number" /><Field name="note" label="Note" required={false} /><button className="primary justify-center">Transfer stock</button></div></form><SlotMessage text="Transfers create stock-out and stock-in movements and are blocked if the source branch has insufficient stock." /></div>}
      {tab === "stocktake" && <div className="grid gap-5 xl:grid-cols-[380px_1fr]"><form onSubmit={recordStocktake} className="rounded-2xl bg-[#f8f4ef] p-4"><h3 className="font-bold">Stocktake count</h3><div className="mt-3 grid gap-3"><Field name="countedAt" label="Counted at" type="datetime-local" /><Select name="inventoryItemId" label="Product" options={data.inventory.map((item) => [item.id, `${item.name} (${item.quantity} ${item.unit})`])} /><Field name="countedQty" label="Counted quantity" type="number" /><Field name="note" label="Reason / note" required={false} /><button className="primary justify-center">Save count</button></div></form><div><h3 className="mb-3 font-bold">Recent stock movements</h3>{data.stockMovements.length ? data.stockMovements.slice(0, 12).map((movement) => <Row key={movement.id} primary={`${title(movement.type)}  -  ${movement.product}`} secondary={`${formatDateTime(movement.createdAt)}${movement.reference ? `  -  ${movement.reference}` : ""}`} value={`${movement.quantity > 0 ? "+" : ""}${movement.quantity}`} />) : <Empty text="No stock movements yet." />}</div></div>}
      {tab === "recipes" && <div className="grid gap-5 xl:grid-cols-[380px_1fr]"><form onSubmit={saveRecipe} className="rounded-2xl bg-[#eef6f1] p-4"><h3 className="font-bold">Service consumption</h3><p className="mt-1 text-xs text-[#817970]">When this service is sold, the selected product quantity will be deducted automatically.</p><div className="mt-3 grid gap-3"><Select name="serviceId" label="Service" options={data.services.map((item) => [item.id, item.name])} /><Select name="inventoryItemId" label="Product consumed" options={data.inventory.map((item) => [item.id, item.name])} /><Field name="quantity" label="Quantity per service" type="number" /><button className="primary justify-center">Save recipe</button></div></form><SlotMessage text="Recipes are applied during POS checkout after stock is rechecked. If required products are unavailable, checkout is stopped." /></div>}
    </Card>
  </div>;
}

function TeamView({ data, openStaff, openLeave, submit }: { data: WorkspaceData; openStaff: () => void; openLeave: () => void; submit: SubmitFn }) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const [tab, setTab] = useState<"directory" | "attendance" | "shifts" | "payroll">("directory");
  const [shiftDate, setShiftDate] = useState(today);
  const [attendanceDate, setAttendanceDate] = useState(today);
  const [attendance, setAttendance] = useState<AttendanceData | null>(null);
  const [payroll, setPayroll] = useState<PayrollData | null>(null);
  const [payrollFrom, setPayrollFrom] = useState(today.slice(0, 8) + "01");
  const [payrollTo, setPayrollTo] = useState(today);
  const [staffFilter, setStaffFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState("");
  const branchId = data.identity.branchId || "";
  const canManageStaff = ["OWNER", "MANAGER"].includes(data.identity.role);
  const teamTabs = canManageStaff ? (["directory", "attendance", "shifts", "payroll"] as const) : (["directory", "payroll"] as const);

  const loadAttendance = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setLocalError("");
    try {
      const params = new URLSearchParams({ branchId, date: attendanceDate });
      if (staffFilter) params.set("staffId", staffFilter);
      const response = await fetch(`/api/v1/operations/staff/attendance?${params}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Unable to load attendance");
      setAttendance(result.data);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Unable to load attendance");
    } finally {
      setLoading(false);
    }
  }, [attendanceDate, branchId, staffFilter]);

  const loadPayroll = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setLocalError("");
    try {
      const params = new URLSearchParams({ branchId, dateFrom: payrollFrom, dateTo: payrollTo });
      if (staffFilter) params.set("staffId", staffFilter);
      const response = await fetch(`/api/v1/operations/staff/payroll?${params}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Unable to load payroll");
      setPayroll(result.data);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Unable to load payroll");
    } finally {
      setLoading(false);
    }
  }, [branchId, payrollFrom, payrollTo, staffFilter]);

  useEffect(() => { if (tab === "attendance") queueMicrotask(() => void loadAttendance()); }, [loadAttendance, tab]);
  useEffect(() => { if (tab === "payroll") queueMicrotask(() => void loadPayroll()); }, [loadPayroll, tab]);

  async function createShift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await submit("/api/v1/operations/staff/shifts", {
      staffId: form.get("staffId"),
      startsAt: new Date(`${shiftDate}T${form.get("startsAt")}:00+05:30`).toISOString(),
      endsAt: new Date(`${shiftDate}T${form.get("endsAt")}:00+05:30`).toISOString(),
      type: form.get("type"),
      idempotencyKey: `shift-${crypto.randomUUID()}`,
    }, "Shift published.");
  }
  async function moveShift(shiftId: string, startsAt: string, endsAt: string, dayOffset: number) {
    const nextStart = new Date(new Date(startsAt).getTime() + dayOffset * 86_400_000);
    const nextEnd = new Date(new Date(endsAt).getTime() + dayOffset * 86_400_000);
    await submit(`/api/v1/operations/staff/shifts/${shiftId}`, { startsAt: nextStart.toISOString(), endsAt: nextEnd.toISOString(), idempotencyKey: `shift-move-${shiftId}-${crypto.randomUUID()}` }, "Shift moved.", "PATCH");
  }
  async function attendanceAction(action: "CLOCK_IN" | "CLOCK_OUT", staffId: string) {
    const result = await submit("/api/v1/operations/staff/attendance", { action, staffId, idempotencyKey: `attendance-${action.toLowerCase()}-${crypto.randomUUID()}` }, action === "CLOCK_IN" ? "Clock-in recorded." : "Clock-out recorded.", "POST", false);
    if (result.ok) await loadAttendance();
  }
  async function manualCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await submit("/api/v1/operations/staff/attendance", {
      action: "MANUAL_CORRECTION",
      staffId: form.get("staffId"),
      clockIn: new Date(String(form.get("clockIn"))).toISOString(),
      clockOut: form.get("clockOut") ? new Date(String(form.get("clockOut"))).toISOString() : undefined,
      note: form.get("note"),
      idempotencyKey: `attendance-manual-${crypto.randomUUID()}`,
    }, "Attendance correction saved.", "POST", false);
    if (result.ok) {
      event.currentTarget.reset();
      await loadAttendance();
    }
  }
  async function approveAttendance(attendanceId: string, status: "APPROVED" | "REJECTED") {
    const result = await submit("/api/v1/operations/staff/attendance", { attendanceId, status, note: status === "REJECTED" ? "Rejected by manager" : undefined }, status === "APPROVED" ? "Correction approved." : "Correction rejected.", "PATCH", false);
    if (result.ok) await loadAttendance();
  }
  async function updateStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await submit("/api/v1/operations/staff", {
      staffId: form.get("staffId"),
      role: form.get("role"),
      jobTitle: form.get("jobTitle"),
      commissionRate: Number(form.get("commissionRate")),
      isActive: form.get("isActive") === "on",
      primaryBranchId: form.get("primaryBranchId"),
      branchIds: form.getAll("branchIds"),
      temporaryPassword: form.get("temporaryPassword") || undefined,
    }, "Staff profile updated.", "PATCH", false);
    if (result.ok) event.currentTarget.reset();
  }
  function exportPayrollCsv() {
    const rows = [["Staff", "Role", "Worked hours", "Expected hours", "Variance hours", "Appointments", "Service revenue", "Product revenue", "Service commission", "Product commission", "Tips", "Payable input"], ...(payroll?.rows || []).map((row) => [row.name, row.role, (row.workedMinutes / 60).toFixed(2), (row.expectedMinutes / 60).toFixed(2), (row.varianceMinutes / 60).toFixed(2), String(row.appointmentsServed), String(row.serviceRevenue), String(row.productRevenue), String(row.serviceCommissions), String(row.productCommissions), String(row.tips), String(row.payableInput)])];
    const blob = new Blob([rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `ruvyra-payroll-${payrollFrom}-${payrollTo}.csv`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  if (!branchId) return <Card title="Team operations"><SlotMessage text="Select a specific branch to manage attendance, shifts, and payroll." /></Card>;
  const attendanceRows = attendance?.rows || [];
  return <div className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Info label="Present today" value={String(data.metrics.staffPresent)} tone="green" /><Info label="Absent today" value={String(data.metrics.staffAbsent)} tone={data.metrics.staffAbsent ? "rose" : "green"} /><Info label="Late clock-ins" value={String(data.metrics.staffLate)} tone={data.metrics.staffLate ? "amber" : "green"} /><Info label="Pending corrections" value={String(data.metrics.pendingAttendanceCorrections)} tone={data.metrics.pendingAttendanceCorrections ? "violet" : "green"} /></div>
    <Card title="Team operations" action={canManageStaff ? <div className="flex flex-wrap gap-2"><button onClick={openLeave} className="rounded-full border border-black/10 px-4 py-2 text-sm font-bold">Record leave</button><button onClick={openStaff} className="primary"><Plus size={15} /> Add team member</button></div> : undefined}>
      <div className="mb-5 flex flex-wrap gap-2">{teamTabs.map((value) => <button key={value} type="button" onClick={() => setTab(value)} className={`rounded-full px-4 py-2 text-sm font-bold ${tab === value ? "bg-[#203a36] text-white" : "bg-[#f5f2ed] text-[#615a52]"}`}>{title(value)}</button>)}</div>
      {localError && <p className="mb-4 rounded-xl bg-[#f2ded8] p-3 text-sm font-bold text-[#995849]">{localError}</p>}
      {tab === "directory" && <div className={`grid gap-5 ${canManageStaff ? "xl:grid-cols-[1fr_380px]" : ""}`}><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.staff.map((member) => <div key={member.id} className="rounded-2xl border border-black/8 p-5"><Avatar name={member.name} dark /><h3 className="mt-4 font-bold">{member.name}</h3><p className="text-sm text-[#817970]">{member.role} ? {title(member.userRole)}</p><p className="mt-1 truncate text-xs text-[#978f87]">{member.email || "No email"}</p><div className="mt-4 border-t border-black/5 pt-4 text-sm"><p>{member.appointments} appointments today</p><p className="mt-1">{member.commissionRate}% commission ? {inr.format(member.commissionEarned)} earned</p><p className="mt-1 text-xs text-[#817970]">{member.branchIds.length} assigned branches</p><p className="mt-2"><Status value={member.attendanceToday.state} /></p></div></div>)}</div>{canManageStaff && <form onSubmit={updateStaff} className="rounded-2xl bg-[#f8f4ef] p-4"><h3 className="font-bold">Staff controls</h3><div className="mt-3 grid gap-3"><Select name="staffId" label="Team member" options={data.staff.map((member) => [member.id, member.name])} /><Select name="role" label="Access role" options={[["MANAGER", "Manager"], ["RECEPTIONIST", "Receptionist"], ["STYLIST", "Stylist"], ["ACCOUNTANT", "Accountant"]]} /><Field name="jobTitle" label="Job title" /><Field name="commissionRate" label="Commission rate %" type="number" defaultValue="0" /><Select name="primaryBranchId" label="Primary branch" options={data.identity.branches.map((branch) => [branch.id, branch.name])} /><fieldset className="rounded-2xl border border-black/10 p-4"><legend className="px-2 text-sm font-bold">Assigned branches</legend>{data.identity.branches.map((branch) => <label key={branch.id} className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" name="branchIds" value={branch.id} defaultChecked={branch.id === branchId} /> {branch.name}</label>)}</fieldset><Field name="temporaryPassword" label="Temporary password, optional" type="password" required={false} /><label className="text-sm font-bold"><input name="isActive" type="checkbox" defaultChecked /> Active login</label><button className="primary justify-center">Save staff controls</button></div></form>}</div>}
      {tab === "attendance" && <div className="grid gap-5 xl:grid-cols-[1fr_360px]"><div><div className="mb-4 flex flex-wrap gap-2"><input className="field w-auto" type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} /><select className="field w-auto" value={staffFilter} onChange={(event) => setStaffFilter(event.target.value)}><option value="">All staff</option>{data.staff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select><button onClick={() => void loadAttendance()} className="primary">Refresh</button></div>{loading ? <SlotMessage text="Loading attendance..." loading /> : <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm"><thead className="text-xs uppercase tracking-wider text-[#958d85]"><tr><th className="pb-3">Staff</th><th className="pb-3">Shift</th><th className="pb-3">Clock</th><th className="pb-3">Worked</th><th className="pb-3">Status</th><th className="pb-3">Action</th></tr></thead><tbody>{attendanceRows.map((row) => <tr key={row.staffId} className="border-t border-black/5"><td className="py-4"><strong>{row.name}</strong><p className="text-xs text-[#817970]">{row.role}</p></td><td className="py-4">{row.shift ? `${formatTime(row.shift.startsAt)} - ${formatTime(row.shift.endsAt)}` : "No shift"}</td><td className="py-4">{row.firstClockIn ? formatTime(row.firstClockIn) : "-"}{row.lastClockOut ? ` - ${formatTime(row.lastClockOut)}` : row.openAttendanceId ? " - open" : ""}</td><td className="py-4">{(row.workedMinutes / 60).toFixed(2)}h<p className="text-xs text-[#817970]">Variance {(row.varianceMinutes / 60).toFixed(2)}h</p></td><td className="py-4"><Status value={row.state} />{row.lateMinutes > 0 && <p className="mt-1 text-xs font-bold text-[#9e5d55]">{row.lateMinutes} min late</p>}</td><td className="py-4"><div className="flex flex-wrap gap-2"><button onClick={() => void attendanceAction("CLOCK_IN", row.staffId)} disabled={Boolean(row.openAttendanceId)} className="rounded-lg border px-2 py-1 text-xs font-bold disabled:opacity-40">Clock in</button><button onClick={() => void attendanceAction("CLOCK_OUT", row.staffId)} disabled={!row.openAttendanceId} className="rounded-lg border px-2 py-1 text-xs font-bold disabled:opacity-40">Clock out</button></div>{row.entries.filter((entry) => entry.status === "PENDING").map((entry) => <div key={entry.id} className="mt-2 rounded-xl bg-[#fff8ec] p-2 text-xs"><p className="font-bold">Pending: {entry.note}</p><div className="mt-1 flex gap-2"><button onClick={() => void approveAttendance(entry.id, "APPROVED")} className="font-bold text-[#315b4c]">Approve</button><button onClick={() => void approveAttendance(entry.id, "REJECTED")} className="font-bold text-[#9e5d55]">Reject</button></div></div>)}</td></tr>)}</tbody></table>{!attendanceRows.length && <Empty text="No attendance rows for this date." />}</div>}</div><form onSubmit={manualCorrection} className="h-fit rounded-2xl bg-[#f8f4ef] p-4"><h3 className="font-bold">Manual correction</h3><p className="mt-1 text-xs text-[#817970]">Managers can approve corrections immediately from here.</p><div className="mt-3 grid gap-3"><Select name="staffId" label="Team member" options={data.staff.map((member) => [member.id, member.name])} /><Field name="clockIn" label="Clock in" type="datetime-local" /><Field name="clockOut" label="Clock out, optional" type="datetime-local" required={false} /><Field name="note" label="Reason" /><button className="primary justify-center">Save correction</button></div></form></div>}
      {tab === "shifts" && <div className="grid gap-5 xl:grid-cols-[1fr_360px]"><Card title="Published shifts"><p className="mb-4 text-xs text-[#817970]">Move a shift one day backward or forward. Conflicts are rechecked by the server.</p>{data.staff.flatMap((member) => member.shifts.map((shift) => ({ ...shift, member }))).length ? data.staff.flatMap((member) => member.shifts.map((shift) => ({ ...shift, member }))).map((shift) => <div key={shift.id} draggable className="mb-2 flex items-center gap-3 rounded-2xl border border-black/8 p-3"><GripVertical size={16} /><div className="min-w-0 flex-1"><p className="font-bold">{shift.member.name}</p><p className="text-xs text-[#817970]">{formatDate(new Date(shift.startsAt))} ? {formatTime(shift.startsAt)}-{formatTime(shift.endsAt)}</p></div><button onClick={() => moveShift(shift.id, shift.startsAt, shift.endsAt, -1)} className="rounded-lg border px-2 py-1 text-xs">-1 day</button><button onClick={() => moveShift(shift.id, shift.startsAt, shift.endsAt, 1)} className="rounded-lg border px-2 py-1 text-xs">+1 day</button></div>) : <Empty text="No shifts published for today." />}</Card><Card title="Publish shift"><form onSubmit={createShift} className="space-y-3"><input className="field" type="date" value={shiftDate} onChange={(event) => setShiftDate(event.target.value)} /><Select name="staffId" label="Team member" options={data.staff.map((member) => [member.id, member.name])} /><Field name="startsAt" label="Starts" type="time" defaultValue="09:00" /><Field name="endsAt" label="Ends" type="time" defaultValue="18:00" /><Select name="type" label="Shift type" options={[["REGULAR", "Regular"], ["OVERTIME", "Overtime"], ["TRAINING", "Training"]]} /><button className="primary w-full justify-center">Publish shift</button></form></Card></div>}
      {tab === "payroll" && <div className="space-y-5"><div className="flex flex-wrap gap-2"><input className="field w-auto" type="date" value={payrollFrom} onChange={(event) => setPayrollFrom(event.target.value)} /><input className="field w-auto" type="date" value={payrollTo} onChange={(event) => setPayrollTo(event.target.value)} /><select className="field w-auto" value={staffFilter} onChange={(event) => setStaffFilter(event.target.value)}><option value="">All staff</option>{data.staff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select><button onClick={() => void loadPayroll()} className="primary">Calculate</button><button onClick={exportPayrollCsv} disabled={!payroll?.rows.length} className="rounded-full border border-black/10 px-4 py-2 text-sm font-bold disabled:opacity-40">Export CSV</button></div>{payroll && <div className="grid gap-3 sm:grid-cols-4"><Info label="Worked hours" value={(payroll.summary.workedMinutes / 60).toFixed(2)} tone="blue" /><Info label="Appointments" value={String(payroll.summary.appointmentsServed)} tone="green" /><Info label="Tips" value={inr.format(payroll.summary.tips)} tone="amber" /><Info label="Payable input" value={inr.format(payroll.summary.payableInput)} tone="violet" /></div>}<div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="text-xs uppercase tracking-wider text-[#958d85]"><tr><th className="pb-3">Staff</th><th className="pb-3">Hours</th><th className="pb-3">Appointments</th><th className="pb-3">Revenue</th><th className="pb-3">Commission</th><th className="pb-3">Tips</th><th className="pb-3 text-right">Payable input</th></tr></thead><tbody>{(payroll?.rows || []).map((row) => <tr key={row.staffId} className="border-t border-black/5"><td className="py-4"><strong>{row.name}</strong><p className="text-xs text-[#817970]">{row.role}</p></td><td className="py-4">{(row.workedMinutes / 60).toFixed(2)}h<p className="text-xs text-[#817970]">Expected {(row.expectedMinutes / 60).toFixed(2)}h</p></td><td className="py-4">{row.appointmentsServed}</td><td className="py-4">{inr.format(row.serviceRevenue + row.productRevenue)}</td><td className="py-4">{inr.format(row.serviceCommissions + row.productCommissions)}</td><td className="py-4">{inr.format(row.tips)}</td><td className="py-4 text-right font-bold">{inr.format(row.payableInput)}</td></tr>)}</tbody></table>{loading ? <SlotMessage text="Calculating payroll..." loading /> : !payroll?.rows.length && <Empty text="Choose filters and calculate payroll summary." />}</div><p className="rounded-2xl bg-[#fff8ec] p-4 text-xs text-[#7c5a1e]">Payroll summary is an operational export only. PF, ESI, TDS, salary slips, and statutory payroll filing are intentionally not calculated.</p></div>}
    </Card>
  </div>;
}
function BenefitsView({ data, submit }: { data: WorkspaceData; submit: SubmitFn }) {
  const [kind, setKind] = useState<"MEMBERSHIP" | "PACKAGE" | "GIFT_CARD" | "REWARD_RULE" | "WALLET_ADJUSTMENT" | "PURCHASE_MEMBERSHIP" | "PURCHASE_PACKAGE">("MEMBERSHIP");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const branchId = data.identity.branchId || data.identity.branches[0]?.id;
    const common = { kind, branchId };
    if (kind === "MEMBERSHIP") await submit("/api/v1/operations/benefits", { ...common, name: form.get("name"), price: Number(form.get("price")), durationDays: Number(form.get("durationDays")), benefits: form.get("benefits"), discountPercent: Number(form.get("discountPercent") || 0), rewardMultiplier: Number(form.get("rewardMultiplier") || 1) }, "Membership created.");
    if (kind === "PACKAGE") await submit("/api/v1/operations/benefits", { ...common, name: form.get("name"), price: Number(form.get("price")), validityDays: Number(form.get("validityDays")), services: [{ serviceId: form.get("serviceId"), quantity: Number(form.get("quantity")) }] }, "Package created.");
    if (kind === "GIFT_CARD") await submit("/api/v1/operations/benefits", { ...common, customerId: form.get("customerId") || undefined, value: Number(form.get("value")), expiresAt: form.get("expiresAt") ? new Date(String(form.get("expiresAt"))).toISOString() : undefined, idempotencyKey: "gift-card-" + crypto.randomUUID() }, "Gift card issued.");
    if (kind === "REWARD_RULE") await submit("/api/v1/operations/benefits", { ...common, name: form.get("name"), pointsPerAmount: Number(form.get("pointsPerAmount")), amountPerPoint: Number(form.get("amountPerPoint")), earnOnTax: form.get("earnOnTax") === "on", minRedeemPoints: Number(form.get("minRedeemPoints") || 0), maxRedeemPercent: Number(form.get("maxRedeemPercent") || 20), expiryDays: form.get("expiryDays") ? Number(form.get("expiryDays")) : undefined }, "Reward rule activated.");
    if (kind === "WALLET_ADJUSTMENT") await submit("/api/v1/operations/benefits", { ...common, customerId: form.get("customerId"), direction: form.get("direction"), amount: Number(form.get("amount")), reason: form.get("reason"), idempotencyKey: "wallet-" + crypto.randomUUID() }, "Wallet adjusted.");
    if (kind === "PURCHASE_MEMBERSHIP") await submit("/api/v1/operations/benefits", { ...common, customerId: form.get("customerId"), membershipId: form.get("membershipId"), idempotencyKey: "membership-" + crypto.randomUUID() }, "Membership assigned.");
    if (kind === "PURCHASE_PACKAGE") await submit("/api/v1/operations/benefits", { ...common, customerId: form.get("customerId"), packageId: form.get("packageId"), idempotencyKey: "package-" + crypto.randomUUID() }, "Package assigned.");
  }
  async function updateBenefit(body: Record<string, unknown>, message: string) {
    const branchId = data.identity.branchId || data.identity.branches[0]?.id;
    if (!branchId) return;
    await submit("/api/v1/operations/benefits", { ...body, branchId }, message, "PATCH", false);
  }
  const activeReward = data.rewardRules.find((rule) => rule.isActive);
  return <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3"><Info label="Active reward rule" value={activeReward ? activeReward.name : "Not configured"} tone="violet" /><Info label="Earn rate" value={activeReward ? `${activeReward.pointsPerAmount} pts per rupee` : "Default 1 per INR 100"} tone="green" /><Info label="Redeem value" value={activeReward ? `${inr.format(activeReward.amountPerPoint)} per point` : "INR 1 per point"} tone="amber" /></div>
      <Card title="Membership plans">{data.memberships.length ? data.memberships.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-t border-black/5 py-3 first:border-0"><div><p className="text-sm font-bold">{item.name}</p><p className="text-xs text-[#817970]">{item.durationDays} days ? {item.discountPercent}% discount ? {item.rewardMultiplier}x rewards ? {item.isActive ? "Active" : "Archived"}</p></div><div className="text-right"><strong className="text-sm">{inr.format(item.price)}</strong><button onClick={() => void updateBenefit({ kind: "MEMBERSHIP", id: item.id, isActive: !item.isActive }, item.isActive ? "Membership archived." : "Membership restored.")} className="mt-1 block text-xs font-bold text-[#9e5d55]">{item.isActive ? "Archive" : "Restore"}</button></div></div>) : <Empty text="No membership plans configured." />}</Card>
      <Card title="Prepaid packages">{data.packages.length ? data.packages.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-t border-black/5 py-3 first:border-0"><div><p className="text-sm font-bold">{item.name}</p><p className="text-xs text-[#817970]">{item.validityDays} days ? {item.isActive ? "Active" : "Archived"}</p></div><div className="text-right"><strong className="text-sm">{inr.format(item.price)}</strong><button onClick={() => void updateBenefit({ kind: "PACKAGE", id: item.id, isActive: !item.isActive }, item.isActive ? "Package archived." : "Package restored.")} className="mt-1 block text-xs font-bold text-[#9e5d55]">{item.isActive ? "Archive" : "Restore"}</button></div></div>) : <Empty text="No packages configured." />}</Card>
      <Card title="Gift cards">{data.giftCards.length ? data.giftCards.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-t border-black/5 py-3 first:border-0"><div><p className="text-sm font-bold">{item.code}</p><p className="text-xs text-[#817970]">{item.customer || "Unassigned"} ? {title(item.status)}{item.expiresAt ? ` ? Expires ${formatDate(new Date(item.expiresAt))}` : ""}</p></div><div className="text-right"><strong className="text-sm">{inr.format(item.balance)}</strong><button onClick={() => void updateBenefit({ kind: "GIFT_CARD", id: item.id, status: item.status === "ACTIVE" ? "CANCELLED" : "ACTIVE" }, item.status === "ACTIVE" ? "Gift card cancelled." : "Gift card restored.")} className="mt-1 block text-xs font-bold text-[#9e5d55]">{item.status === "ACTIVE" ? "Cancel" : "Restore"}</button></div></div>) : <Empty text="No gift cards issued." />}</Card>
      <Card title="Reward rules">{data.rewardRules.length ? data.rewardRules.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-t border-black/5 py-3 first:border-0"><div><p className="text-sm font-bold">{item.name}</p><p className="text-xs text-[#817970]">{item.pointsPerAmount} pts per rupee ? {inr.format(item.amountPerPoint)} per point ? {item.isActive ? "Active" : "Archived"}</p></div><button onClick={() => void updateBenefit({ kind: "REWARD_RULE", id: item.id, isActive: !item.isActive }, item.isActive ? "Reward rule archived." : "Reward rule activated.")} className="text-xs font-bold text-[#9e5d55]">{item.isActive ? "Archive" : "Activate"}</button></div>) : <Empty text="No reward rules configured." />}</Card>
    </div>
    <Card title="Benefit and reward actions">
      <div className="mb-4 grid grid-cols-2 gap-2">{(["MEMBERSHIP", "PACKAGE", "GIFT_CARD", "REWARD_RULE", "WALLET_ADJUSTMENT", "PURCHASE_MEMBERSHIP", "PURCHASE_PACKAGE"] as const).map((value) => <button type="button" key={value} onClick={() => setKind(value)} className={`rounded-xl border px-2 py-2 text-xs font-bold ${kind === value ? "bg-[#203a36] text-white" : ""}`}>{title(value)}</button>)}</div>
      <form onSubmit={save} className="space-y-3">
        {kind === "MEMBERSHIP" && <><Field name="name" label="Plan name" /><Field name="price" label="Price" type="number" /><Field name="durationDays" label="Duration in days" type="number" /><Field name="discountPercent" label="POS discount percent" type="number" defaultValue="0" /><Field name="rewardMultiplier" label="Reward multiplier" type="number" defaultValue="1" /><Field name="benefits" label="Benefits" /></>}
        {kind === "PACKAGE" && <><Field name="name" label="Package name" /><Field name="price" label="Price" type="number" /><Field name="validityDays" label="Validity in days" type="number" /><Select name="serviceId" label="Included service" options={data.services.map((item) => [item.id, item.name])} /><Field name="quantity" label="Uses" type="number" defaultValue="1" /></>}
        {kind === "GIFT_CARD" && <><Select name="customerId" label="Customer, optional" required={false} options={data.customers.map((item) => [item.id, item.name])} /><Field name="value" label="Card value" type="number" /><Field name="expiresAt" label="Expiry" type="date" required={false} /></>}
        {kind === "REWARD_RULE" && <><Field name="name" label="Rule name" defaultValue="Standard rewards" /><Field name="pointsPerAmount" label="Points per rupee" type="number" defaultValue="0.01" /><Field name="amountPerPoint" label="Rupee value per point" type="number" defaultValue="1" /><Field name="minRedeemPoints" label="Minimum redeem points" type="number" defaultValue="0" /><Field name="maxRedeemPercent" label="Max invoice redeem percent" type="number" defaultValue="20" /><Field name="expiryDays" label="Point expiry days, optional" type="number" required={false} /><label className="text-sm font-bold"><input name="earnOnTax" type="checkbox" /> Earn rewards on GST amount too</label></>}
        {kind === "WALLET_ADJUSTMENT" && <><Select name="customerId" label="Customer" options={data.customers.map((item) => [item.id, item.name])} /><Select name="direction" label="Direction" options={[["CREDIT", "Credit"], ["DEBIT", "Debit"]]} /><Field name="amount" label="Amount" type="number" /><Field name="reason" label="Reason" /></>}
        {kind === "PURCHASE_MEMBERSHIP" && <><Select name="customerId" label="Customer" options={data.customers.map((item) => [item.id, item.name])} /><Select name="membershipId" label="Membership" options={data.memberships.map((item) => [item.id, item.name])} /></>}
        {kind === "PURCHASE_PACKAGE" && <><Select name="customerId" label="Customer" options={data.customers.map((item) => [item.id, item.name])} /><Select name="packageId" label="Package" options={data.packages.map((item) => [item.id, item.name])} /></>}
        <button className="primary w-full justify-center">Save</button>
      </form>
    </Card>
  </div>;
}

function MarketingView({ data, submit }: { data: WorkspaceData; submit: SubmitFn }) {
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await submit("/api/v1/operations/campaigns", {
      name: form.get("name"),
      channel: form.get("channel"),
      segment: form.get("segment"),
      template: form.get("template"),
      scheduledAt: form.get("scheduledAt") ? new Date(String(form.get("scheduledAt"))).toISOString() : undefined,
      idempotencyKey: `campaign-${crypto.randomUUID()}`,
    }, "Campaign saved and consent-filtered recipients queued.");
  }
  return <div className="grid gap-5 xl:grid-cols-[1fr_400px]"><Card title="Campaigns">{data.campaigns.length ? data.campaigns.map((campaign) => <div key={campaign.id} className="flex items-center gap-4 border-t border-black/5 py-4 first:border-0"><div className="grid size-10 place-items-center rounded-xl bg-[#f1e7e2] text-[#9e5d55]"><Send size={17} /></div><div className="flex-1"><p className="font-bold">{campaign.name}</p><p className="text-xs text-[#817970]">{title(campaign.channel)}  -  {campaign.sent} sent  -  {campaign.failed} failed</p></div><Status value={campaign.status} /></div>) : <Empty text="No campaigns created." />}</Card><Card title="Campaign builder"><p className="mb-4 text-xs text-[#817970]">Recipients are filtered by the channel consent saved on each customer profile. Delivery stays queued until provider credentials are configured.</p><form onSubmit={save} className="space-y-3"><Field name="name" label="Campaign name" /><Select name="channel" label="Channel" options={[["WHATSAPP", "WhatsApp"], ["SMS", "SMS"], ["EMAIL", "Email"]]} /><Select name="segment" label="Audience" options={[["ALL", "All consented customers"], ["BIRTHDAY", "Birthday customers"], ["INACTIVE", "Inactive customers"], ["LOYAL", "Loyal customers"]]} /><label className="text-sm font-bold">Message<textarea name="template" required maxLength={3000} className="field mt-2 min-h-32" placeholder="Hello {{name}}, ..." /></label><Field name="scheduledAt" label="Schedule, optional" type="datetime-local" required={false} /><button className="primary w-full justify-center">Save campaign</button></form></Card></div>;
}

function ReviewsView({ data, submit }: { data: WorkspaceData; submit: SubmitFn }) {
  const [rating, setRating] = useState("all");
  const items = data.reviews.filter((review) => rating === "all" || review.rating === Number(rating));
  async function reply(reviewId: string, mode: "reply" | "report") {
    const text = window.prompt(mode === "reply" ? "Write the salon reply:" : "Why should the platform review this rating|")?.trim();
    if (!text) return;
    await submit(`/api/v1/operations/reviews/${reviewId}`, mode === "reply" ? { salonReply: text } : { reportReason: text }, mode === "reply" ? "Reply published." : "Review reported to platform.", "PATCH");
  }
  return <Card title="Verified visit reviews" action={<select className="field w-auto" value={rating} onChange={(event) => setRating(event.target.value)}><option value="all">All ratings</option>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} stars</option>)}</select>}>{items.length ? items.map((review) => <div key={review.id} className="border-t border-black/5 py-5 first:border-0"><div className="flex items-center justify-between"><div><p className="font-bold">{review.customer}</p><p className="text-xs text-[#817970]">{formatDate(new Date(review.createdAt))}  -  Verified completed visit</p></div><span className="font-bold text-[#9e5d55]">{"|".repeat(review.rating)}</span></div><p className="mt-3 text-sm">{review.comment || "No written comment."}</p>{review.salonReply && <p className="mt-3 rounded-xl bg-[#f5f2ed] p-3 text-sm"><strong>Salon reply:</strong> {review.salonReply}</p>}<div className="mt-3 flex gap-2"><button onClick={() => reply(review.id, "reply")} className="rounded-full border px-3 py-1.5 text-xs font-bold">Reply</button><button onClick={() => reply(review.id, "report")} className="rounded-full border px-3 py-1.5 text-xs font-bold text-[#9e5d55]">Report</button></div></div>) : <Empty text="No verified reviews match this filter." />}</Card>;
}

function ReportsView({ data, open, focusedInvoiceId }: { data: WorkspaceData; open: () => void; focusedInvoiceId?: string | null }) {
  const branchId = data.identity.branchId || "all";
  const [query, setQuery] = useState("");
  const [taxMode, setTaxMode] = useState("all");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [invoiceData, setInvoiceData] = useState<InvoiceListData | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [localError, setLocalError] = useState("");

  const loadInvoices = useCallback(async () => {
    const params = new URLSearchParams({ branchId, page: String(page), pageSize: "20" });
    if (query.trim()) params.set("query", query.trim());
    if (taxMode !== "all") params.set("taxMode", taxMode);
    if (status !== "all") params.set("status", status);
    if (type !== "all") params.set("type", type);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    setLoading(true);
    setLocalError("");
    try {
      const response = await fetch(`/api/v1/operations/invoices?${params}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Unable to load invoices");
      setInvoiceData(result.data);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Unable to load invoices");
    } finally {
      setLoading(false);
    }
  }, [branchId, dateFrom, dateTo, page, query, status, taxMode, type]);

  useEffect(() => { queueMicrotask(() => void loadInvoices()); }, [loadInvoices]);

  useEffect(() => {
    if (focusedInvoiceId) void openInvoice(focusedInvoiceId);
  }, [focusedInvoiceId]);

  async function openInvoice(invoiceId: string) {
    setSelectedId(invoiceId);
    setDetailLoading(true);
    setLocalError("");
    try {
      const response = await fetch(`/api/v1/operations/invoices/${invoiceId}?branchId=${encodeURIComponent(branchId)}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Unable to load invoice");
      setDetail(result.data);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Unable to load invoice");
    } finally {
      setDetailLoading(false);
    }
  }

  async function invoiceAction(action: "REFUND" | "VOID") {
    if (!detail) return;
    const reason = window.prompt(action === "REFUND" ? "Reason for refund:" : "Reason for void:")?.trim();
    if (!reason) return;
    const body = action === "REFUND"
      ? { action, branchId: detail.branch.id, reason, method: "CASH", restockProducts: true, idempotencyKey: `refund-${crypto.randomUUID()}` }
      : { action, branchId: detail.branch.id, reason, idempotencyKey: `void-${crypto.randomUUID()}` };
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/v1/operations/invoices/${detail.id}/refund`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Unable to update invoice");
      await loadInvoices();
      await openInvoice(detail.id);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Unable to update invoice");
    } finally {
      setDetailLoading(false);
    }
  }

  function exportCsv() {
    const rows = [["Invoice", "Customer", "Phone", "Branch", "Date", "Type", "Tax mode", "Status", "Payment methods", "Tax", "Total", "Outstanding"], ...(invoiceData?.invoices || []).map((invoice) => [invoice.number, invoice.customer.name, invoice.customer.phone, invoice.branch.name, invoice.createdAt, invoice.type, invoice.taxMode, invoice.status, invoice.payments.map((payment) => payment.method).join(" + "), String(invoice.tax), String(invoice.total), String(invoice.outstanding)])];
    const blob = new Blob([rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `ruvyra-invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  function downloadInvoicePdf() {
    if (!detail) return;
    openInvoicePrintWindow(detail);
  }

  const invoices = invoiceData?.invoices || [];
  return <div className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Month revenue", data.metrics.monthRevenue], ["GST collected", data.metrics.monthTax], ["Expenses", data.metrics.monthExpenses], ["Net before payroll", data.metrics.monthRevenue - data.metrics.monthExpenses]].map(([label, value]) => <div key={String(label)} className="rounded-3xl bg-white p-5"><p className="text-sm text-[#817970]">{label}</p><strong className="mt-2 block text-3xl">{inr.format(Number(value))}</strong></div>)}</div>
    <div className="grid gap-5 lg:grid-cols-2"><Card title="Revenue by day"><MiniBars items={data.trends.revenue} money /></Card><Card title="Top services"><MiniBars items={data.trends.topServices} /></Card></div>
    <Card title="Expenses" action={<button onClick={open} className="primary"><Plus size={15} /> Add expense</button>}>{data.expenses.length ? data.expenses.slice(0, 10).map((expense) => <Row key={expense.id} primary={expense.category} secondary={formatDate(new Date(expense.spentAt))} value={inr.format(expense.amount)} />) : <Empty text="No expenses recorded." />}</Card>
    <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
      <Card title="Invoice center" action={<button onClick={exportCsv} className="rounded-full border border-black/10 px-4 py-2 text-sm font-bold">Export CSV</button>}>
        <div className="grid gap-3 md:grid-cols-6"><label className="md:col-span-2 flex items-center gap-2 rounded-xl border border-black/10 px-3"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} className="w-full py-3 text-sm outline-none" placeholder="Invoice, customer, phone" /></label><select className="field" value={taxMode} onChange={(event) => { setTaxMode(event.target.value); setPage(1); }}><option value="all">All tax modes</option><option value="GST">GST</option><option value="NON_GST">Non-GST</option></select><select className="field" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="all">All status</option><option value="PAID">Paid</option><option value="PARTIALLY_PAID">Partial</option><option value="REFUNDED">Refunded</option><option value="VOID">Void</option></select><select className="field" value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}><option value="all">All types</option><option value="SALE">Sales</option><option value="REFUND">Refunds</option></select><button onClick={() => void loadInvoices()} className="primary justify-center">Apply</button><input className="field" type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} /><input className="field" type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} /></div>
        {invoiceData && <div className="mt-5 grid gap-3 sm:grid-cols-4"><Info label="Invoices" value={String(invoiceData.summary.count)} tone="blue" /><Info label="Tax" value={inr.format(invoiceData.summary.tax)} tone="amber" /><Info label="Paid" value={inr.format(invoiceData.summary.paid)} tone="green" /><Info label="Outstanding" value={inr.format(invoiceData.summary.outstanding)} tone="rose" /></div>}
        {localError && <p className="mt-4 rounded-xl bg-[#f2ded8] p-3 text-sm font-bold text-[#995849]">{localError}</p>}
        <div className="mt-5 overflow-x-auto"><table className="soft-table w-full min-w-[900px] text-left text-sm"><thead className="text-xs uppercase tracking-wider text-[#958d85]"><tr><th className="pb-3">Invoice</th><th className="pb-3">Customer</th><th className="pb-3">Date</th><th className="pb-3">Mode</th><th className="pb-3">Status</th><th className="pb-3 text-right">Total</th><th className="pb-3 text-right">Action</th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id} onClick={() => void openInvoice(invoice.id)} className={`cursor-pointer border-t border-black/5 ${selectedId === invoice.id ? "bg-[#fff8ec]" : ""}`}><td className="py-4"><p className="font-bold">{invoice.number}</p><p className="text-xs text-[#817970]">{invoice.branch.name} | {title(invoice.type)}</p></td><td className="py-4">{invoice.customer.name}<span className="block text-xs text-[#817970]">{invoice.customer.phone}</span></td><td className="py-4">{formatDateTime(invoice.createdAt)}</td><td className="py-4"><span className={`rounded-full px-2 py-1 text-xs font-bold ${invoice.taxMode === "GST" ? "bg-[#edf7f1] text-[#315b4c]" : "bg-[#f5f2ed] text-[#817970]"}`}>{invoice.taxMode === "GST" ? "GST" : "Non-GST"}</span></td><td className="py-4"><Status value={invoice.status} /></td><td className="py-4 text-right font-bold">{inr.format(invoice.total)}</td><td className="py-4 text-right"><button type="button" onClick={(event) => { event.stopPropagation(); void openInvoice(invoice.id); }} className="rounded-full border border-[#d8c9a4] bg-[#fffaf0] px-3 py-1.5 text-xs font-extrabold text-[#7b5514]">Open</button></td></tr>)}</tbody></table>{loading ? <SlotMessage text="Loading invoices..." loading /> : !invoices.length && <Empty text="No invoices match these filters." />}</div>
        {invoiceData && <Pager page={page} total={invoiceData.pagination.total} pageSize={invoiceData.pagination.pageSize} setPage={setPage} />}
      </Card>
      <aside className="h-fit rounded-3xl bg-white p-6 shadow-sm">
        {!detail && !detailLoading && <SlotMessage text="Select an invoice to inspect line items, payments, redemptions, and refund actions." />}
        {detailLoading && <SlotMessage text="Loading invoice detail..." loading />}
        {detail && !detailLoading && <InvoicePreview detail={detail} onDownloadPdf={downloadInvoicePdf} onInvoiceAction={invoiceAction} />}
      </aside>
    </div>
  </div>;
}

function InvoicePreview({ detail, onDownloadPdf, onInvoiceAction }: { detail: InvoiceDetail; onDownloadPdf: () => void; onInvoiceAction: (action: "REFUND" | "VOID") => Promise<void> }) {
  return <div className="overflow-hidden rounded-[1.75rem] border border-[#d8c9a4] bg-[#fffaf0] shadow-[0_18px_60px_rgba(45,34,20,.12)]">
    <div className="bg-[#0e0c09] p-5 text-white">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#d6b35e]">{detail.taxMode === "GST" ? "GST invoice" : "Non-GST invoice"}</p>
          <h3 className="mt-2 font-serif text-3xl leading-tight">{detail.number}</h3>
          <p className="mt-2 text-xs text-white/55">{formatDateTime(detail.createdAt)} | {detail.branch.name}{detail.branch.city ? `, ${detail.branch.city}` : ""}</p>
        </div>
        <Status value={detail.status} />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
        <Summary label="Paid" value={inr.format(detail.paid)} />
        <Summary label="Outstanding" value={inr.format(detail.outstanding)} />
      </div>
    </div>
    <div className="p-5">
      <div className="rounded-2xl border border-[#e8deca] bg-white p-4">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#9e7a2e]">Bill to</p>
        <p className="mt-2 font-bold">{detail.customer.name}</p>
        <p className="mt-1 text-xs text-[#817970]">{detail.customer.phone}{detail.customer.email ? ` | ${detail.customer.email}` : ""}</p>
      </div>
      <div className="mt-5 overflow-hidden rounded-2xl border border-[#e8deca] bg-white">
        {detail.lines.map((line, index) => <div key={line.id} className="border-t border-[#eee4d1] p-4 first:border-0">
          <div className="flex justify-between gap-4">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#9e7a2e]">Item {index + 1} | {title(line.type)}</p>
              <p className="mt-1 font-bold">{line.description}</p>
              <p className="mt-1 text-xs text-[#817970]">Qty {line.quantity} | Staff: {line.staff || "Not assigned"}</p>
            </div>
            <strong className="text-right">{inr.format(line.total)}</strong>
          </div>
          <p className="mt-2 text-xs text-[#817970]">Rate {inr.format(line.unitPrice)} | Discount {inr.format(line.discount)} | Tax {line.taxRate}% ({inr.format(line.tax)})</p>
        </div>)}
      </div>
      <div className="mt-5 rounded-2xl bg-[#0e0c09] p-4 text-sm text-white">
        <Summary label="Subtotal" value={inr.format(detail.subtotal)} />
        <Summary label="Discount" value={`-${inr.format(detail.discount)}`} />
        <Summary label={detail.taxMode === "GST" ? "GST" : "Tax"} value={inr.format(detail.tax)} />
        <Summary label="Tip" value={inr.format(detail.tip)} />
        <div className="mt-3 flex justify-between border-t border-white/12 pt-3 text-lg"><span>Total</span><strong>{inr.format(detail.total)}</strong></div>
      </div>
      <div className="mt-5">
        <h4 className="text-sm font-extrabold">Payments</h4>
        {detail.payments.length ? detail.payments.map((payment) => <Row key={payment.id} primary={title(payment.method)} secondary={payment.reference || formatDateTime(payment.createdAt)} value={inr.format(payment.amount)} />) : <Empty text="No payments recorded." />}
      </div>
      {detail.benefits.length > 0 && <div className="mt-5">
        <h4 className="text-sm font-extrabold">Rewards and benefits</h4>
        {detail.benefits.map((benefit) => <Row key={benefit.id} primary={title(benefit.kind)} secondary={benefit.note || benefit.sourceType} value={benefit.points ? `${benefit.points > 0 ? "+" : ""}${benefit.points} pts` : benefit.amount !== null ? inr.format(benefit.amount) : "-"} />)}
      </div>}
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={onDownloadPdf} className="primary"><ReceiptText size={15} /> Download PDF</button>
        <button type="button" onClick={() => window.print()} className="rounded-full border border-[#d8c9a4] bg-white px-4 py-2 text-sm font-bold">Print page</button>
        {detail.type === "SALE" && !["REFUNDED", "VOID"].includes(detail.status) && <button type="button" onClick={() => void onInvoiceAction("REFUND")} className="rounded-full bg-[#f2ded8] px-4 py-2 text-sm font-bold text-[#995849]">Refund</button>}
        {detail.type === "SALE" && detail.paid === 0 && !["REFUNDED", "VOID"].includes(detail.status) && <button type="button" onClick={() => void onInvoiceAction("VOID")} className="rounded-full border border-black/10 px-4 py-2 text-sm font-bold">Void</button>}
      </div>
      <p className="mt-4 text-center text-xs text-[#817970]">Thank you for choosing Neel Bridal Studio.</p>
    </div>
  </div>;
}

function SettingsView({ data }: { data: WorkspaceData }) {
  return <div className="space-y-5">
    <ShareBookingPageCard slug={data.identity.tenantSlug} tenantName={data.identity.tenantName} />
    <Card title="Business configuration"><div className="grid gap-4 sm:grid-cols-2"><Info label="Business" value={data.identity.tenantName} /><Info label="Branch scope" value={data.identity.branchName} /><Info label="Location" value={data.identity.branchCity} /><Info label="Timezone" value="Asia/Kolkata" /></div><div className="mt-5 grid gap-3 md:grid-cols-3">{["Booking policies", "GST and invoice numbering", "Payment methods", "Roles and access", "Notification providers", "Custom fields"].map((item) => <button key={item} className="rounded-2xl border border-black/8 p-4 text-left text-sm font-bold">{item}<span className="mt-2 block text-xs font-normal text-[#817970]">Managed through authenticated workspace settings.</span></button>)}</div></Card>
    <Card title="Recent audit activity">{data.auditLogs.length ? data.auditLogs.slice(0, 20).map((log) => <Row key={log.id} primary={title(log.action)} secondary={`${log.user || "System"}  -  ${formatDate(new Date(log.createdAt))}`} value={log.entity} />) : <Empty text="No audit events recorded." />}</Card>
  </div>;
}

function ShareBookingPageCard({ slug, tenantName }: { slug: string; tenantName: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? `/book/${slug}` : `${window.location.origin}/book/${slug}`;
  const whatsappText = encodeURIComponent(`Hi! You can book your appointment with ${tenantName} here: ${url}`);
  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }).catch(() => undefined);
  }
  return (
    <Card title="Share your booking page" action={<a href={url} target="_blank" rel="noreferrer" className="text-sm font-bold text-[#9e7a2e]">Preview</a>}>
      <p className="text-sm text-[#817970]">Send this link to your customers via WhatsApp, SMS, or Instagram bio. They can pick a service and confirm a slot in seconds.</p>
      <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-black/10 bg-[#f5f2ed] p-3 sm:flex-row sm:items-center">
        <code className="flex-1 truncate font-mono text-sm">{url}</code>
        <button onClick={copy} className="rounded-full bg-[#203a36] px-4 py-2 text-xs font-bold text-white">{copied ? "Copied!" : "Copy link"}</button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={`https://wa.me/?text=${whatsappText}`} target="_blank" rel="noreferrer" className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-bold">Share on WhatsApp</a>
        <a href={`mailto:?subject=${encodeURIComponent("Book your appointment")}&body=${whatsappText}`} className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-bold">Share via email</a>
      </div>
    </Card>
  );
}

type CustomerChoice = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  visits?: number;
  lastVisit?: string | null;
  loyalty?: number;
  notes?: string | null;
  allergies?: string | null;
};

function CustomerPicker({ branchId, value, initialCustomers, onChange, submit }: { branchId: string; value: string; initialCustomers: CustomerChoice[]; onChange: (customer: CustomerChoice) => void; submit: SubmitFn }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerChoice[]>(initialCustomers.slice(0, 8));
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [localError, setLocalError] = useState("");
  const selected = [...results, ...initialCustomers].find((customer) => customer.id === value);

  useEffect(() => {
    if (query.trim().length < 2) {
      queueMicrotask(() => setResults(initialCustomers.filter((customer) => `${customer.name} ${customer.phone}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8)));
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ branchId, query: query.trim() });
        const response = await fetch(`/api/v1/operations/customers?${params}`, { cache: "no-store", signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || "Unable to search customers");
        setResults(result.data);
      } catch (searchError) {
        if (!(searchError instanceof DOMException && searchError.name === "AbortError")) setLocalError(searchError instanceof Error ? searchError.message : "Unable to search customers");
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [branchId, initialCustomers, query]);

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await submit<CustomerChoice & { existing: boolean }>("/api/v1/operations/customers", {
      branchId,
      name: form.get("name"),
      phone: form.get("phone"),
      email: form.get("email"),
      notes: form.get("notes"),
    }, "Customer selected.", "POST", false);
    if (result.ok) {
      const customer = result.data;
      setResults((current) => [customer, ...current.filter((item) => item.id !== customer.id)]);
      onChange(customer);
      setAdding(false);
      setQuery("");
    } else {
      setLocalError(result.error);
    }
  }

  return <div className="rounded-2xl border border-black/8 bg-white p-3">
    <div className="flex gap-2"><label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-black/10 px-3"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full py-2.5 text-sm outline-none" placeholder="Search name or mobile number" /></label><button type="button" onClick={() => setAdding(true)} className="shrink-0 rounded-xl bg-[#203a36] px-3 text-sm font-bold text-white"><Plus size={15} className="mr-1 inline" /> Add customer</button></div>
    {selected && <div className="mt-3 rounded-xl bg-[#e8efe9] p-3 text-sm"><strong>{selected.name}</strong><span className="ml-2 text-[#5d655f]">{selected.phone}</span>{Boolean(selected.allergies || selected.notes) && <span className="mt-1 block text-xs font-bold text-[#995849]">{selected.allergies || selected.notes}</span>}</div>}
    {!selected && <div className="mt-2 max-h-52 overflow-y-auto">{searching ? <p className="p-3 text-sm text-[#817970]">Searching...</p> : results.map((customer) => <button type="button" key={customer.id} onClick={() => onChange(customer)} className="flex w-full items-center justify-between border-t border-black/5 p-3 text-left first:border-0 hover:bg-[#faf7f3]"><span><strong className="block text-sm">{customer.name}</strong><span className="text-xs text-[#817970]">{customer.phone}{customer.lastVisit ? `  -  Last visit ${formatDate(new Date(customer.lastVisit))}` : ""}</span></span><span className="text-right text-xs text-[#817970]">{customer.visits || 0} visits<br />{customer.loyalty || 0} pts</span></button>)}</div>}
    {localError && <p className="mt-2 text-xs font-bold text-[#995849]">{localError}</p>}
    {adding && <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4"><form onSubmit={createCustomer} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><h3 className="font-serif text-2xl font-bold">Quick customer</h3><button type="button" onClick={() => setAdding(false)}><X /></button></div><div className="mt-5 space-y-3"><Field name="name" label="Customer name" /><Field name="phone" label="India mobile" defaultValue="+91" /><Field name="email" label="Email" type="email" required={false} /><Field name="notes" label="Notes" required={false} /></div><button className="primary mt-5 w-full justify-center">Create and select</button></form></div>}
  </div>;
}

type BookingOptions = {
  branch: { id: string; name: string; timezone: string; operatingHours: Array<{ dayOfWeek: number; opensAt: string; closesAt: string; isClosed: boolean }> };
  categories: Array<{ id: string; name: string; color: string | null; icon: string | null; sortOrder: number }>;
  services: Array<{ id: string; name: string; category: string; categoryId: string | null; durationMinutes: number; price: number; taxRate: number; isActive: boolean }>;
  staff: Array<{ id: string; name: string; role: string; serviceIds: string[] }>;
};

function AppointmentModalV2({ data, busy, error, bookingSeed, close, submit }: { data: WorkspaceData; busy: boolean; error: string; bookingSeed: BookingSeed; close: () => void; submit: SubmitFn }) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const [branchId, setBranchId] = useState(bookingSeed.branchId || data.identity.branchId || "");
  const [options, setOptions] = useState<BookingOptions | null>(null);
  const [customer, setCustomer] = useState<CustomerChoice | null>(data.customers.find((item) => item.id === bookingSeed.customerId) || null);
  const [lines, setLines] = useState<Array<{ serviceId: string; staffId: string }>>([]);
  const [date, setDate] = useState(bookingSeed.date || today);
  const [selectedSlot, setSelectedSlot] = useState(bookingSeed.startsAt?.includes("T") ? bookingSeed.startsAt : bookingSeed.startsAt ? new Date(`${bookingSeed.date || today}T${bookingSeed.startsAt}:00+05:30`).toISOString() : "");
  const [source, setSource] = useState<"WALK_IN" | "PHONE" | "STAFF_CREATED">(bookingSeed.source || "WALK_IN");
  const [notes, setNotes] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotError, setSlotError] = useState("");
  const [serviceQuery, setServiceQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");

  useEffect(() => {
    if (!branchId) return;
    queueMicrotask(() => setLoadingOptions(true));
    fetch(`/api/v1/operations/booking-options?branchId=${encodeURIComponent(branchId)}`, { cache: "no-store" })
      .then(async (response) => ({ response, result: await response.json() }))
      .then(({ response, result }) => {
        if (!response.ok) throw new Error(result.error?.message || "Unable to load booking options");
        setOptions(result.data);
      })
      .catch((loadError) => setSlotError(loadError instanceof Error ? loadError.message : "Unable to load booking options"))
      .finally(() => setLoadingOptions(false));
  }, [branchId]);

  useEffect(() => {
    if (!branchId || !lines.length || !date) {
      queueMicrotask(() => setSlots([]));
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({
      branchId,
      serviceId: lines[0].serviceId,
      date,
      serviceLines: JSON.stringify(lines.map((line) => ({ serviceId: line.serviceId, staffId: line.staffId || null }))),
    });
    queueMicrotask(() => {
      setLoadingSlots(true);
      setSlotError("");
    });
    fetch(`/api/v1/availability?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => ({ response, result: await response.json() }))
      .then(({ response, result }) => {
        if (!response.ok) throw new Error(result.error?.message || "Unable to load available times");
        setSlots(result.data.slots);
        if (selectedSlot && !result.data.slots.includes(selectedSlot)) setSelectedSlot("");
      })
      .catch((loadError) => {
        if (!(loadError instanceof DOMException && loadError.name === "AbortError")) setSlotError(loadError instanceof Error ? loadError.message : "Unable to load available times");
      })
      .finally(() => setLoadingSlots(false));
    return () => controller.abort();
  }, [branchId, date, lines, selectedSlot]);

  function addService(serviceId: string) {
    setLines((current) => [...current, { serviceId, staffId: current.length === 0 ? bookingSeed.staffId || "" : "" }]);
    setSelectedSlot("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customer || !lines.length || !selectedSlot) return setSlotError("Select a customer, at least one service, and an available time.");
    await submit("/api/v1/operations/appointments", {
      branchId,
      customerId: customer.id,
      serviceId: lines[0].serviceId,
      staffId: lines[0].staffId || undefined,
      serviceLines: lines.map((line) => ({ serviceId: line.serviceId, staffId: line.staffId || null })),
      startsAt: selectedSlot,
      source,
      notes: notes || undefined,
      idempotencyKey: `appointment-${crypto.randomUUID()}`,
    }, "Appointment created.");
  }

  const selectedServices = lines.map((line) => ({ ...line, service: options?.services.find((service) => service.id === line.serviceId) })).filter((line) => line.service);
  const totalDuration = selectedServices.reduce((sum, line) => sum + (line.service?.durationMinutes || 0), 0);
  const totalPrice = selectedServices.reduce((sum, line) => sum + (line.service?.price || 0), 0);
  const filteredServices = options?.services.filter((service) => (!categoryId || service.categoryId === categoryId) && `${service.name} ${service.category}`.toLowerCase().includes(serviceQuery.toLowerCase())) || [];

  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-3 backdrop-blur-sm sm:p-5"><form onSubmit={save} className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-[2rem] bg-[#fbfaf8] shadow-2xl">
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/6 bg-white/95 px-5 py-4 backdrop-blur-xl sm:px-7"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#9e5d55]">{options?.branch.name || "Reception booking"}</p><h2 className="font-serif text-2xl font-semibold">Create appointment</h2></div><button type="button" onClick={close} className="grid size-10 place-items-center rounded-full bg-[#f3f1ed]"><X size={18} /></button></div>
    <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_320px]"><div className="space-y-7">
      {data.identity.scope === "all" && <section><Step number="1" title="Choose branch" /><select required className="field mt-4" value={branchId} onChange={(event) => { setBranchId(event.target.value); setLines([]); setSelectedSlot(""); }}><option value="">Select branch</option>{data.identity.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}  -  {branch.city}</option>)}</select></section>}
      {!branchId ? <SlotMessage text="Choose a branch to load customers, services, professionals, and available times." /> : loadingOptions ? <SlotMessage text="Loading branch catalogue..." loading /> : options && <>
        <section><Step number={data.identity.scope === "all" ? "2" : "1"} title="Customer and source" /><div className="mt-4 grid gap-4 md:grid-cols-[1fr_300px]"><CustomerPicker branchId={branchId} value={customer?.id || ""} initialCustomers={data.customers} onChange={setCustomer} submit={submit} /><div className="grid grid-cols-3 gap-2">{(["WALK_IN", "PHONE", "STAFF_CREATED"] as const).map((value) => <button type="button" key={value} onClick={() => setSource(value)} className={`rounded-xl border px-2 text-xs font-bold ${source === value ? "border-[#203a36] bg-[#203a36] text-white" : "border-black/10 bg-white"}`}>{title(value)}</button>)}</div></div></section>
        <section><Step number={data.identity.scope === "all" ? "3" : "2"} title="Services and professionals" /><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => setCategoryId("")} className={`rounded-full px-3 py-1.5 text-xs font-bold ${!categoryId ? "bg-[#203a36] text-white" : "bg-white"}`}>All</button>{options.categories.map((category) => <button type="button" key={category.id} onClick={() => setCategoryId(category.id)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${categoryId === category.id ? "bg-[#203a36] text-white" : "bg-white"}`}>{category.name}</button>)}</div><input className="field mt-3" value={serviceQuery} onChange={(event) => setServiceQuery(event.target.value)} placeholder="Search services" /><div className="mt-3 grid gap-3 sm:grid-cols-2">{filteredServices.map((service) => <button type="button" key={service.id} onClick={() => addService(service.id)} className="rounded-2xl border border-black/8 bg-white p-4 text-left hover:border-[#9e5d55]"><div className="flex justify-between gap-3"><div><p className="font-bold">{service.name}</p><p className="mt-1 text-xs text-[#817970]">{service.category}  -  {service.durationMinutes} minutes</p></div><strong>{inr.format(service.price)}</strong></div></button>)}</div><div className="mt-4 space-y-2">{selectedServices.map((line, index) => <div key={`${line.serviceId}-${index}`} className="grid gap-2 rounded-2xl bg-white p-3 sm:grid-cols-[1fr_240px_auto] sm:items-center"><div><strong className="text-sm">{index + 1}. {line.service!.name}</strong><p className="text-xs text-[#817970]">{line.service!.durationMinutes} min  -  {inr.format(line.service!.price)}</p></div><select className="field" value={line.staffId} onChange={(event) => { const staffValue = event.target.value; setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, staffId: staffValue } : item)); setSelectedSlot(""); }}><option value="">Any qualified professional</option>{options.staff.filter((member) => member.serviceIds.includes(line.serviceId)).map((member) => <option key={member.id} value={member.id}>{member.name}  -  {member.role}</option>)}</select><button type="button" onClick={() => setLines((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="text-xs font-bold text-[#995849]">Remove</button></div>)}</div></section>
        <section><Step number={data.identity.scope === "all" ? "4" : "3"} title="Date and available time" /><input className="field mt-4 max-w-56" type="date" min={today} value={date} onChange={(event) => { setDate(event.target.value); setSelectedSlot(""); }} /><div className="mt-4">{!lines.length ? <SlotMessage text="Add at least one service to see available times." /> : loadingSlots ? <SlotMessage text="Checking every selected professional..." loading /> : slotError ? <SlotMessage text={slotError} error /> : slots.length ? <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{slots.map((slot) => <button type="button" key={slot} onClick={() => setSelectedSlot(slot)} className={`rounded-xl border px-3 py-3 text-sm font-bold ${selectedSlot === slot ? "border-[#9e5d55] bg-[#9e5d55] text-white" : "border-black/10 bg-white"}`}>{formatTime(slot)}</button>)}</div> : <SlotMessage text="No sequential slot is available for all selected services." />}</div></section>
        <section><Step number={data.identity.scope === "all" ? "5" : "4"} title="Notes" /><textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="field mt-4 min-h-24" placeholder="Preferences, allergies, or internal notes" maxLength={500} /></section>
      </>}
    </div><aside className="h-fit rounded-3xl bg-[#203a36] p-6 text-white lg:sticky lg:top-24"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#d8ad9a]">Appointment summary</p><h3 className="mt-4 font-serif text-2xl">{selectedServices.length ? `${selectedServices.length} service${selectedServices.length === 1 ? "" : "s"}` : "Choose services"}</h3><div className="mt-5 space-y-4 border-y border-white/10 py-5 text-sm"><Summary label="Customer" value={customer?.name || "Not selected"} /><Summary label="Date" value={date} /><Summary label="Time" value={selectedSlot ? formatTime(selectedSlot) : "Not selected"} /><Summary label="Duration" value={totalDuration ? `${totalDuration} minutes` : " - "} /></div><div className="mt-5 flex items-end justify-between"><span className="text-sm text-white/55">Estimated price</span><strong className="text-2xl">{inr.format(totalPrice)}</strong></div>{error && <p className="mt-4 rounded-xl bg-[#f2ded8] p-3 text-sm font-bold text-[#995849]">{error}</p>}<button disabled={busy || !branchId || !customer || !lines.length || !selectedSlot} className="mt-6 w-full rounded-full bg-[#d19a85] py-3.5 text-sm font-bold disabled:opacity-40">{busy ? "Creating appointment..." : "Confirm appointment"}</button><p className="mt-3 text-center text-xs text-white/45">Availability is rechecked transactionally before saving.</p></aside></div>
  </form></div>;
}

function PosViewV2({ data, submit, openInvoice }: { data: WorkspaceData; submit: SubmitFn; openInvoice: (invoiceId?: string) => void }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<CustomerChoice | null>(null);
  const [appointmentId, setAppointmentId] = useState("");
  const [tab, setTab] = useState<"SERVICE" | "PRODUCT">("SERVICE");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [payments, setPayments] = useState<Array<{ method: "UPI" | "CARD" | "CASH" | "GIFT_CARD" | "LOYALTY" | "WALLET"; amount: number; reference?: string }>>([{ method: "UPI", amount: 0 }]);
  const [taxMode, setTaxMode] = useState<"GST" | "NON_GST">("GST");
  const [tip, setTip] = useState(0);
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
  const [profileError, setProfileError] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const branchId = data.identity.branchId || "";
  const totals = useMemo(() => cart.reduce((result, line) => {
    const base = line.price * line.quantity;
    const lineDiscount = line.packagePurchaseId ? base : line.discount;
    const taxable = Math.max(0, base - lineDiscount);
    const tax = taxMode === "GST" ? taxable * line.taxRate / 100 : 0;
    return { subtotal: result.subtotal + base, discount: result.discount + lineDiscount, tax: result.tax + tax, total: result.total + taxable + tax };
  }, { subtotal: 0, discount: 0, tax: 0, total: 0 }), [cart, taxMode]);
  const grandTotal = totals.total + tip;
  const paymentTotal = Number(payments.reduce((sum, item) => sum + Number(item.amount || 0), 0).toFixed(2));
  const balanceDue = Number((grandTotal - paymentTotal).toFixed(2));
  const categories = tab === "SERVICE" ? data.serviceCategories.map((item) => item.name) : [...new Set(data.inventory.map((item) => item.category))];
  const services = data.services.filter((item) => item.isActive && (!category || item.category === category) && `${item.name} ${item.category}`.toLowerCase().includes(query.toLowerCase()));
  const products = data.inventory.filter((item) => (!category || item.category === category) && `${item.name} ${item.sku} ${item.category}`.toLowerCase().includes(query.toLowerCase()));
  const activePackages = customerProfile?.packages.filter((item) => new Date(item.expiresAt) >= new Date()) ?? [];
  const activeGiftCards = customerProfile?.giftCards.filter((item) => item.status === "ACTIVE" && item.balance > 0) ?? [];
  const saleWarnings = [
    !customer ? "Select or add a customer before checkout." : "",
    !cart.length ? "Add at least one service or product." : "",
    Math.abs(balanceDue) > 0.01 ? `Payment mismatch: ${balanceDue > 0 ? inr.format(balanceDue) + " remaining" : inr.format(Math.abs(balanceDue)) + " overpaid"}.` : "",
  ].filter(Boolean);

  useEffect(() => {
    if (!customer?.id || !branchId) {
      setCustomerProfile(null);
      setProfileError("");
      return;
    }
    const controller = new AbortController();
    setProfileError("");
    fetch(`/api/v1/operations/customers/${customer.id}?branchId=${encodeURIComponent(branchId)}&pageSize=5`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => ({ response, result: await response.json() }))
      .then(({ response, result }) => {
        if (!response.ok) throw new Error(result.error?.message || "Unable to load customer balances");
        setCustomerProfile(result.data);
      })
      .catch((loadError) => {
        if (!(loadError instanceof DOMException && loadError.name === "AbortError")) setProfileError(loadError instanceof Error ? loadError.message : "Unable to load customer balances");
      });
    return () => controller.abort();
  }, [branchId, customer?.id]);

  function packageUses(balance: unknown, serviceId: string) {
    if (!Array.isArray(balance)) return 0;
    const matched = balance.find((item) => item && typeof item === "object" && (item as { serviceId?: unknown }).serviceId === serviceId) as { quantity?: unknown } | undefined;
    return Number(matched?.quantity || 0);
  }

  function packagesForService(serviceId: string) {
    return (customerProfile?.packages || []).filter((item) => packageUses(item.balance, serviceId) > 0 && new Date(item.expiresAt) >= new Date());
  }

  function add(line: CartLine) {
    setCart((current) => {
      const existing = current.find((item) => item.type === line.type && item.itemId === line.itemId);
      return existing ? current.map((item) => item === existing ? { ...item, quantity: item.quantity + 1 } : item) : [...current, line];
    });
    setCheckoutError("");
  }

  function linkAppointment(id: string) {
    setAppointmentId(id);
    const appointment = data.appointments.find((item) => item.id === id);
    if (!appointment) return;
    const matchedCustomer = data.customers.find((item) => item.id === appointment.customerId);
    if (matchedCustomer) setCustomer(matchedCustomer);
    if (!cart.length) {
      setCart((appointment.serviceLines.length ? appointment.serviceLines : [{ serviceId: appointment.serviceId, service: appointment.service, staffId: appointment.staffId, price: appointment.price, taxRate: 18 }]).map((line) => ({
        type: "SERVICE" as const,
        itemId: line.serviceId,
        name: "service" in line ? line.service : appointment.service,
        price: line.price,
        taxRate: line.taxRate,
        quantity: 1,
        discount: 0,
        staffId: line.staffId || undefined,
      })));
    }
  }

  async function checkout() {
    setCheckoutError("");
    const result = await submit<{ id: string; number: string; total: string | number }>("/api/v1/operations/checkout", {
      branchId,
      customerId: customer?.id,
      appointmentId: appointmentId || undefined,
      taxMode,
      lines: cart.map(({ type, itemId, quantity, staffId, discount, packagePurchaseId }) => ({ type, itemId, quantity, staffId, discount, packagePurchaseId })),
      payments: payments.map((payment) => ({ ...payment, amount: Number(payment.amount.toFixed(2)) })),
      tip,
      idempotencyKey: `checkout-${crypto.randomUUID()}`,
    }, `Sale recorded: ${inr.format(grandTotal)}. Opening invoice...`);
    if (result.ok) {
      const invoiceId = result.data.id;
      setCart([]);
      setAppointmentId("");
      setTip(0);
      setPayments([{ method: "UPI", amount: 0 }]);
      openInvoice(invoiceId);
    } else {
      setCheckoutError(result.error);
    }
  }

  if (!branchId) return <Card title="New sale"><SlotMessage text="Select a specific branch before recording a sale." /></Card>;
  return <div className="grid gap-5 xl:grid-cols-[1fr_430px]">
    <Card title="Sale catalogue" action={<span className="rounded-full bg-[#fff4d0] px-3 py-1.5 text-xs font-extrabold text-[#7b5514]">{taxMode === "GST" ? "GST mode" : "Non-GST mode"}</span>}>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => { setTab("SERVICE"); setCategory(""); }} className={`rounded-full px-4 py-2 text-sm font-bold ${tab === "SERVICE" ? "bg-[#203a36] text-white" : "bg-[#f5f2ed]"}`}>Services</button>
        <button type="button" onClick={() => { setTab("PRODUCT"); setCategory(""); }} className={`rounded-full px-4 py-2 text-sm font-bold ${tab === "PRODUCT" ? "bg-[#203a36] text-white" : "bg-[#f5f2ed]"}`}>Products</button>
      </div>
      <label className="mt-4 flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3">
        <Search size={16} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent py-3 outline-none" placeholder={tab === "SERVICE" ? "Search service or category" : "Search product, SKU, or scan barcode"} />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setCategory("")} className={`rounded-full px-3 py-1.5 text-xs font-bold ${!category ? "bg-[#d19a85] text-white" : "bg-[#f5f2ed]"}`}>All</button>
        {categories.map((item) => <button type="button" key={item} onClick={() => setCategory(item)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${category === item ? "bg-[#d19a85] text-white" : "bg-[#f5f2ed]"}`}>{item}</button>)}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tab === "SERVICE"
          ? services.map((service) => <button type="button" key={service.id} onClick={() => add({ type: "SERVICE", itemId: service.id, name: service.name, price: service.price, taxRate: service.taxRate, quantity: 1, discount: 0, staffId: data.staff[0]?.id })} className="rounded-2xl border border-black/8 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-[#9e5d55] hover:shadow-md"><Sparkles size={18} className="text-[#9e5d55]" /><p className="mt-4 font-bold">{service.name}</p><p className="text-xs text-[#817970]">{service.category} - {service.durationMinutes} min</p><p className="mt-2 font-bold text-[#203a36]">{inr.format(service.price)}</p></button>)
          : products.map((product) => <button type="button" key={product.id} disabled={product.quantity <= 0} onClick={() => add({ type: "PRODUCT", itemId: product.id, name: product.name, price: product.retailPrice, taxRate: 18, quantity: 1, discount: 0 })} className="rounded-2xl border border-black/8 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-[#9e5d55] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-45"><Boxes size={18} className="text-[#315b4c]" /><p className="mt-4 font-bold">{product.name}</p><p className="text-xs text-[#817970]">{product.category} - {product.sku}</p><p className="mt-2 font-bold text-[#203a36]">{inr.format(product.retailPrice)} <span className={product.quantity <= product.reorderLevel ? "text-[#995849]" : "text-[#817970]"}>- {product.quantity} left</span></p></button>)}
      </div>
      {tab === "PRODUCT" && products.some((item) => item.quantity <= item.reorderLevel) && <p className="mt-4 rounded-2xl bg-[#fff4d0] p-3 text-xs font-bold text-[#7b5514]">Low-stock products are highlighted before checkout.</p>}
    </Card>

    <aside className="h-fit rounded-[1.75rem] border border-[#d8c9a4] bg-white p-5 shadow-sm xl:sticky xl:top-24">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[.18em] text-[#9e7a2e]">Cash counter</p>
          <h2 className="mt-1 font-serif text-2xl font-semibold">Current sale</h2>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-[#f8f4ef] p-1">
          {(["GST", "NON_GST"] as const).map((mode) => <button key={mode} type="button" onClick={() => setTaxMode(mode)} className={`rounded-xl px-3 py-2 text-[11px] font-extrabold ${taxMode === mode ? "bg-[#203a36] text-white" : "text-[#817970]"}`}>{mode === "GST" ? "GST" : "Non-GST"}</button>)}
        </div>
      </div>

      <section className="mt-5 rounded-2xl border border-[#eee4d1] bg-[#fffaf0] p-4">
        <p className="mb-3 text-xs font-extrabold uppercase tracking-[.14em] text-[#9e7a2e]">1. Customer</p>
        <CustomerPicker branchId={branchId} value={customer?.id || ""} initialCustomers={data.customers} onChange={(nextCustomer) => { setCustomer(nextCustomer); setCheckoutError(""); }} submit={submit} />
        {customerProfile && <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <Info label="Wallet" value={inr.format(customerProfile.summary.walletBalance)} tone="green" />
          <Info label="Rewards" value={`${customerProfile.summary.loyaltyBalance} pts`} tone="amber" />
          <Info label="Gift cards" value={String(activeGiftCards.length)} tone="violet" />
          <Info label="Packages" value={String(activePackages.length)} tone="blue" />
        </div>}
        {profileError && <p className="mt-2 text-xs font-bold text-[#995849]">{profileError}</p>}
      </section>

      <section className="mt-4 rounded-2xl border border-[#eee4d1] p-4">
        <p className="mb-3 text-xs font-extrabold uppercase tracking-[.14em] text-[#9e7a2e]">2. Appointment link</p>
        <select value={appointmentId} onChange={(event) => linkAppointment(event.target.value)} className="field">
          <option value="">Walk-in or counter sale</option>
          {data.appointments.filter((item) => !["COMPLETED", "CANCELLED", "NO_SHOW"].includes(item.status)).map((item) => <option key={item.id} value={item.id}>{formatTime(item.startsAt)} - {item.customer}</option>)}
        </select>
      </section>

      <section className="mt-4 rounded-2xl border border-[#eee4d1] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-extrabold uppercase tracking-[.14em] text-[#9e7a2e]">3. Cart</p>
          <span className="text-xs font-bold text-[#817970]">{cart.length} line(s)</span>
        </div>
        <div className="space-y-3">
          {cart.map((line) => {
            const packageOptions = line.type === "SERVICE" ? packagesForService(line.itemId) : [];
            return <div key={`${line.type}-${line.itemId}`} className="rounded-2xl bg-[#f8f4ef] p-3">
              <div className="flex justify-between gap-3">
                <div>
                  <p className="text-sm font-extrabold">{line.name}</p>
                  <p className="mt-1 text-xs text-[#817970]">{title(line.type)} - {inr.format(line.price)} each</p>
                </div>
                <button type="button" onClick={() => setCart((current) => current.filter((item) => item !== line))} className="text-xs font-extrabold text-[#995849]">Remove</button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="text-[11px] font-bold text-[#817970]">Qty<input className="field mt-1 p-2" type="number" min="1" value={line.quantity} onChange={(event) => setCart((current) => current.map((item) => item === line ? { ...item, quantity: Number(event.target.value) } : item))} /></label>
                <label className="text-[11px] font-bold text-[#817970]">Discount<input className="field mt-1 p-2" type="number" min="0" disabled={Boolean(line.packagePurchaseId)} value={line.packagePurchaseId ? line.price * line.quantity : line.discount} onChange={(event) => setCart((current) => current.map((item) => item === line ? { ...item, discount: Number(event.target.value) } : item))} /></label>
              </div>
              {line.type === "SERVICE" && <label className="mt-2 block text-[11px] font-bold text-[#817970]">Staff attribution<select className="field mt-1" value={line.staffId || ""} onChange={(event) => setCart((current) => current.map((item) => item === line ? { ...item, staffId: event.target.value || undefined } : item))}><option value="">Use appointment/default staff</option>{data.staff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>}
              {line.type === "SERVICE" && <label className="mt-2 block text-[11px] font-bold text-[#817970]">Package redemption<select className="field mt-1" value={line.packagePurchaseId || ""} onChange={(event) => setCart((current) => current.map((item) => item === line ? { ...item, packagePurchaseId: event.target.value || undefined, discount: event.target.value ? item.price * item.quantity : 0 } : item))}><option value="">No package redemption</option>{packageOptions.map((pack) => <option key={pack.id} value={pack.id}>{pack.name} - {packageUses(pack.balance, line.itemId)} use(s) left</option>)}</select></label>}
              {line.packagePurchaseId && <p className="mt-2 rounded-xl bg-[#edf7f1] px-3 py-2 text-xs font-bold text-[#315b4c]">This service will be charged against the selected prepaid package.</p>}
            </div>;
          })}
        </div>
        {!cart.length && <Empty text="Add a service or product." />}
      </section>

      <section className="mt-4 rounded-2xl border border-[#eee4d1] p-4">
        <p className="mb-3 text-xs font-extrabold uppercase tracking-[.14em] text-[#9e7a2e]">4. Payment</p>
        <label className="block text-xs font-bold">Tip<input className="field mt-1" type="number" min="0" value={tip} onChange={(event) => setTip(Number(event.target.value))} /></label>
        <div className="mt-3 space-y-2">
          {payments.map((payment, index) => <div key={index} className="grid grid-cols-[1fr_120px_auto] gap-2">
            <select className="field" value={payment.method} onChange={(event) => setPayments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, method: event.target.value as typeof item.method } : item))}>{(["UPI", "CARD", "CASH", "WALLET", "LOYALTY", "GIFT_CARD"] as const).map((method) => <option key={method}>{method}</option>)}</select>
            <input className="field" type="number" step="0.01" value={payment.amount || ""} onChange={(event) => setPayments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, amount: Number(event.target.value) } : item))} />
            <button type="button" onClick={() => setPayments((current) => current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-xl border border-black/10 px-2 text-xs font-bold">X</button>
            {payment.method === "GIFT_CARD" && <input className="field col-span-3" placeholder="Gift card code" value={payment.reference || ""} onChange={(event) => setPayments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, reference: event.target.value } : item))} />}
          </div>)}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["CASH", "UPI", "CARD"] as const).map((method) => <button key={method} type="button" onClick={() => setPayments([{ method, amount: Number(grandTotal.toFixed(2)) }])} className="rounded-full bg-[#f5f2ed] px-3 py-1.5 text-xs font-extrabold text-[#615a52]">Full {method}</button>)}
          <button type="button" onClick={() => setPayments((current) => [...current, { method: "CASH", amount: Math.max(0, balanceDue) }])} className="rounded-full bg-[#fff4d0] px-3 py-1.5 text-xs font-extrabold text-[#7b5514]">Split payment</button>
        </div>
      </section>

      <section className="mt-4 rounded-2xl bg-[#0e0c09] p-4 text-sm text-white">
        <Summary label="Subtotal" value={inr.format(totals.subtotal)} />
        <Summary label="Discount / redemptions" value={`-${inr.format(totals.discount)}`} />
        <Summary label={taxMode === "GST" ? "GST" : "Tax"} value={inr.format(totals.tax)} />
        <Summary label="Tip" value={inr.format(tip)} />
        <div className="mt-3 flex justify-between border-t border-white/12 pt-3 text-lg"><span>Total</span><strong>{inr.format(grandTotal)}</strong></div>
        <div className={`mt-3 rounded-2xl px-3 py-2 text-xs font-extrabold ${Math.abs(balanceDue) <= 0.01 ? "bg-[#315b4c] text-white" : "bg-[#fff4d0] text-[#5f4310]"}`}>{Math.abs(balanceDue) <= 0.01 ? "Payment balanced" : balanceDue > 0 ? `${inr.format(balanceDue)} remaining` : `${inr.format(Math.abs(balanceDue))} overpaid`}</div>
      </section>

      {(saleWarnings.length > 0 || checkoutError) && <div className="mt-4 rounded-2xl bg-[#fff0ec] p-3 text-xs font-bold text-[#995849]">{checkoutError || saleWarnings[0]}</div>}
      <button disabled={saleWarnings.length > 0} onClick={checkout} className="primary mt-5 w-full justify-center disabled:cursor-not-allowed disabled:opacity-45">Record payment and open invoice</button>
    </aside>
  </div>;
}

function ServiceModalV2({ data, busy, error, close, submit }: { data: WorkspaceData; busy: boolean; error: string; close: () => void; submit: SubmitFn }) {
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await submit("/api/v1/operations/services", {
      name: form.get("name"),
      categoryId: form.get("categoryId"),
      durationMinutes: Number(form.get("duration")),
      price: Number(form.get("price")),
      taxRate: Number(form.get("tax")),
    }, "Service created.");
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4 backdrop-blur-sm"><form onSubmit={save} className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><h2 className="font-serif text-2xl font-semibold">New service</h2><button type="button" onClick={close} className="grid size-9 place-items-center rounded-full bg-[#f3f1ed]"><X size={17} /></button></div><div className="mt-6 grid gap-4"><Field name="name" label="Service name" /><Select name="categoryId" label="Category" options={data.serviceCategories.filter((category) => category.isActive).map((category) => [category.id, category.name])} /><Field name="duration" label="Duration in minutes" type="number" /><Field name="price" label="Price before GST" type="number" /><Field name="tax" label="GST rate" type="number" defaultValue="18" /></div>{!data.serviceCategories.some((category) => category.isActive) && <p className="mt-4 text-sm font-bold text-[#995849]">Create an active service category first.</p>}{error && <p className="mt-4 rounded-xl bg-[#f2ded8] p-3 text-sm font-bold text-[#995849]">{error}</p>}<button disabled={busy || !data.serviceCategories.some((category) => category.isActive)} className="primary mt-6 w-full justify-center">{busy ? "Saving..." : "Save service"}</button></form></div>;
}

function OperationModal({ name, data, busy, error, bookingSeed, close, submit }: { name: Exclude<ModalName, null>; data: WorkspaceData; busy: boolean; error: string; bookingSeed: BookingSeed; close: () => void; submit: SubmitFn }) {
  const specializedModal = name === "appointment"
    ? <AppointmentModalV2 data={data} busy={busy} error={error} bookingSeed={bookingSeed} close={close} submit={submit} />
    : name === "service"
      ? <ServiceModalV2 data={data} busy={busy} error={error} close={close} submit={submit} />
      : null;
  if (specializedModal) return specializedModal;
  async function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (name === "customer") await submit("/api/v1/operations/customers", { name: form.get("name"), phone: form.get("phone"), email: form.get("email"), notes: form.get("notes") }, "Customer saved.");
    if (name === "service") await submit("/api/v1/operations/services", { name: form.get("name"), category: form.get("category"), durationMinutes: Number(form.get("duration")), price: Number(form.get("price")), taxRate: Number(form.get("tax")) }, "Service created.");
    if (name === "stock") await submit("/api/v1/operations/inventory", { inventoryItemId: form.get("inventoryItemId"), quantity: Number(form.get("quantity")), type: form.get("type"), reference: form.get("reference"), idempotencyKey: `stock-${crypto.randomUUID()}` }, "Stock updated.");
    if (name === "expense") await submit("/api/v1/operations/expenses", { category: form.get("category"), amount: Number(form.get("amount")), note: form.get("note"), spentAt: new Date(String(form.get("spentAt"))).toISOString() }, "Expense recorded.");
    if (name === "leave") await submit("/api/v1/operations/staff/leave", { staffId: form.get("staffId"), startsAt: new Date(String(form.get("startsAt"))).toISOString(), endsAt: new Date(String(form.get("endsAt"))).toISOString(), reason: form.get("reason") }, "Staff leave recorded.");
    if (name === "staff") await submit("/api/v1/operations/staff", { name: form.get("name"), email: form.get("email"), password: form.get("password"), role: form.get("role"), jobTitle: form.get("jobTitle"), commissionRate: Number(form.get("commissionRate")), primaryBranchId: form.get("primaryBranchId"), branchIds: form.getAll("branchIds") }, "Team member created.");
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4 backdrop-blur-sm"><form onSubmit={handle} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><h2 className="font-serif text-2xl font-semibold">{modalTitle(name)}</h2><button type="button" onClick={close} className="grid size-9 place-items-center rounded-full bg-[#f3f1ed]"><X size={17} /></button></div><div className="mt-6 grid gap-4">{name === "customer" && <><Field name="name" label="Name" /><Field name="phone" label="India mobile" defaultValue="+91" /><Field name="email" label="Email" type="email" required={false} /><Field name="notes" label="Notes" required={false} /></>}{name === "service" && <><Field name="name" label="Service name" /><Field name="category" label="Category" /><Field name="duration" label="Duration in minutes" type="number" /><Field name="price" label="Price before GST" type="number" /><Field name="tax" label="GST rate" type="number" defaultValue="18" /></>}{name === "stock" && <><Select name="inventoryItemId" label="Product" options={data.inventory.map((item) => [item.id, item.name])} /><Select name="type" label="Movement" options={[["PURCHASE", "Purchase"], ["ADJUSTMENT_IN", "Adjustment in"], ["ADJUSTMENT_OUT", "Adjustment out"]]} /><Field name="quantity" label="Quantity" type="number" /><Field name="reference" label="Reference" required={false} /></>}{name === "expense" && <><Field name="category" label="Category" /><Field name="amount" label="Amount" type="number" /><Field name="spentAt" label="Date" type="datetime-local" /><Field name="note" label="Note" required={false} /></>}{name === "leave" && <><Select name="staffId" label="Team member" options={data.staff.map((item) => [item.id, item.name])} /><Field name="startsAt" label="Starts" type="datetime-local" /><Field name="endsAt" label="Ends" type="datetime-local" /><Field name="reason" label="Reason" required={false} /></>}{name === "staff" && <><Field name="name" label="Name" /><Field name="email" label="Login email" type="email" /><Field name="password" label="Temporary password" type="password" /><Select name="role" label="Access role" options={[["MANAGER", "Manager"], ["RECEPTIONIST", "Receptionist"], ["STYLIST", "Stylist"], ["ACCOUNTANT", "Accountant"]]} /><Field name="jobTitle" label="Job title" /><Field name="commissionRate" label="Commission rate %" type="number" defaultValue="0" /><Select name="primaryBranchId" label="Primary branch" options={data.identity.branches.map((branch) => [branch.id, branch.name])} /><fieldset className="rounded-2xl border border-black/10 p-4"><legend className="px-2 text-sm font-bold">Assigned branches</legend>{data.identity.branches.map((branch) => <label key={branch.id} className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" name="branchIds" value={branch.id} /> {branch.name}</label>)}</fieldset></>}</div>{error && <p className="mt-4 rounded-xl bg-[#f2ded8] p-3 text-sm font-bold text-[#995849]">{error}</p>}<button disabled={busy} className="primary mt-6 w-full justify-center">{busy ? "Saving..." : "Save"}</button></form></div>;
}

function AppointmentDrawer({ appointmentId, data, submit, close, openCustomer, openService, openSale }: {
  appointmentId: string;
  data: WorkspaceData;
  submit: SubmitFn;
  close: () => void;
  openCustomer: (id: string) => void;
  openService: (id: string) => void;
  openSale: () => void;
}) {
  const [detail, setDetail] = useState<AppointmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/operations/appointments/${appointmentId}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Unable to load appointment");
      setDetail(result.data);
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

  async function updateStatus(value: string) {
    if (!detail) return;
    const cancellationReason = ["CANCELLED", "NO_SHOW"].includes(value) ? window.prompt(`Reason for ${title(value).toLowerCase()}:`)?.trim() : undefined;
    if (["CANCELLED", "NO_SHOW"].includes(value) && !cancellationReason) return;
    const result = await submit(`/api/v1/operations/appointments/${detail.id}`, {
      branchId: detail.branch.id,
      status: value,
      cancellationReason,
      idempotencyKey: `drawer-status-${detail.id}-${crypto.randomUUID()}`,
    }, `Appointment moved to ${title(value)}.`, "PATCH", false);
    if (result.ok) await load();
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
      idempotencyKey: `drawer-edit-${detail.id}-${crypto.randomUUID()}`,
    }, "Appointment updated.", "PATCH", false);
    if (result.ok) {
      setEditing(false);
      await load();
    }
  }

  return <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Appointment details" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <aside className="h-full w-full overflow-y-auto bg-[#f8f6f2] shadow-2xl sm:max-w-2xl">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/8 bg-white/95 px-5 py-4 backdrop-blur">
        <div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#9e5d55]">Appointment</p><h2 className="font-serif text-2xl font-semibold">{detail?.bookingReference || appointmentId}</h2></div>
        <button type="button" onClick={close} className="grid size-10 place-items-center rounded-full bg-[#f3f1ed]" aria-label="Close appointment details"><X size={18} /></button>
      </div>
      <div className="space-y-5 p-5 sm:p-6">
        {loading ? <SlotMessage text="Loading complete appointment..." loading /> : error ? <SlotMessage text={error} error /> : detail && <>
          <section className="rounded-3xl bg-[#203a36] p-6 text-white">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><Status value={detail.status} /><h3 className="mt-4 font-serif text-3xl">{formatDate(new Date(detail.startsAt))}</h3><p className="mt-2 flex items-center gap-2 text-sm text-white/65"><Clock size={15} />{formatTime(detail.startsAt)} - {formatTime(detail.endsAt)}  -  {Math.round((new Date(detail.endsAt).getTime() - new Date(detail.startsAt).getTime()) / 60_000)} min</p><p className="mt-2 flex items-center gap-2 text-sm text-white/65"><MapPin size={15} />{detail.branch.name}</p></div><Source value={detail.source} /></div>
            <p className="mt-5 text-xs text-white/45">Created {formatDateTime(detail.createdAt)}</p>
          </section>

          <Card title="Customer" action={<button type="button" onClick={() => openCustomer(detail.customer.id)} className="text-sm font-bold text-[#9e5d55]">View customer <ChevronRight size={14} className="inline" /></button>}>
            <div className="flex items-center gap-4"><Avatar name={detail.customer.name} dark /><div><h3 className="font-bold">{detail.customer.name}</h3><p className="mt-1 text-sm text-[#817970]"><Phone size={13} className="mr-1 inline" />{detail.customer.phone}{detail.customer.email ? <><Mail size={13} className="ml-3 mr-1 inline" />{detail.customer.email}</> : null}</p></div></div>
            <div className="mt-4 grid grid-cols-2 gap-3"><Info label="Completed visits" value={String(detail.customer.visitCount)} tone="green" /><Info label="Loyalty balance" value={`${detail.customer.loyaltyBalance} points`} tone="violet" /></div>
            {(detail.customer.allergies || detail.customer.notes) && <div className="mt-4 rounded-2xl border border-[#e9b8aa] bg-[#fff1ed] p-4 text-sm text-[#8f554d] shadow-sm"><strong className="uppercase tracking-wide">Customer alert</strong><p className="mt-1">{detail.customer.allergies || detail.customer.notes}</p></div>}
          </Card>

          <Card title="Services">
            <div className="space-y-3">{detail.serviceLines.map((line, index) => <div key={line.id} className="rounded-2xl border border-black/8 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-[#9e5d55]">Service {index + 1}</p><button type="button" onClick={() => openService(line.serviceId)} className="mt-1 text-left font-bold hover:text-[#9e5d55]">{line.serviceName} <ChevronRight size={14} className="inline" /></button><p className="mt-1 text-xs text-[#817970]">{formatTime(line.startsAt)} - {formatTime(line.endsAt)}  -  {line.durationMinutes} min  -  {line.staffName}</p>{(line.bufferBefore > 0 || line.bufferAfter > 0) && <p className="mt-1 text-xs text-[#817970]">Buffers: {line.bufferBefore} min before, {line.bufferAfter} min after</p>}</div><div className="text-right"><strong>{inr.format(line.price)}</strong><p className="text-xs text-[#817970]">{line.taxRate}% GST</p></div></div></div>)}</div>
          </Card>

          {(detail.notes || detail.cancellationReason) && <Card title="Notes"><p className="text-sm">{detail.notes || "No internal notes."}</p>{detail.cancellationReason && <p className="mt-3 rounded-xl bg-[#f2ded8] p-3 text-sm font-bold text-[#995849]">Reason: {detail.cancellationReason}</p>}</Card>}

          <Card title="Billing">
            {detail.invoice ? <><div className="flex items-center justify-between"><div><p className="font-bold">{detail.invoice.number}</p><p className="text-xs text-[#817970]">{title(detail.invoice.status)}  -  {detail.invoice.payments.map((payment) => title(payment.method)).join(", ") || "No payment"}</p></div><strong className="text-xl text-[#203a36]">{inr.format(detail.invoice.total)}</strong></div><div className="mt-4 grid grid-cols-2 gap-3"><Info label="Paid" value={inr.format(detail.invoice.paid)} tone="green" /><Info label="Outstanding" value={inr.format(detail.invoice.outstanding)} tone={detail.invoice.outstanding > 0 ? "amber" : "green"} /></div></> : <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#ead8b4] bg-[#fff9eb] p-4"><p className="text-sm font-medium text-[#7c5a1e]">No invoice has been created for this appointment.</p>{detail.permissions.canSell && <button type="button" onClick={openSale} className="primary"><ReceiptText size={15} /> Create sale</button>}</div>}
          </Card>

          <Card title="Status history">
            <div className="space-y-3">{detail.history.length ? detail.history.map((entry) => <div key={entry.id} className="flex gap-3 border-l-2 border-[#d19a85] pl-4"><div><p className="text-sm font-bold">{title(entry.status)}</p><p className="text-xs text-[#817970]">{formatDateTime(entry.createdAt)}{entry.note ? `  -  ${entry.note}` : ""}</p></div></div>) : <Empty text="No status changes recorded yet." />}</div>
          </Card>

          {detail.permissions.canWrite && <Card title="Appointment actions">
            <div className="flex flex-wrap gap-2">{nextStatuses(detail.status).map((value) => <button type="button" key={value} onClick={() => void updateStatus(value)} className={`rounded-full border px-4 py-2 text-sm font-bold ${statusActionStyle(value)}`}>{title(value)}</button>)}<button type="button" onClick={() => setEditing((value) => !value)} className="rounded-full border border-[#203a36] bg-[#edf7f1] px-4 py-2 text-sm font-bold text-[#203a36]">{editing ? "Cancel edit" : "Reschedule or reassign"}</button></div>
            {editing && <form onSubmit={reschedule} className="mt-5 grid gap-3"><Field name="startsAt" label="New date and time" type="datetime-local" defaultValue={toIndiaDateTimeInput(detail.startsAt)} /><Select name="staffId" label="Primary professional" required={false} options={data.staff.filter((member) => member.branchIds.includes(detail.branch.id)).map((member) => [member.id, member.name])} /><Field name="notes" label="Internal notes" defaultValue={detail.notes || ""} required={false} /><button className="primary justify-center">Validate and save</button></form>}
          </Card>}
        </>}
      </div>
    </aside>
  </div>;
}

function CustomerProfileView({ customerId, data, submit, close, openAppointment }: { customerId: string; data: WorkspaceData; submit: SubmitFn; close: () => void; openAppointment: (id: string) => void }) {
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

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ branchId, page: String(page), pageSize: "20" });
    if (status) params.set("status", status);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    try {
      const response = await fetch(`/api/v1/operations/customers/${customerId}?${params}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Unable to load customer");
      setProfile(result.data);
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

  return <div className="space-y-5">
    <div className="flex flex-col justify-between gap-4 rounded-3xl bg-[#203a36] p-6 text-white sm:flex-row sm:items-center"><div><button type="button" onClick={close} className="text-xs font-bold text-[#d8ad9a]">Back to workspace</button><h2 className="mt-3 font-serif text-3xl">{profile?.customer.name || "Customer profile"}</h2><p className="mt-2 text-sm text-white/60">{profile?.customer.phone}{profile?.customer.email ? `  -  ${profile.customer.email}` : ""}</p></div><select value={branchId} onChange={(event) => { setBranchId(event.target.value); setPage(1); }} className="rounded-full bg-white px-4 py-2.5 text-sm font-bold text-[#252320]">{data.identity.role === "OWNER" && <option value="all">All salon branches</option>}{data.identity.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>
    {loading ? <SlotMessage text="Loading complete customer history..." loading /> : error ? <SlotMessage text={error} error /> : profile && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><Info label="Appointments" value={String(profile.summary.appointments)} tone="blue" /><Info label="Completed visits" value={String(profile.summary.completedVisits)} tone="green" /><Info label="Lifetime spend" value={inr.format(profile.summary.lifetimeSpend)} tone="green" /><Info label="Outstanding" value={inr.format(profile.summary.outstanding)} tone={profile.summary.outstanding > 0 ? "amber" : "green"} /><Info label="Loyalty" value={`${profile.summary.loyaltyBalance} pts / ${inr.format(profile.summary.rewardValue)}`} tone="violet" /><Info label="Wallet" value={inr.format(profile.summary.walletBalance)} tone="amber" /></div>
      <div className="flex gap-2 overflow-x-auto rounded-2xl bg-white p-2">{tabs.map((value) => <button type="button" key={value} onClick={() => setTab(value)} className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold ${tab === value ? "bg-[#203a36] text-white" : "text-[#817970]"}`}>{title(value)}</button>)}</div>
      {tab === "overview" && <div className="grid gap-5 lg:grid-cols-2"><Card title="Contact and profile"><div className="grid gap-3 sm:grid-cols-2"><Info label="Phone" value={profile.customer.phone} /><Info label="Email" value={profile.customer.email || "Not provided"} /><Info label="Birthday" value={profile.customer.birthday ? formatDate(new Date(profile.customer.birthday)) : "Not provided"} /><Info label="Customer since" value={formatDate(new Date(profile.customer.createdAt))} /></div><div className="mt-4 flex flex-wrap gap-2">{profile.customer.tags.map((tag) => <span key={tag} className="rounded-full bg-[#f1e7e2] px-3 py-1 text-xs font-bold text-[#9e5d55]">{tag}</span>)}</div></Card><Card title="Alerts and preferences"><p className="text-sm"><strong>Allergies:</strong> {profile.customer.allergies || "None recorded"}</p><p className="mt-3 text-sm"><strong>Notes:</strong> {profile.customer.notes || "None recorded"}</p><p className="mt-3 text-sm"><strong>Preferences:</strong> {profile.customer.preferences ? JSON.stringify(profile.customer.preferences) : "None recorded"}</p></Card></div>}
      {(tab === "appointments" || tab === "invoices") && <div className="grid gap-2 rounded-2xl bg-white p-4 md:grid-cols-4"><input className="field" type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} /><input className="field" type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} />{tab === "appointments" && <select className="field" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option>{["CONFIRMED", "CHECKED_IN", "IN_SERVICE", "COMPLETED", "CANCELLED", "NO_SHOW"].map((value) => <option key={value} value={value}>{title(value)}</option>)}</select>}<button type="button" onClick={() => { setDateFrom(""); setDateTo(""); setStatus(""); setPage(1); }} className="rounded-xl border border-black/10 px-4 text-sm font-bold">Clear filters</button></div>}
      {tab === "appointments" && <Card title="Appointments and visits">{profile.appointments.length ? profile.appointments.map((appointment) => <button type="button" key={appointment.id} onClick={() => openAppointment(appointment.id)} className="flex w-full items-center justify-between gap-4 border-t border-black/5 py-4 text-left first:border-0"><div><p className="font-bold">{appointment.services.join(", ")}</p><p className="mt-1 text-xs text-[#817970]">{formatDateTime(appointment.startsAt)}  -  {appointment.branchName}  -  {appointment.staff.join(", ")}</p></div><div className="flex items-center gap-2"><Status value={appointment.status} /><ChevronRight size={15} /></div></button>) : <Empty text="No appointments match these filters." />}<Pager page={page} total={profile.pagination.appointmentsTotal} pageSize={profile.pagination.pageSize} setPage={setPage} /></Card>}
      {tab === "invoices" && <Card title="Invoices and payments">{profile.invoices.length ? profile.invoices.map((invoice) => <div key={invoice.id} className="border-t border-black/5 py-4 first:border-0"><div className="flex justify-between gap-4"><div><p className="font-bold">{invoice.number}</p><p className="text-xs text-[#817970]">{formatDateTime(invoice.createdAt)}  -  {invoice.branchName}  -  {title(invoice.type)}</p></div><div className="text-right"><strong>{inr.format(invoice.total)}</strong><p className="text-xs text-[#817970]">{invoice.outstanding ? `${inr.format(invoice.outstanding)} outstanding` : "Paid"}</p></div></div><div className="mt-2 text-xs text-[#817970]">{invoice.lines.map((line) => `${line.description}  -  ${line.quantity}`).join("  -  ")}</div></div>) : <Empty text="No invoices match these filters." />}<Pager page={page} total={profile.pagination.invoicesTotal} pageSize={profile.pagination.pageSize} setPage={setPage} /></Card>}
      {tab === "loyalty" && <Card title="Loyalty ledger">{profile.loyalty.length ? profile.loyalty.map((entry) => <Row key={entry.id} primary={entry.reason} secondary={`${formatDateTime(entry.createdAt)}${entry.expiresAt ? `  -  Expires ${formatDate(new Date(entry.expiresAt))}` : ""}`} value={`${entry.points > 0 ? "+" : ""}${entry.points} pts`} />) : <Empty text="No loyalty activity." />}</Card>}
      {tab === "benefits" && <div className="grid gap-5 lg:grid-cols-3"><Card title="Memberships">{profile.memberships.length ? profile.memberships.map((item) => <Row key={item.id} primary={item.name} secondary={`${formatDate(new Date(item.startsAt))} - ${formatDate(new Date(item.endsAt))}`} value={title(item.status)} />) : <Empty text="No memberships." />}</Card><Card title="Packages">{profile.packages.length ? profile.packages.map((item) => <Row key={item.id} primary={item.name} secondary={`Expires ${formatDate(new Date(item.expiresAt))}`} value="View balance" />) : <Empty text="No packages." />}</Card><Card title="Gift cards">{profile.giftCards.length ? profile.giftCards.map((item) => <Row key={item.id} primary={item.code} secondary={`${item.branchName || "All branches"}  -  ${title(item.status)}`} value={inr.format(item.balance)} />) : <Empty text="No gift cards." />}</Card></div>}
      {tab === "balances" && <div className="grid gap-5 lg:grid-cols-[1fr_340px]"><Card title="Customer balance history">{profile.benefitTransactions.length ? profile.benefitTransactions.map((entry) => <div key={entry.id} className="flex items-center justify-between gap-4 border-t border-black/5 py-4 first:border-0"><div><p className="font-bold">{title(entry.kind)}</p><p className="mt-1 text-xs text-[#817970]">{formatDateTime(entry.createdAt)} ? {entry.note || entry.sourceType}</p></div><div className="text-right text-sm font-bold">{entry.points !== null ? `${entry.points > 0 ? "+" : ""}${entry.points} pts` : entry.amount !== null ? inr.format(entry.amount) : "-"}</div></div>) : <Empty text="No wallet, reward, package, gift card, membership, refund, or adjustment activity yet." />}</Card><Card title="Current balances"><div className="grid gap-3"><Info label="Wallet balance" value={inr.format(profile.summary.walletBalance)} tone="green" /><Info label="Loyalty points" value={`${profile.summary.loyaltyBalance} pts`} tone="violet" /><Info label="Reward value" value={inr.format(profile.summary.rewardValue)} tone="amber" /><Info label="Active gift cards" value={String(profile.giftCards.filter((card) => card.status === "ACTIVE" && card.balance > 0).length)} tone="blue" /></div></Card></div>}
      {tab === "notes" && <div className="grid gap-5 lg:grid-cols-[1fr_360px]"><Card title="Operational profile">{profile.permissions.canWrite ? <form onSubmit={save} className="grid gap-3 sm:grid-cols-2"><Field name="name" label="Name" defaultValue={profile.customer.name} /><Field name="email" label="Email" type="email" defaultValue={profile.customer.email || ""} required={false} /><Field name="birthday" label="Birthday" type="date" defaultValue={profile.customer.birthday?.slice(0, 10) || ""} required={false} /><Field name="allergies" label="Allergies and sensitivities" defaultValue={profile.customer.allergies || ""} required={false} /><Field name="tags" label="Tags" defaultValue={profile.customer.tags.join(", ")} required={false} /><Field name="notes" label="Notes and preferences" defaultValue={profile.customer.notes || ""} required={false} /><div className="grid gap-2 text-sm"><label><input type="checkbox" name="whatsappConsent" defaultChecked={profile.customer.whatsappConsent} /> WhatsApp consent</label><label><input type="checkbox" name="smsConsent" defaultChecked={profile.customer.smsConsent} /> SMS consent</label><label><input type="checkbox" name="emailConsent" defaultChecked={profile.customer.emailConsent} /> Email consent</label></div><button className="primary justify-center sm:col-span-2">Save customer profile</button></form> : <p className="text-sm text-[#817970]">This profile is read-only for your role.</p>}</Card><Card title="Communications"><p className="text-sm text-[#817970]">Communication history is unavailable until SMS, WhatsApp, and email delivery records are linked directly to customer profiles.</p></Card></div>}
    </>}
  </div>;
}

function ServiceProfileView({ serviceId, data, close, openAppointment }: { serviceId: string; data: WorkspaceData; close: () => void; openAppointment: (id: string) => void }) {
  const [profile, setProfile] = useState<ServiceProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const branchId = data.identity.branchId || "all";
    queueMicrotask(() => setLoading(true));
    fetch(`/api/v1/operations/services/${serviceId}?branchId=${encodeURIComponent(branchId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => ({ response, result: await response.json() }))
      .then(({ response, result }) => {
        if (!response.ok) throw new Error(result.error?.message || "Unable to load service");
        setProfile(result.data);
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
    <div className="rounded-3xl bg-[#203a36] p-6 text-white"><button type="button" onClick={close} className="text-xs font-bold text-[#d8ad9a]">Back to workspace</button><div className="mt-3 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-white/50">{profile?.service.category || "Service"}</p><h2 className="mt-2 font-serif text-3xl">{profile?.service.name || "Service profile"}</h2><p className="mt-2 max-w-2xl text-sm text-white/60">{profile?.service.description || "No service description has been added."}</p></div>{profile && <div className="flex gap-2"><Status value={profile.service.isActive ? "ACTIVE" : "ARCHIVED"} /><Status value={profile.service.onlineBooking ? "ONLINE" : "IN_SALON_ONLY"} /></div>}</div></div>
    {loading ? <SlotMessage text="Loading service operations..." loading /> : error ? <SlotMessage text={error} error /> : profile && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><Info label="Master price" value={inr.format(profile.service.price)} tone="green" /><Info label="Duration" value={`${profile.service.durationMinutes} min`} tone="blue" /><Info label="GST" value={`${profile.service.taxRate}%`} tone="rose" /><Info label="Bookings" value={String(profile.metrics.bookings)} tone="blue" /><Info label="Completion" value={`${profile.metrics.completed}/${profile.metrics.bookings}`} tone="green" /><Info label="Recorded revenue" value={inr.format(profile.metrics.revenue)} tone="green" /></div>
      <div className="grid gap-5 xl:grid-cols-2"><Card title="Branch pricing and availability">{profile.branchOverrides.length ? profile.branchOverrides.map((override) => <div key={override.branchId} className="grid grid-cols-2 gap-3 border-t border-black/5 py-4 first:border-0 sm:grid-cols-5"><div className="col-span-2 font-bold sm:col-span-1">{override.branchName}</div><span>{inr.format(override.price)}</span><span>{override.durationMinutes} min</span><span>{override.taxRate}% GST</span><Status value={override.isActive ? "ACTIVE" : "INACTIVE"} /></div>) : <Empty text="No branch overrides are configured." />}</Card><Card title="Qualified professionals">{profile.qualifiedStaff.length ? profile.qualifiedStaff.map((member) => <Row key={member.id} primary={member.name} secondary={member.branchNames.join(", ")} value={member.role} />) : <Empty text="No qualified professionals are assigned." />}</Card></div>
      <Card title="Booking performance"><div className="grid gap-3 sm:grid-cols-4"><Info label="Completed" value={String(profile.metrics.completed)} tone="green" /><Info label="Cancelled" value={String(profile.metrics.cancelled)} tone="rose" /><Info label="No-shows" value={String(profile.metrics.noShows)} tone="amber" /><Info label="Average selling price" value={inr.format(profile.metrics.averageSellingPrice)} tone="blue" /></div></Card>
      <Card title="Recent service history">{profile.appointments.length ? profile.appointments.map((appointment) => <button type="button" key={`${appointment.id}-${appointment.startsAt}`} onClick={() => openAppointment(appointment.id)} className="flex w-full items-center justify-between gap-4 border-t border-black/5 py-4 text-left first:border-0"><div><p className="font-bold">{appointment.customerName}</p><p className="text-xs text-[#817970]">{formatDateTime(appointment.startsAt)}  -  {appointment.branchName}  -  {appointment.staffName}</p></div><div className="flex items-center gap-3"><strong>{inr.format(appointment.price)}</strong><Status value={appointment.status} /><ChevronRight size={15} /></div></button>) : <Empty text="No booking history for this service." />}</Card>
      {profile.permissions.canEdit && <p className="rounded-2xl bg-[#e8efe9] p-4 text-sm font-bold text-[#315b4c]">You can edit this service and its branch overrides from the Services workspace.</p>}
    </>}
  </div>;
}

function Pager({ page, total, pageSize, setPage }: { page: number; total: number; pageSize: number; setPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return <div className="mt-5 flex items-center justify-between border-t border-black/8 pt-4 text-sm"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border px-3 py-2 font-bold disabled:opacity-40">Previous</button><span>Page {page} of {pages}</span><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded-lg border px-3 py-2 font-bold disabled:opacity-40">Next</button></div>;
}

function Card({ title: heading, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) { return <section className="surface-card rounded-[1.75rem] p-5 sm:p-6"><div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><h2 className="flex items-center gap-3 font-serif text-2xl font-semibold tracking-tight"><span className="gold-divider h-8 w-1.5 rounded-full shadow-[0_0_18px_rgba(214,179,94,.32)]" />{heading}</h2>{action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}</div>{children}</section>; }
function MiniBars({ items, money }: { items: Array<{ label: string; value: number }>; money?: boolean }) {
  const maximum = Math.max(...items.map((item) => item.value), 1);
  return <div className="space-y-3">{items.length ? items.map((item) => <div key={item.label} className="grid grid-cols-[100px_1fr_auto] items-center gap-3 text-xs"><span className="truncate font-bold">{title(item.label)}</span><div className="h-2.5 overflow-hidden rounded-full bg-[#eee2c4]"><div className="h-full rounded-full bg-gradient-to-r from-[#d6b35e] via-[#d19a85] to-[#9e5d55]" style={{ width: `${Math.max(4, item.value / maximum * 100)}%` }} /></div><strong>{money ? inr.format(item.value) : item.value}</strong></div>) : <Empty text="No data for this period." />}</div>;
}
function Avatar({ name, dark }: { name: string; dark?: boolean }) { return <div className={`grid size-10 shrink-0 place-items-center rounded-full text-xs font-extrabold ring-2 ${dark ? "bg-[#0e0c09] text-[#d6b35e] ring-[#d6b35e]/45" : "bg-gradient-to-br from-[#d6b35e] to-[#9e5d55] text-white ring-white/50"}`}>{initials(name)}</div>; }
function Banner({ tone, text, onClose }: { tone: "success" | "error"; text: string; onClose: () => void }) { return <div className={`mb-5 flex items-center justify-between rounded-2xl border px-5 py-3 text-sm font-bold shadow-sm ${tone === "success" ? "border-[#b9d9c7] bg-[#e6f5ec] text-[#285543]" : "border-[#e5b8ae] bg-[#fff0ec] text-[#995849]"}`}><span>{text}</span><button className="grid size-8 place-items-center rounded-full bg-white/55" onClick={onClose}><X size={16} /></button></div>; }
function Status({ value }: { value: string }) {
  const styles: Record<string, string> = {
    COMPLETED: "border-[#b9d9c7] bg-[#e1f2e8] text-[#286044]",
    PAID: "border-[#b9d9c7] bg-[#e1f2e8] text-[#286044]",
    ACTIVE: "border-[#b9d9c7] bg-[#e1f2e8] text-[#286044]",
    APPROVED: "border-[#b9d9c7] bg-[#e1f2e8] text-[#286044]",
    AVAILABLE: "border-[#b9d9c7] bg-[#e1f2e8] text-[#286044]",
    HEALTHY: "border-[#b9d9c7] bg-[#e1f2e8] text-[#286044]",
    CONFIRMED: "border-[#bdd1e8] bg-[#e7f0fa] text-[#315d89]",
    ONLINE: "border-[#bdd1e8] bg-[#e7f0fa] text-[#315d89]",
    CHECKED_IN: "border-[#cfc4e4] bg-[#efe9f8] text-[#674d8c]",
    IN_SERVICE: "border-[#cfc4e4] bg-[#efe9f8] text-[#674d8c]",
    PENDING: "border-[#e0c26e] bg-[#fff7df] text-[#7b5514]",
    PARTIALLY_PAID: "border-[#e0c26e] bg-[#fff7df] text-[#7b5514]",
    CANCELLED: "border-[#e5b8ae] bg-[#f9e7e3] text-[#984f43]",
    NO_SHOW: "border-[#e5b8ae] bg-[#f9e7e3] text-[#984f43]",
    REJECTED: "border-[#e5b8ae] bg-[#f9e7e3] text-[#984f43]",
    VOID: "border-[#e5b8ae] bg-[#f9e7e3] text-[#984f43]",
    ARCHIVED: "border-[#d4cec7] bg-[#eeeae5] text-[#6f6861]",
    INACTIVE: "border-[#d4cec7] bg-[#eeeae5] text-[#6f6861]",
    LOW_STOCK: "border-[#ead39c] bg-[#fff3d5] text-[#865c12]",
    ON_LEAVE: "border-[#ead39c] bg-[#fff3d5] text-[#865c12]",
  };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-extrabold shadow-sm ${styles[value] || "border-[#ead39c] bg-[#fff3d5] text-[#865c12]"}`}>{title(value)}</span>;
}
function Source({ value }: { value: string }) {
  const styles: Record<string, string> = {
    MARKETPLACE: "border-[#bdd1e8] bg-[#e7f0fa] text-[#315d89]",
    SALON_WEBSITE: "border-[#cfc4e4] bg-[#efe9f8] text-[#674d8c]",
    PHONE: "border-[#ead39c] bg-[#fff3d5] text-[#865c12]",
    WALK_IN: "border-[#b9d9c7] bg-[#e1f2e8] text-[#286044]",
    STAFF_CREATED: "border-[#e5b8ae] bg-[#f9e7e3] text-[#984f43]",
  };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${styles[value] || "border-[#d4cec7] bg-[#eeeae5] text-[#6f6861]"}`}>{title(value)}</span>;
}
function Row({ primary, secondary, value, onClick }: { primary: string; secondary: string; value: string; onClick?: () => void }) {
  const content = <><div><p className="text-sm font-bold">{primary}</p><p className="text-xs text-[#817970]">{secondary}</p></div><strong className="rounded-full bg-[#fff6df] px-3 py-1 text-xs text-[#7b5514]">{value}</strong></>;
  return onClick
    ? <button type="button" onClick={onClick} className="flex w-full items-center justify-between gap-4 border-t border-[#e8deca] py-3 text-left transition first:border-0 hover:bg-[#fff8ec]">{content}</button>
    : <div className="flex items-center justify-between gap-4 border-t border-[#e8deca] py-3 first:border-0">{content}</div>;
}
function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-[#d8c9a4] bg-[#fffaf0] px-5 py-8 text-center text-sm font-semibold text-[#8a827a]">{text}</div>; }
function Info({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "green" | "blue" | "amber" | "rose" | "violet" }) {
  const styles = {
    neutral: "border-[#e7e0d8] bg-[#f7f4ef] text-[#252320]",
    green: "border-[#c7dfd1] bg-[#edf7f1] text-[#285b43]",
    blue: "border-[#cadced] bg-[#eef5fc] text-[#315d89]",
    amber: "border-[#ecd7a7] bg-[#fff7df] text-[#865c12]",
    rose: "border-[#e9c2b9] bg-[#fff0ec] text-[#984f43]",
    violet: "border-[#d8cdea] bg-[#f5effc] text-[#674d8c]",
  };
  return <div className={`rounded-2xl border p-4 shadow-sm ${styles[tone]}`}><p className="text-xs font-bold uppercase tracking-[0.12em] opacity-70">{label}</p><p className="mt-2 text-lg font-extrabold">{value}</p></div>;
}
function metricTone(tone: string) {
  return ({
    money: "bg-[#fff4d0] text-[#8a6214]",
    info: "bg-[#e7f0fa] text-[#255985]",
    rose: "bg-[#fff0ec] text-[#984f43]",
    gold: "bg-[#f4e6bd] text-[#735017]",
  } as Record<string, string>)[tone] || "bg-[#edf7f1] text-[#285b43]";
}
function Step({ number, title: text }: { number: string; title: string }) { return <div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full bg-[#f4e6bd] text-xs font-extrabold text-[#7b5514]">{number}</span><h3 className="font-serif text-xl font-semibold">{text}</h3></div>; }
function SlotMessage({ text, loading, error }: { text: string; loading?: boolean; error?: boolean }) { return <div className={`flex min-h-24 items-center justify-center rounded-2xl border border-dashed p-5 text-center text-sm font-semibold ${error ? "border-[#c98274] bg-[#fff4f1] text-[#995849]" : "border-[#d8c9a4] bg-[#fffaf0] text-[#817970]"}`}>{loading && <RefreshCw size={16} className="mr-2 animate-spin" />}{text}</div>; }
function Summary({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4"><span className="text-white/50">{label}</span><strong className="text-right">{value}</strong></div>; }
function Field(props: { name: string; label: string; type?: string; defaultValue?: string; required?: boolean }) { return <label className="text-sm font-bold text-[#3a332b]"><span className="flex items-center gap-1">{props.label}{props.required === false && <span className="text-xs font-semibold text-[#9a8f82]">Optional</span>}</span><input name={props.name} type={props.type || "text"} defaultValue={props.defaultValue} required={props.required !== false} step={props.type === "number" ? "0.01" : undefined} className="field mt-2" /></label>; }
function Select({ name, label, options, required = true }: { name: string; label: string; options: string[][]; required?: boolean }) { return <label className="text-sm font-bold text-[#3a332b]">{label}<select name={name} required={required} className="field mt-2"><option value="">Select</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>; }
function title(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDate(date: Date) { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(date); }
function formatTime(value: string) { return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(value)); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value)); }
function openInvoicePrintWindow(detail: InvoiceDetail) {
  const popup = window.open("", "_blank", "width=920,height=1100");
  if (!popup) {
    window.print();
    return;
  }
  const rows = detail.lines.map((line, index) => `<tr><td>${index + 1}</td><td><strong>${escapeHtml(line.description)}</strong><br><small>${escapeHtml(title(line.type))} | Qty ${line.quantity} | ${escapeHtml(line.staff || "No staff")}</small></td><td>${inr.format(line.unitPrice)}</td><td>${inr.format(line.discount)}</td><td>${line.taxRate}%</td><td>${inr.format(line.total)}</td></tr>`).join("");
  const payments = detail.payments.map((payment) => `<p><span>${escapeHtml(title(payment.method))}</span><strong>${inr.format(payment.amount)}</strong></p>`).join("") || "<p><span>No payments recorded</span><strong>-</strong></p>";
  popup.document.write(`<!doctype html><html><head><title>${escapeHtml(detail.number)}</title><style>
    *{box-sizing:border-box}body{margin:0;background:#f7f1e7;color:#1d1812;font-family:Arial,sans-serif}.invoice{max-width:820px;margin:24px auto;background:#fffaf0;border:1px solid #d8c9a4;border-radius:28px;overflow:hidden;box-shadow:0 20px 70px rgba(45,34,20,.16)}.head{background:#0e0c09;color:white;padding:34px}.brand{color:#d6b35e;font-size:12px;font-weight:800;letter-spacing:.22em;text-transform:uppercase}h1{font-family:Georgia,serif;font-size:40px;margin:10px 0 6px}.muted{color:#756e67}.head .muted{color:rgba(255,255,255,.62)}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:24px}.box{border:1px solid #e8deca;border-radius:18px;background:white;padding:16px}.label{color:#9e7a2e;font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}table{width:calc(100% - 48px);margin:0 24px 24px;border-collapse:collapse;background:white;border-radius:18px;overflow:hidden}th,td{border-bottom:1px solid #eee4d1;padding:12px;text-align:left;font-size:13px}th{background:#fff4d0;color:#6b4b14;text-transform:uppercase;font-size:11px;letter-spacing:.12em}td:last-child,th:last-child{text-align:right}.totals{margin:0 24px 24px;background:#0e0c09;color:white;border-radius:20px;padding:18px}.totals p,.pay p{display:flex;justify-content:space-between;margin:8px 0}.total{border-top:1px solid rgba(255,255,255,.16);padding-top:12px;font-size:22px}.pay{margin:0 24px 24px}.thanks{text-align:center;padding:0 24px 30px;color:#756e67;font-size:12px}@media print{body{background:white}.invoice{margin:0;box-shadow:none;border-radius:0;max-width:none}.actions{display:none}}
  </style></head><body><main class="invoice"><section class="head"><div class="brand">Neel Bridal Studio</div><h1>${escapeHtml(detail.number)}</h1><p class="muted">${escapeHtml(detail.taxMode === "GST" ? "GST invoice" : "Non-GST invoice")} | ${escapeHtml(formatDateTime(detail.createdAt))}</p><p class="muted">${escapeHtml(detail.branch.name)}${detail.branch.city ? `, ${escapeHtml(detail.branch.city)}` : ""}</p></section><section class="grid"><div class="box"><div class="label">Bill to</div><h3>${escapeHtml(detail.customer.name)}</h3><p class="muted">${escapeHtml(detail.customer.phone)}${detail.customer.email ? ` | ${escapeHtml(detail.customer.email)}` : ""}</p></div><div class="box"><div class="label">Status</div><h3>${escapeHtml(title(detail.status))}</h3><p class="muted">Paid ${inr.format(detail.paid)} | Due ${inr.format(detail.outstanding)}</p></div></section><table><thead><tr><th>#</th><th>Item</th><th>Rate</th><th>Discount</th><th>Tax</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><section class="totals"><p><span>Subtotal</span><strong>${inr.format(detail.subtotal)}</strong></p><p><span>Discount</span><strong>-${inr.format(detail.discount)}</strong></p><p><span>${detail.taxMode === "GST" ? "GST" : "Tax"}</span><strong>${inr.format(detail.tax)}</strong></p><p><span>Tip</span><strong>${inr.format(detail.tip)}</strong></p><p class="total"><span>Total</span><strong>${inr.format(detail.total)}</strong></p></section><section class="pay"><div class="label">Payments</div>${payments}</section><p class="thanks">Thank you for choosing Neel Bridal Studio.</p></main><script>window.onload=()=>setTimeout(()=>window.print(),250)</script></body></html>`);
  popup.document.close();
}
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] || character));
}
function toIndiaDateTimeInput(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const record = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${record.year}-${record.month}-${record.day}T${record.hour}:${record.minute}`;
}
function timeToMinutes(value: string) { const [hours, minutes] = value.split(":").map(Number); return hours * 60 + minutes; }
function minutesToTime(value: number) { return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`; }
function minutesInIndia(value: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(value));
  const record = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(record.hour) * 60 + Number(record.minute);
}
function formatClockMinute(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}
function nextStatuses(status: string) { return ({ CONFIRMED: ["CHECKED_IN", "CANCELLED", "NO_SHOW"], CHECKED_IN: ["IN_SERVICE", "CANCELLED"], IN_SERVICE: ["COMPLETED", "CANCELLED"] } as Record<string, string[]>)[status] || []; }
function appointmentCardStyle(status: string) {
  return ({
    CONFIRMED: "border-l-[#4c7cab] bg-[#eaf3fc] text-[#294f79]",
    CHECKED_IN: "border-l-[#8264aa] bg-[#f2ecfa] text-[#604681]",
    IN_SERVICE: "border-l-[#8264aa] bg-[#eee6f8] text-[#604681]",
    COMPLETED: "border-l-[#3f7c5d] bg-[#e8f5ed] text-[#285b43]",
    CANCELLED: "border-l-[#bd6758] bg-[#fbece8] text-[#8f493e]",
    NO_SHOW: "border-l-[#b47a18] bg-[#fff4d9] text-[#7b5514]",
  } as Record<string, string>)[status] || "border-l-[#9b9187] bg-[#f3f0ec] text-[#625b54]";
}
function statusActionStyle(status: string) {
  return ["CANCELLED", "NO_SHOW"].includes(status)
    ? "border-[#e5b8ae] bg-[#fff0ec] text-[#984f43]"
    : status === "COMPLETED"
    ? "border-[#b9d9c7] bg-[#edf7f1] text-[#286044]"
      : "border-[#cfc4e4] bg-[#f5effc] text-[#674d8c]";
}
function modalTitle(name: Exclude<ModalName, null>) { return ({ appointment: "New appointment", customer: "Add customer", service: "New service", stock: "Stock movement", expense: "Add expense", leave: "Record leave", staff: "Add team member" } as const)[name]; }
function canOpen(role: string, item: NavItem) {
  const access: Record<string, NavItem[]> = {
    OWNER: [...navItems],
    MANAGER: [...navItems],
    RECEPTIONIST: ["Overview", "Calendar", "Customers", "Point of sale"],
    STYLIST: ["Overview", "Calendar", "Customers"],
    ACCOUNTANT: ["Overview", "Point of sale", "Inventory", "Team", "Reports"],
  };
  return (access[role] || ["Overview"]).includes(item);
}
