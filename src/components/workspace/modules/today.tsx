"use client";

import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Clock, CreditCard, Package, ReceiptText, Sparkles, UserCheck } from "lucide-react";
import { inr } from "@/lib/format";
import type { WorkspaceData } from "@/lib/operations-types";

import { Badge, Button, Card, EmptyState, Metric } from "@/components/ui";
import { NavItem } from "@/components/workspace/contracts";
import { formatTime } from "@/components/workspace/shared-ui";

/**
 * Home.
 *
 * The old dashboard was a wall of KPIs - eight numbers, none of which told anyone what to do. A
 * receptionist opening the app at 10am does not want to know the average ticket size. They want to
 * know who is standing in front of them, who has not arrived, and who has not paid.
 *
 * So this screen answers one question - **what needs me right now?** - and everything that is not
 * an answer to it is demoted or removed. The numbers are still here, at the bottom, small.
 *
 * The rule for the queue: an item appears only if a person must *do* something about it. A metric
 * that is merely interesting is not a task.
 */

type Urgency = "now" | "soon" | "watch";

type Task = {
  id: string;
  urgency: Urgency;
  icon: React.ReactNode;
  title: string;
  detail: string;
  actionLabel: string;
  target: NavItem;
};

const URGENCY_STYLE: Record<Urgency, { border: string; badge: "danger" | "warning" | "neutral"; label: string }> = {
  now: { border: "border-l-[var(--danger)]", badge: "danger", label: "Now" },
  soon: { border: "border-l-[var(--warning)]", badge: "warning", label: "Soon" },
  watch: { border: "border-l-[var(--border-strong)]", badge: "neutral", label: "Watch" },
};

