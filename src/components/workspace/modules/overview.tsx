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
import { inr, initials } from "@/lib/format";
import type { AppointmentDetail, CustomerProfile, ServiceProfile, WorkspaceData } from "@/lib/operations-types";

import { AppointmentItem, NavItem, SubmitFn } from "@/components/workspace/contracts";
import { AttendanceClock } from "@/components/workspace/modules/attendance-clock";
import { Avatar, Card, Empty, Source, Status, appointmentPriorityLabel, appointmentQueuePriorityStyle, appointmentQueueRank, canOpen, formatDateTime, formatTime, isAppointmentTerminal, title } from "@/components/workspace/shared-ui";

export type DashboardTone = "green" | "blue" | "cyan" | "amber" | "rose" | "violet" | "slate";

export type RoleDashboardConfig = {
  eyebrow: string;
  headline: string;
  summary: string;
  queueTitle: string;
  focusLabel: string;
  focusModule: NavItem;
};

export type DashboardMetricItem = {
  label: string;
  value: string;
  numeric?: number;
  money?: boolean;
  helper: string;
  icon: LucideIcon;
  target: NavItem;
  tone: DashboardTone;
};

export type DashboardAlertItem = {
  title: string;
  detail: string;
  tone: DashboardTone;
  icon: LucideIcon;
  actionLabel?: string;
  onClick?: () => void;
};

export function Overview({ data, navigate, openInvoice, submit }: { data: WorkspaceData; navigate: (item: NavItem) => void; openInvoice: (invoiceId?: string) => void; submit: SubmitFn }) {
  const role = data.identity.role;
  const config = roleDashboardConfig(role);
  const lowStockItems = data.inventory.filter((item) => item.quantity <= item.reorderLevel);
  const outstandingInvoices = data.recentInvoices.filter((invoice) => invoice.total - invoice.paid > 0);
  const outstandingAmount = Math.max(data.metrics.outstandingAmount, outstandingInvoices.reduce((sum, invoice) => sum + Math.max(0, invoice.total - invoice.paid), 0));
  const issueAppointments = data.appointments.filter((appointment) => ["CANCELLED", "NO_SHOW"].includes(appointment.status));
  const sortedAppointments = [...data.appointments].sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
  const activeSession = data.registerSessions.find((session) => session.status === "OPEN");
  const kpis = dashboardKpis(data, outstandingAmount, activeSession?.status || "NOT_OPENED", role);
  const visibleKpis = kpis.filter((metric) => canOpen(role, metric.target)).slice(0, role === "STYLIST" ? 4 : 6);
  const alerts = dashboardAlerts(data, lowStockItems, outstandingInvoices, issueAppointments, navigate, openInvoice);

  return <div className="dashboard-shell space-y-5 pb-2 font-sans">
    {/* Every staff member lands here, whatever their role - so this is where checking in belongs.
        A stylist has no access to the Team screen, and asking them to hunt for a punch clock is how
        attendance quietly stops being used. The card returns null for anyone who is not on the
        roster (an owner with no staff profile). */}
    <AttendanceClock data={data} submit={submit} />

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6" aria-label="Dashboard metrics">
      {visibleKpis.map((metric, index) => <DashboardKpiCard key={metric.label} metric={metric} delay={index * 70} onClick={() => navigate(metric.target)} />)}
    </section>

    <div className="grid gap-4 xl:grid-cols-12">
      <div className="xl:col-span-5">
      <Card title={config.queueTitle} action={<button type="button" onClick={() => navigate("Appointments")} className="text-xs font-medium text-[#5B2A86]">View all</button>}>
        <DashboardAppointmentQueue items={sortedAppointments} navigate={navigate} />
      </Card>
      </div>
      <div className="xl:col-span-3">
      <DashboardAlertPanel alerts={alerts} />
      </div>
      <div className="xl:col-span-4">
      <Card title="Sales trend" action={<span className="inline-flex items-center gap-2 text-xs font-medium text-[#6B7280]"><span className="size-2 rounded-full bg-[#5B2A86]" />Invoice sales</span>}>
        <DashboardRevenuePulse items={data.trends.revenue} />
      </Card>
      </div>
    </div>

    <section className="grid gap-4 xl:grid-cols-12">
      <div className="xl:col-span-3">
      <Card title="Booking Source Mix">
        <DashboardSourceMix items={data.trends.bookingSource} />
      </Card>
      </div>
      <div className="xl:col-span-3">
      <Card title="Appointment Status">
        <DashboardStatusTiles items={data.trends.appointmentStatus} />
      </Card>
      </div>
      <div className="xl:col-span-6">
      <Card title="Recent invoices" action={<button type="button" onClick={() => openInvoice()} className="text-xs font-medium text-[#5B2A86]">View all</button>}>
        <DashboardInvoiceTable invoices={data.recentInvoices} openInvoice={openInvoice} />
      </Card>
      </div>
    </section>

    <section className="grid gap-4 xl:grid-cols-12">
      <div className="xl:col-span-4">
        <Card title="Team & Stock">
          <DashboardTeamStock staff={data.staff} lowStockItems={lowStockItems} navigate={navigate} />
        </Card>
      </div>
      <div className="xl:col-span-8">
        <Card title="Top Services" action={<button type="button" onClick={() => navigate("Reports")} className="text-xs font-medium text-[#5B2A86]">Full report</button>}>
          <DashboardTopServices items={data.trends.topServices} />
        </Card>
      </div>
    </section>

  </div>;
}