export function TodayView({ data, navigate, openAppointment }: {
  data: WorkspaceData;
  navigate: (item: NavItem) => void;
  openAppointment: (id: string) => void;
}) {
  const now = Date.now();
  const tasks: Task[] = [];

  // --- The day itself ---------------------------------------------------------------
  const openRegister = data.registerSessions.find((session) => session.status === "OPEN");
  if (!openRegister && data.identity.branchId) {
    tasks.push({
      id: "register",
      urgency: "now",
      icon: <CreditCard size={15} />,
      title: "The day is not open",
      detail: "Open the register before taking any cash, or the day will not reconcile.",
      actionLabel: "Open day",
      target: "Register",
    });
  }

  // --- People who are here, or should be --------------------------------------------
  const notCheckedIn = data.appointments.filter((appointment) =>
    appointment.status === "CONFIRMED" && new Date(appointment.startsAt).getTime() < now);

  for (const appointment of notCheckedIn.slice(0, 4)) {
    const lateBy = Math.round((now - new Date(appointment.startsAt).getTime()) / 60000);
    tasks.push({
      id: `late-${appointment.id}`,
      urgency: lateBy > 15 ? "now" : "soon",
      icon: <UserCheck size={15} />,
      title: `${appointment.customer} has not checked in`,
      detail: `Booked for ${formatTime(appointment.startsAt)}${lateBy > 0 ? ` - ${lateBy} min ago` : ""}`,
      actionLabel: "Check in",
      target: "Appointments",
    });
  }

  // --- Money that has not been taken -------------------------------------------------
  const needsBilling = data.appointments.filter((appointment) => appointment.status === "COMPLETED" && !appointment.invoice);
  for (const appointment of needsBilling.slice(0, 3)) {
    tasks.push({
      id: `bill-${appointment.id}`,
      urgency: "now",
      icon: <ReceiptText size={15} />,
      title: `${appointment.customer} has not been billed`,
      detail: "The service is finished but no invoice exists.",
      actionLabel: "Take payment",
      target: "Point of sale",
    });
  }

  const unpaid = data.recentInvoices.filter((invoice) => invoice.type === "SALE" && invoice.total - invoice.paid > 0.01);
  if (unpaid.length) {
    const owed = unpaid.reduce((sum, invoice) => sum + (invoice.total - invoice.paid), 0);
    tasks.push({
      id: "unpaid",
      urgency: "soon",
      icon: <CreditCard size={15} />,
      title: `${unpaid.length} invoice${unpaid.length === 1 ? "" : "s"} not fully paid`,
      detail: `${inr.format(owed)} outstanding.`,
      actionLabel: "See invoices",
      target: "Reports",
    });
  }

  // --- Things that will stop a sale later --------------------------------------------
  // A branch with no valid GST registration cannot issue a GST invoice at all. Better to learn it
  // here at 10am than when a customer is standing at the counter.
  const gstBlocked = data.identity.branches.filter((branch) => !branch.gstReady);
  if (gstBlocked.length) {
    tasks.push({
      id: "gst",
      urgency: "now",
      icon: <AlertTriangle size={15} />,
      title: `GST billing is blocked at ${gstBlocked.length} branch${gstBlocked.length === 1 ? "" : "es"}`,
      detail: `${gstBlocked.map((branch) => branch.name).join(", ")} - no GSTIN for that state.`,
      actionLabel: "Fix in settings",
      target: "Settings",
    });
  }

  if (data.metrics.lowStockCount > 0) {
    tasks.push({
      id: "stock",
      urgency: "watch",
      icon: <Package size={15} />,
      title: `${data.metrics.lowStockCount} product${data.metrics.lowStockCount === 1 ? "" : "s"} running low`,
      detail: "Reorder before you cannot sell them.",
      actionLabel: "See stock",
      target: "Inventory",
    });
  }

  const order: Record<Urgency, number> = { now: 0, soon: 1, watch: 2 };
  tasks.sort((left, right) => order[left.urgency] - order[right.urgency]);

  // --- Who is coming next -------------------------------------------------------------
  const upcoming = [...data.appointments]
    .filter((appointment) => new Date(appointment.startsAt).getTime() >= now && !["CANCELLED", "NO_SHOW", "COMPLETED"].includes(appointment.status))
    .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime())
    .slice(0, 5);

  const franchiseRevenue = data.metrics.franchiseMonthRevenue ?? 0;
  const todayRevenue = data.metrics.companyTodayRevenue ?? data.metrics.todayRevenue;

  return <div className="space-y-4">
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <Card
        title="Needs you now"
        description={tasks.length ? "Everything here is waiting on a person." : undefined}
      >
        {tasks.length ? <div className="space-y-2">
          {tasks.map((task) => {
            const style = URGENCY_STYLE[task.urgency];
            return <div
              key={task.id}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border)] border-l-4 bg-[var(--surface-card)] p-3 ${style.border}`}
            >
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="mt-0.5 shrink-0 text-[var(--text-secondary)]">{task.icon}</span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-[14px] font-medium text-[var(--text-primary)]">
                    {task.title}
                    <Badge tone={style.badge}>{style.label}</Badge>
                  </p>
                  <p className="mt-0.5 text-[13px] text-[var(--text-secondary)]">{task.detail}</p>
                </div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => navigate(task.target)}>{task.actionLabel}</Button>
            </div>;
          })}
        </div> : <EmptyState
          icon={<CheckCircle2 size={18} />}
          title="Nothing needs you"
          description="Everyone is checked in, everything is billed, and the day is open."
        />}
      </Card>

      <Card title="Next up" description="Who is coming through the door.">
        {upcoming.length ? <div className="divide-y divide-[var(--border)]">
          {upcoming.map((appointment) => <button
            key={appointment.id}
            type="button"
            onClick={() => openAppointment(appointment.id)}
            className="flex w-full items-center gap-3 py-2.5 text-left transition hover:bg-[var(--surface-sunken)]"
          >
            <span className="w-14 shrink-0 text-[14px] font-medium tabular-nums text-[var(--text-primary)]">{formatTime(appointment.startsAt)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] text-[var(--text-primary)]">{appointment.customer}</span>
              <span className="block truncate text-[13px] text-[var(--text-secondary)]">{appointment.service} · {appointment.staff || "Unassigned"}</span>
            </span>
            <ArrowRight size={14} className="shrink-0 text-[var(--text-muted)]" />
          </button>)}
        </div> : <EmptyState icon={<CalendarDays size={18} />} title="Nothing booked" description="The rest of the day is free." />}
      </Card>
    </div>

    {/* The numbers still matter - they are just not the first thing anyone needs. */}
    <Card title="Today so far">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Money taken"
          value={inr.format(todayRevenue)}
          tone="success"
          hint={franchiseRevenue > 0 ? "Yours - excludes franchise sales" : undefined}
        />
        <Metric label="Booked" value={`${data.metrics.completedAppointments} / ${data.metrics.todayAppointments}`} hint="Completed of booked" />
        <Metric label="Customers" value={String(data.metrics.customerCount)} />
        <Metric
          label="Register"
          value={openRegister ? "Open" : "Not open"}
          tone={openRegister ? "success" : "warning"}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="primary" icon={<Sparkles size={14} />} onClick={() => navigate("Point of sale")}>New sale</Button>
        <Button size="sm" variant="secondary" icon={<CalendarDays size={14} />} onClick={() => navigate("Appointments")}>Book someone in</Button>
        <Button size="sm" variant="ghost" icon={<Clock size={14} />} onClick={() => navigate("Register")}>Day close</Button>
      </div>
    </Card>
  </div>;
}