export function DashboardKpiCard({ metric, delay, onClick }: { metric: DashboardMetricItem; delay: number; onClick: () => void }) {
  const Icon = metric.icon;
  return <button type="button" onClick={onClick} aria-label={`${metric.label}: ${metric.value}. ${metric.helper}`} style={{ animationDelay: `${delay}ms` }} className="dashboard-kpi-card dashboard-fade-slide-up group rounded-lg border border-[#E8EAF0] bg-white px-4 py-4 text-left transition hover:border-[#5B2A86]/30 hover:bg-[#FBFAFC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5B2A86]">
    <div className="flex items-start justify-between gap-3">
      <span className="min-w-0 truncate text-sm font-medium text-[#6B7280]">{metric.label}</span>
      <span className={`grid size-7 shrink-0 place-items-center rounded-md bg-[#F6F7FB] ${dashboardToneTextClass(metric.tone)}`}><Icon size={14} /></span>
    </div>
    <strong className="mt-3 block truncate text-2xl font-bold leading-none tracking-tight text-[#171717]">
      <AnimatedNumber value={metric.value} numeric={metric.numeric} money={metric.money} />
    </strong>
    <span className={`mt-3 block truncate text-xs font-medium ${dashboardToneTextClass(metric.tone)}`}>{metric.helper}</span>
  </button>;
}

export function DashboardAlertPanel({ alerts }: { alerts: DashboardAlertItem[] }) {
  return <section className="surface-card dashboard-fade-slide-up min-w-0 overflow-hidden rounded-lg border border-[#E8EAF0] bg-white p-4" style={{ animationDelay: "140ms" }}>
    <div className="mb-4 flex items-center justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6B7280]">Alerts</p>
        <h2 className="mt-1 text-base font-semibold tracking-tight text-[#171717]">Needs attention</h2>
      </div>
      <span className="grid size-8 place-items-center rounded-md bg-[#FEF3C7] text-[#F59E0B]"><AlertTriangle size={16} /></span>
    </div>
    <div className="space-y-2.5">
      {alerts.map((alert, index) => {
        const Icon = alert.icon;
        const content = <div className="flex items-start gap-3">
          <span className={`grid size-8 shrink-0 place-items-center rounded-md ${dashboardToneClass(alert.tone)}`}><Icon size={15} /></span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-[#171717]">{alert.title}</span>
            <span className="mt-0.5 block text-xs leading-5 text-[#6B7280]">{alert.detail}</span>
            {alert.actionLabel && <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#5B2A86]">{alert.actionLabel} <ArrowUpRight size={12} /></span>}
          </span>
        </div>;
        return alert.onClick ? <button key={`${alert.title}-${index}`} type="button" onClick={alert.onClick} className="w-full rounded-md border border-[#E8EAF0] bg-[#F6F7FB] p-3 text-left transition hover:border-[#5B2A86]/25 hover:bg-white">{content}</button> : <div key={`${alert.title}-${index}`} className="rounded-md border border-[#E8EAF0] bg-[#F6F7FB] p-3">{content}</div>;
      })}
    </div>
  </section>;
}

export function DashboardMiniBars({ items, money }: { items: Array<{ label: string; value: number }>; money?: boolean }) {
  const maximum = Math.max(...items.map((item) => item.value), 1);
  if (!items.length) return <Empty text="No data for this period." />;
  return <div className="space-y-3">
    {items.map((item, index) => {
      const percentage = Math.max(4, item.value / maximum * 100);
      return <div key={item.label} className="space-y-2">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="min-w-0 truncate font-medium text-[#171717]">{title(item.label)}</span>
          <strong className="whitespace-nowrap font-semibold text-[#5B2A86]">{money ? inr.format(item.value) : item.value.toLocaleString("en-IN")}</strong>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-[#F1F2F6]">
          <div className="dashboard-bar-grow h-full rounded-full bg-[#5B2A86]" style={{ width: `${percentage}%`, animationDelay: `${index * 80}ms` }} />
        </div>
      </div>;
    })}
  </div>;
}

export function DashboardRevenuePulse({ items }: { items: Array<{ label: string; value: number }> }) {
  const visible = items.slice(-7);
  const maximum = Math.max(...visible.map((item) => item.value), 1);
  if (!visible.length) return <Empty text="No revenue data yet." />;
  const periodTotal = visible.reduce((sum, item) => sum + item.value, 0);
  const bestDay = visible.reduce((best, item) => item.value > best.value ? item : best, visible[0]);
  return <div>
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6B7280]">Last {visible.length} days</p>
        <p className="mt-1 text-sm font-medium text-[#111827]">Daily billed sales from invoices</p>
      </div>
      <span className="rounded-full bg-[#F3E8FF] px-3 py-1 text-xs font-bold text-[#5B2A86]">Live</span>
    </div>
    <div className="mt-5 grid grid-cols-7 items-end gap-2">
      {visible.map((item, index) => {
        const height = Math.max(22, item.value / maximum * 92);
        return <div key={`${item.label}-${index}`} className="flex min-w-0 flex-col items-center gap-2">
          <div className="group relative flex h-28 items-end">
            <span className="dashboard-bar-grow w-7 rounded-t-xl bg-gradient-to-t from-[#5B2A86] to-[#A855F7] shadow-sm transition group-hover:from-[#4B1F72] group-hover:to-[#9333EA]" style={{ height, animationDelay: `${index * 70}ms` }} />
            <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#111827] px-2 py-1 text-[10px] font-bold text-white shadow-lg group-hover:block">{inr.format(item.value)}</span>
          </div>
          <span className="max-w-full truncate text-[11px] font-medium text-[#6B7280]">{item.label}</span>
        </div>;
      })}
    </div>
    <div className="mt-5 border-t border-[#E8EAF0] pt-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-bold tracking-tight text-[#171717]">{inr.format(periodTotal)}</p>
          <p className="text-xs text-[#6B7280]">Last {visible.length} days sales</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6B7280]">Best day</p>
          <p className="text-sm font-bold text-[#111827]">{bestDay.label} · {inr.format(bestDay.value)}</p>
        </div>
      </div>
    </div>
  </div>;
}

export function DashboardSourceMix({ items }: { items: Array<{ label: string; value: number }> }) {
  const total = Math.max(items.reduce((sum, item) => sum + item.value, 0), 1);
  const colors = ["#5B2A86", "#D4A574", "#3B82F6", "#10B981", "#F59E0B"];
  if (!items.length) return <Empty text="No booking source data yet." />;
  return <div>
    <div className="flex h-4 overflow-hidden rounded-full bg-[#F1F2F6]">
      {items.map((item, index) => <span key={item.label} className="h-full" style={{ width: `${item.value / total * 100}%`, backgroundColor: colors[index % colors.length] }} />)}
    </div>
    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
      {items.slice(0, 4).map((item, index) => <div key={item.label} className="flex items-center justify-between gap-2 text-sm">
        <span className="flex min-w-0 items-center gap-2 text-[#6B7280]"><span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} /><span className="truncate">{title(item.label)}</span></span>
        <strong className="text-[#171717]">{Math.round(item.value / total * 100)}%</strong>
      </div>)}
    </div>
  </div>;
}

export function DashboardStatusTiles({ items }: { items: Array<{ label: string; value: number }> }) {
  const preferred = ["COMPLETED", "CONFIRMED", "CANCELLED", "WAITLISTED", "CHECKED_IN", "IN_SERVICE", "NO_SHOW"];
  const ordered = [...items].sort((left, right) => preferred.indexOf(left.label) - preferred.indexOf(right.label)).slice(0, 4);
  const styleFor = (label: string) => {
    if (["COMPLETED"].includes(label)) return "bg-[#D1FAE5] text-[#047857]";
    if (["CONFIRMED", "CHECKED_IN", "IN_SERVICE"].includes(label)) return "bg-[#FEF3C7] text-[#B45309]";
    if (["CANCELLED", "NO_SHOW"].includes(label)) return "bg-[#FEE2E2] text-[#B91C1C]";
    return "bg-[#DBEAFE] text-[#2563EB]";
  };
  if (!ordered.length) return <Empty text="No appointment status data yet." />;
  return <div className="grid grid-cols-2 gap-3">
    {ordered.map((item) => <div key={item.label} className={`rounded-lg p-4 ${styleFor(item.label)}`}>
      <p className="text-sm font-semibold">{title(item.label)}</p>
      <p className="mt-3 text-2xl font-bold tracking-tight">{item.value}</p>
    </div>)}
  </div>;
}

export function AnimatedNumber({ value, numeric, money }: { value: string; numeric?: number; money?: boolean }) {
  const [display, setDisplay] = useState(numeric ?? 0);
  useEffect(() => {
    if (numeric === undefined) return;
    const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      setDisplay(numeric);
      return;
    }
    const start = performance.now();
    const duration = 760;
    let frame = 0;
    const tick = (time: number) => {
      const progress = Math.min((time - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(numeric * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [numeric]);
  if (numeric === undefined) return <>{value}</>;
  return <>{money ? inr.format(display) : Math.round(display).toLocaleString("en-IN")}</>;
}

export function DashboardAppointmentQueue({ items, navigate }: { items: AppointmentItem[]; navigate: (item: NavItem) => void }) {
  const now = Date.now();
  const nextAppointmentId = [...items]
    .filter((item) => item.status === "CONFIRMED" && new Date(item.startsAt).getTime() > now)
    .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime())[0]?.id;
  const visible = [...items]
    .sort((left, right) => {
      const rankDifference = appointmentQueueRank(left, now) - appointmentQueueRank(right, now);
      if (rankDifference) return rankDifference;
      const leftTime = new Date(left.startsAt).getTime();
      const rightTime = new Date(right.startsAt).getTime();
      return isAppointmentTerminal(left.status) ? rightTime - leftTime : leftTime - rightTime;
    })
    .slice(0, 6);
  if (!visible.length) return <Empty text="No appointments for this view." />;
  return <div className="space-y-2.5">
    {visible.map((item) => {
      const emphasis = appointmentPriorityLabel(item, item.id === nextAppointmentId, now);
      const priorityStyle = appointmentQueuePriorityStyle(emphasis);
      const hasWarning = Boolean(item.customerAllergies || item.customerNotes || (item.invoice?.outstanding && item.invoice.outstanding > 0));
      return <button key={item.id} type="button" onClick={() => navigate("Appointments")} className={`w-full rounded-md border p-3 text-left transition hover:border-[#5B2A86]/25 ${priorityStyle.card}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#5B2A86] px-2.5 py-1 text-xs font-semibold text-white">{formatTime(item.startsAt)}</span>
              <Status value={item.status} />
              {emphasis && <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${priorityStyle.badge}`}>{emphasis}</span>}
            </div>
            <p className="mt-2 truncate text-sm font-semibold text-[#171717]">{item.customer}</p>
            <p className="mt-1 text-xs text-[#6B7280]">{item.phone} - {item.branchName}</p>
            <p className="mt-1 line-clamp-2 text-xs font-medium text-[#5B2A86]">{item.serviceLines.length ? item.serviceLines.map((line) => line.service).join(", ") : item.service}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 sm:max-w-[220px] sm:justify-end">
            <Source value={item.source} />
            <span className="rounded-full border border-[#E8EAF0] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#6B7280]">{item.staff || "Unassigned"}</span>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${item.invoice ? item.invoice.outstanding ? "border-[#F59E0B]/35 bg-[#FEF3C7] text-[#B45309]" : "border-[#10B981]/30 bg-[#D1FAE5] text-[#047857]" : "border-[#E8EAF0] bg-white text-[#6B7280]"}`}>{item.invoice ? item.invoice.outstanding ? "Due" : "Invoiced" : "No invoice"}</span>
            {hasWarning && <span className="rounded-full border border-[#EF4444]/25 bg-[#FEE2E2] px-2.5 py-1 text-[11px] font-semibold text-[#B91C1C]">Warning</span>}
          </div>
        </div>
      </button>;
    })}
  </div>;
}

export function DashboardInvoiceList({ invoices, openInvoice }: { invoices: WorkspaceData["recentInvoices"]; openInvoice: (invoiceId?: string) => void }) {
  if (!invoices.length) return <Empty text="No invoices recorded yet." />;
  return <div className="space-y-2.5">
    {invoices.slice(0, 6).map((invoice) => {
      const due = Math.max(0, invoice.total - invoice.paid);
      const invoiceState = due ? `${invoice.taxMode} - Due` : `${invoice.taxMode} - Paid`;
      return <button key={invoice.id} type="button" onClick={() => openInvoice(invoice.id)} className="w-full rounded-md border border-[#E8EAF0] bg-[#F6F7FB] p-3 text-left transition hover:border-[#5B2A86]/25 hover:bg-white">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#171717]">{invoice.number}</p>
            <p className="mt-1 text-xs text-[#6B7280]">{invoice.customer} - {formatDateTime(invoice.createdAt)}</p>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3 sm:min-w-[180px] sm:justify-end">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${due ? "bg-[#FEE2E2] text-[#B91C1C]" : "bg-[#D1FAE5] text-[#047857]"}`}>{invoiceState}</span>
            <strong className="block text-base font-semibold text-[#5B2A86]">{inr.format(invoice.total)}</strong>
          </div>
        </div>
      </button>;
    })}
  </div>;
}

export function DashboardInvoiceTable({ invoices, openInvoice }: { invoices: WorkspaceData["recentInvoices"]; openInvoice: (invoiceId?: string) => void }) {
  if (!invoices.length) return <Empty text="No invoices recorded yet." />;
  return <div className="-mx-4 -mb-4 overflow-hidden">
    <div className="grid grid-cols-[1.1fr_1.2fr_1fr_0.8fr_0.8fr] border-y border-[#E8EAF0] bg-[#F6F7FB] px-4 py-3 text-xs font-semibold text-[#6B7280]">
      <span>Invoice</span>
      <span>Customer</span>
      <span>Time</span>
      <span className="text-right">Amount</span>
      <span className="text-right">Status</span>
    </div>
    {invoices.slice(0, 5).map((invoice) => {
      const due = Math.max(0, invoice.total - invoice.paid);
      return <button key={invoice.id} type="button" onClick={() => openInvoice(invoice.id)} className="grid w-full grid-cols-[1.1fr_1.2fr_1fr_0.8fr_0.8fr] items-center border-b border-[#E8EAF0] px-4 py-3 text-left text-sm transition hover:bg-[#F6F7FB]">
        <span className="truncate text-[#6B7280]">{invoice.number}</span>
        <span className="truncate font-semibold text-[#171717]">{invoice.customer}</span>
        <span className="truncate text-[#6B7280]">{formatTime(invoice.createdAt)}</span>
        <strong className="text-right font-semibold text-[#171717]">{inr.format(invoice.total)}</strong>
        <span className="text-right"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${due ? "bg-[#FEF3C7] text-[#F59E0B]" : "bg-[#D1FAE5] text-[#10B981]"}`}>{due ? "Pending" : "Paid"}</span></span>
      </button>;
    })}
  </div>;
}

export function DashboardTeamStock({ staff, lowStockItems, navigate }: { staff: WorkspaceData["staff"]; lowStockItems: WorkspaceData["inventory"]; navigate: (item: NavItem) => void }) {
  const visibleStaff = staff.slice(0, 4);
  return <div className="space-y-5">
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#6B7280]">Staff today</p>
      <div className="space-y-2.5">
        {visibleStaff.length ? visibleStaff.map((member) => {
          const state = member.onLeave ? "On Leave" : member.attendanceToday.state === "CLOCKED_IN" ? "Available" : member.attendanceToday.state === "CLOCKED_OUT" ? "Done" : "Pending";
          const stateClass = state === "Available" ? "bg-[#D1FAE5] text-[#10B981]" : state === "Pending" ? "bg-[#FEF3C7] text-[#F59E0B]" : "bg-[#E5E7EB] text-[#6B7280]";
          return <button key={member.id} type="button" onClick={() => navigate("Team")} className="flex w-full items-center gap-3 text-left">
            <Avatar name={member.name} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-[#171717]">{member.name}</span>
              <span className="block truncate text-xs text-[#6B7280]">{member.role}</span>
            </span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${stateClass}`}>{state}</span>
          </button>;
        }) : <Empty text="No staff records available." />}
      </div>
    </div>
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#6B7280]">Inventory alerts</p>
      <div className="space-y-2.5">
        {lowStockItems.length ? lowStockItems.slice(0, 3).map((item) => <button key={item.id} type="button" onClick={() => navigate("Inventory")} className="flex w-full items-center gap-3 text-left">
          <Boxes size={15} className="shrink-0 text-[#6B7280]" />
          <span className="min-w-0 flex-1 truncate text-sm text-[#171717]">{item.name}</span>
          <span className="text-xs text-[#6B7280]">{item.quantity} {item.unit}</span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.quantity <= 0 ? "bg-[#FEE2E2] text-[#EF4444]" : "bg-[#FEF3C7] text-[#F59E0B]"}`}>{item.quantity <= 0 ? "Critical" : "Low"}</span>
        </button>) : <button type="button" onClick={() => navigate("Inventory")} className="flex w-full items-center justify-between rounded-lg bg-[#D1FAE5] px-3 py-2 text-sm font-semibold text-[#047857]"><span>Stock looks healthy</span><span>OK</span></button>}
      </div>
    </div>
  </div>;
}

export function DashboardTopServices({ items }: { items: Array<{ label: string; value: number }> }) {
  if (!items.length) return <Empty text="No service performance yet." />;
  return <div className="-mx-4 -mb-4">
    {items.slice(0, 5).map((item, index) => <div key={item.label} className="flex items-center gap-4 border-b border-[#E8EAF0] px-4 py-4 last:border-b-0">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#EFE8F6] text-sm font-semibold text-[#5B2A86]">{index + 1}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-[#171717]">{title(item.label)}</span>
        <span className="text-xs text-[#6B7280]">{item.value} booking{item.value === 1 ? "" : "s"}</span>
      </span>
      <span className="text-right">
        <strong className="block text-sm font-semibold text-[#171717]">{item.value}</strong>
        <span className="text-xs font-semibold text-[#10B981]">Active</span>
      </span>
    </div>)}
  </div>;
}

export function roleDashboardConfig(role: string): RoleDashboardConfig {
  const configs: Record<string, RoleDashboardConfig> = {
    OWNER: {
      eyebrow: "Owner command center",
      headline: "Your salon operations are ready.",
      summary: "Track bookings, billing, team attendance, stock alerts, GST, and branch performance from one clear screen.",
      queueTitle: "Today bookings",
      focusLabel: "Full operations",
      focusModule: "Reports",
    },
    MANAGER: {
      eyebrow: "Manager command center",
      headline: "Keep today's floor moving.",
      summary: "Review appointments, staff activity, payments, stock exceptions, and service performance without changing screens.",
      queueTitle: "Branch bookings",
      focusLabel: "Team focus",
      focusModule: "Team",
    },
    RECEPTIONIST: {
      eyebrow: "Reception desk",
      headline: "Book, check in, and bill faster.",
      summary: "The important queue, customer actions, billing handoff, and payment status are placed first for counter work.",
      queueTitle: "Reception queue",
      focusLabel: "Booking flow",
      focusModule: "Appointments",
    },
    STYLIST: {
      eyebrow: "Stylist day view",
      headline: "Your next customer is easy to find.",
      summary: "Focus on upcoming services, customer notes, allergy warnings, and visit status with minimal operational noise.",
      queueTitle: "Your bookings",
      focusLabel: "Appointments",
      focusModule: "Appointments",
    },
    ACCOUNTANT: {
      eyebrow: "Accounts control",
      headline: "Payments, invoices, and closing are in focus.",
      summary: "See collections, pending dues, GST, expenses, day close state, and invoice activity for clean reconciliation.",
      queueTitle: "Billing-linked appointments",
      focusLabel: "Day close status",
      focusModule: "Register",
    },
  };
  return configs[role] || configs.OWNER;
}

export function dashboardKpis(data: WorkspaceData, outstandingAmount: number, registerState: string, role: string): DashboardMetricItem[] {
  if (role === "STYLIST") {
    const nextAppointment = data.appointments.find((appointment) => !["COMPLETED", "CANCELLED", "NO_SHOW"].includes(appointment.status));
    return [
      { label: "Today's bookings", value: String(data.metrics.todayAppointments), numeric: data.metrics.todayAppointments, helper: "Visible appointments for your role", icon: CalendarDays, target: "Appointments", tone: "blue" },
      { label: "Completed", value: String(data.metrics.completedAppointments), numeric: data.metrics.completedAppointments, helper: "Services completed today", icon: CheckCircle2, target: "Appointments", tone: "green" },
      { label: "Customer profiles", value: String(data.metrics.customerCount), numeric: data.metrics.customerCount, helper: "Profiles you can access", icon: Users, target: "Customers", tone: "cyan" },
      { label: "Next service", value: nextAppointment?.service || "No queue", helper: nextAppointment ? `${formatTime(nextAppointment.startsAt)} with ${nextAppointment.customer}` : "No active appointment is waiting", icon: Clock, target: "Appointments", tone: "amber" },
    ];
  }
  if (role === "ACCOUNTANT") {
    return [
      // Company revenue, not gross tills: a FOFO franchisee's sales are its own money.
      { label: "Today revenue", value: inr.format(data.metrics.companyTodayRevenue ?? data.metrics.todayRevenue), numeric: data.metrics.companyTodayRevenue ?? data.metrics.todayRevenue, money: true, helper: (data.metrics.franchiseMonthRevenue ?? 0) > 0 ? "Yours - excludes franchise sales" : "Offline collections recorded today", icon: CircleDollarSign, target: "Reports", tone: "green" },
      { label: "Pending payment", value: inr.format(outstandingAmount), numeric: outstandingAmount, money: true, helper: "Due from recent invoice activity", icon: WalletCards, target: "Reports", tone: outstandingAmount ? "amber" : "green" },
      { label: "Month GST", value: inr.format(data.metrics.monthTax), numeric: data.metrics.monthTax, money: true, helper: "Tax recorded this month", icon: ReceiptText, target: "Reports", tone: "blue" },
      { label: "Expenses", value: inr.format(data.metrics.monthExpenses), numeric: data.metrics.monthExpenses, money: true, helper: "Recorded branch expenses", icon: ClipboardList, target: "Reports", tone: "rose" },
      { label: "Day Close", value: title(registerState), helper: "Current cash counter state", icon: CreditCard, target: "Register", tone: registerState === "OPEN" ? "green" : "slate" },
      { label: "Invoices", value: String(data.recentInvoices.length), numeric: data.recentInvoices.length, helper: "Recent invoices available", icon: ReceiptText, target: "Reports", tone: "cyan" },
    ];
  }
  return [
    { label: "Today revenue", value: inr.format(data.metrics.companyTodayRevenue ?? data.metrics.todayRevenue), numeric: data.metrics.companyTodayRevenue ?? data.metrics.todayRevenue, money: true, helper: (data.metrics.franchiseMonthRevenue ?? 0) > 0 ? "Yours - excludes franchise sales" : "Money collected today", icon: CircleDollarSign, target: "Reports", tone: "green" },
    { label: "Appointments", value: `${data.metrics.completedAppointments} / ${data.metrics.todayAppointments}`, helper: "Completed vs booked", icon: CalendarDays, target: "Appointments", tone: "blue" },
    { label: "Pending payment", value: inr.format(outstandingAmount), numeric: outstandingAmount, money: true, helper: outstandingAmount ? "Outstanding in recent invoices" : "No recent dues found", icon: WalletCards, target: "Reports", tone: outstandingAmount ? "amber" : "green" },
    { label: "Customers", value: String(data.metrics.customerCount), numeric: data.metrics.customerCount, helper: "Total salon profiles", icon: Users, target: "Customers", tone: "cyan" },
    { label: "Average ticket", value: inr.format(data.metrics.averageTicket), numeric: data.metrics.averageTicket, money: true, helper: "Per paid invoice", icon: TrendingUp, target: "Reports", tone: "violet" },
    { label: "Staff present", value: String(data.metrics.staffPresent), numeric: data.metrics.staffPresent, helper: `${data.metrics.staffLate} late - ${data.metrics.staffAbsent} absent`, icon: UserCheck, target: "Team", tone: data.metrics.staffAbsent || data.metrics.staffLate ? "amber" : "green" },
  ];
}

export function dashboardAlerts(data: WorkspaceData, lowStockItems: WorkspaceData["inventory"], outstandingInvoices: WorkspaceData["recentInvoices"], issueAppointments: WorkspaceData["appointments"], navigate: (item: NavItem) => void, openInvoice: (invoiceId?: string) => void): DashboardAlertItem[] {
  const alerts: DashboardAlertItem[] = [];
  const now = Date.now();

  /**
   * The alerts that come first are the ones where money or trust is leaking while nobody is
   * looking at a number. Low stock can wait until this afternoon; a finished service with no
   * invoice cannot.
   */

  // The day is not open. Cash taken before the register is opened will not reconcile at day close,
  // and nobody notices until the count is wrong.
  const registerOpen = data.registerSessions.some((session) => session.status === "OPEN");
  if (!registerOpen && data.identity.branchId && canOpen(data.identity.role, "Register")) {
    alerts.push({
      title: "The day is not open",
      detail: "Open the register before taking cash, or day close will not reconcile.",
      tone: "rose",
      icon: CreditCard,
      actionLabel: "Open day",
      onClick: () => navigate("Register"),
    });
  }

  // A finished service with no invoice is money walking out of the door.
  const unbilled = data.appointments.filter((appointment) => appointment.status === "COMPLETED" && !appointment.invoice);
  if (unbilled.length && canOpen(data.identity.role, "Point of sale")) {
    alerts.push({
      title: `${unbilled.length} visit${unbilled.length === 1 ? "" : "s"} finished but not billed`,
      detail: `${unbilled.slice(0, 2).map((appointment) => appointment.customer).join(", ")}${unbilled.length > 2 ? " and others have" : " has"} no invoice yet.`,
      tone: "rose",
      icon: ReceiptText,
      actionLabel: "Take payment",
      onClick: () => navigate("Point of sale"),
    });
  }

  // Booked, due, and not through the door.
  const notCheckedIn = data.appointments.filter((appointment) =>
    appointment.status === "CONFIRMED" && new Date(appointment.startsAt).getTime() < now);
  if (notCheckedIn.length && canOpen(data.identity.role, "Appointments")) {
    alerts.push({
      title: `${notCheckedIn.length} customer${notCheckedIn.length === 1 ? "" : "s"} not checked in`,
      detail: `${notCheckedIn.slice(0, 2).map((appointment) => `${appointment.customer} (${formatTime(appointment.startsAt)})`).join(", ")}${notCheckedIn.length > 2 ? " and more are" : " is"} past their booked time.`,
      tone: "amber",
      icon: UserCheck,
      actionLabel: "Open bookings",
      onClick: () => navigate("Appointments"),
    });
  }

  // A branch with no valid registration cannot issue a GST invoice at all. Far better to find out
  // at ten in the morning than with a customer standing at the counter.
  const gstBlocked = data.identity.branches.filter((branch) => !branch.gstReady);
  if (gstBlocked.length && canOpen(data.identity.role, "Settings")) {
    alerts.push({
      title: `GST billing blocked at ${gstBlocked.length} branch${gstBlocked.length === 1 ? "" : "es"}`,
      detail: `${gstBlocked.slice(0, 2).map((branch) => branch.name).join(", ")} ${gstBlocked.length === 1 ? "has" : "have"} no GSTIN for that state.`,
      tone: "rose",
      icon: AlertTriangle,
      actionLabel: "Fix in settings",
      onClick: () => navigate("Settings"),
    });
  }

  if (lowStockItems.length && canOpen(data.identity.role, "Inventory")) {
    alerts.push({ title: `${lowStockItems.length} low-stock item${lowStockItems.length === 1 ? "" : "s"}`, detail: `${lowStockItems.slice(0, 2).map((item) => item.name).join(", ")}${lowStockItems.length > 2 ? " and more need reorder checks." : " need reorder checks."}`, tone: "amber", icon: Boxes, actionLabel: "Open stock", onClick: () => navigate("Inventory") });
  }
  if (data.metrics.pendingAttendanceCorrections && canOpen(data.identity.role, "Team")) {
    alerts.push({ title: "Attendance correction pending", detail: `${data.metrics.pendingAttendanceCorrections} correction${data.metrics.pendingAttendanceCorrections === 1 ? "" : "s"} need owner or manager review.`, tone: "violet", icon: UserCheck, actionLabel: "Open team", onClick: () => navigate("Team") });
  }
  if (outstandingInvoices.length) {
    const due = outstandingInvoices.reduce((sum, invoice) => sum + Math.max(0, invoice.total - invoice.paid), 0);
    alerts.push({ title: "Pending invoice payments", detail: `${outstandingInvoices.length} invoice${outstandingInvoices.length === 1 ? "" : "s"} have ${inr.format(due)} due.`, tone: "rose", icon: WalletCards, actionLabel: "Open invoices", onClick: () => openInvoice(outstandingInvoices[0]?.id) });
  }
  if (issueAppointments.length && canOpen(data.identity.role, "Appointments")) {
    alerts.push({ title: "Cancelled or no-show visits", detail: `${issueAppointments.length} appointment${issueAppointments.length === 1 ? "" : "s"} need follow-up or reason review.`, tone: "amber", icon: AlertTriangle, actionLabel: "Open appointments", onClick: () => navigate("Appointments") });
  }
  if (!alerts.length) {
    alerts.push({
      title: "Nothing needs you",
      detail: "Everyone is checked in, every visit is billed, and the day is open.",
      tone: "green",
      icon: CheckCircle2,
    });
  }
  // Five, not four: the day-not-open and unbilled alerts are new and would otherwise push a real
  // problem off the bottom of the panel.
  return alerts.slice(0, 5);
}

export function dashboardToneClass(tone: DashboardTone) {
  const styles: Record<DashboardTone, string> = {
    green: "bg-[#16B994]/14 text-[#0f6f57]",
    blue: "bg-[#1C459D]/12 text-[#1C459D]",
    cyan: "bg-[#1789AA]/12 text-[#1789AA]",
    amber: "bg-[#fff2d2] text-[#7b5514]",
    rose: "bg-[#fff0ec] text-[#984f43]",
    violet: "bg-[#f2ebfb] text-[#674d8c]",
    slate: "bg-[#EEF2F6] text-[#516173]",
  };
  return styles[tone];
}

export function dashboardToneTextClass(tone: DashboardTone) {
  const styles: Record<DashboardTone, string> = {
    green: "text-[#10B981]",
    blue: "text-[#3B82F6]",
    cyan: "text-[#3B82F6]",
    amber: "text-[#F59E0B]",
    rose: "text-[#EF4444]",
    violet: "text-[#5B2A86]",
    slate: "text-[#6B7280]",
  };
  return styles[tone];
}
