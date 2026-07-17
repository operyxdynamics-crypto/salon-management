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

import { SubmitFn } from "@/components/workspace/contracts";
import { AttendanceClock } from "@/components/workspace/modules/attendance-clock";
import { getAttendance, getPayroll } from "@/components/workspace/modules/team-api";
import { Avatar, Card, Empty, Field, Info, Select, SlotMessage, Status, WorkspaceDateInput, WorkspaceSelect, formatDate, formatTime, title } from "@/components/workspace/shared-ui";

export type AttendanceData = {
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
    entries: Array<{
      id: string; clockIn: string; clockOut: string | null; status: string; source: string; note: string | null;
      /** Evidence recorded at check-in, so the approvals queue can show why without recomputing it. */
      kind?: string; distanceMeters?: number | null; accuracyMeters?: number | null; lateMinutes: number; reviewedAt?: string | null;
    }>;
  }>;
};

export type PayrollData = {
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
    /** Days are the unit salary is pro-rated in, so they are reported alongside the hours. */
    workedDays: number;
    expectedDays: number;
    paidLeaveDays: number;
    absentDays: number;
    monthlySalary: number;
    earnedSalary: number;
    salaryDeduction: number;
    /** What this person is actually owed: earned salary + commission + tips. */
    gross: number;
    /** The commission-and-tips part only. Kept for the CSV export's existing column. */
    payableInput: number;
  }>;
  summary: {
    workedMinutes: number; expectedMinutes: number; appointmentsServed: number;
    serviceCommissions: number; productCommissions: number; tips: number;
    earnedSalary: number; salaryDeduction: number; gross: number; payableInput: number;
  };
};

export function TeamView({ data, openStaff, openLeave, submit }: { data: WorkspaceData; openStaff: () => void; openLeave: () => void; submit: SubmitFn }) {
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
      setAttendance(await getAttendance<AttendanceData>(params));
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
      idempotencyKey: `shift-${newId()}`,
    }, "Shift published.");
  }
  async function moveShift(shiftId: string, startsAt: string, endsAt: string, dayOffset: number) {
    const nextStart = new Date(new Date(startsAt).getTime() + dayOffset * 86_400_000);
    const nextEnd = new Date(new Date(endsAt).getTime() + dayOffset * 86_400_000);
    await submit(`/api/v1/operations/staff/shifts/${shiftId}`, { startsAt: nextStart.toISOString(), endsAt: nextEnd.toISOString(), idempotencyKey: `shift-move-${shiftId}-${newId()}` }, "Shift moved.", "PATCH");
  }
  async function attendanceAction(action: "CLOCK_IN" | "CLOCK_OUT", staffId: string) {
    const result = await submit("/api/v1/operations/staff/attendance", { action, staffId, idempotencyKey: `attendance-${action.toLowerCase()}-${newId()}` }, action === "CLOCK_IN" ? "Clock-in recorded." : "Clock-out recorded.", "POST", false);
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
      idempotencyKey: `attendance-manual-${newId()}`,
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
      monthlySalary: Number(form.get("monthlySalary") || 0),
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
    anchor.download = `operyx-payroll-${payrollFrom}-${payrollTo}.csv`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  if (!branchId) return <Card title="Team operations"><SlotMessage text="Select a specific branch to manage attendance, shifts, and payroll." /></Card>;
  const attendanceRows = attendance?.rows || [];
  return <div className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Info label="Present today" value={String(data.metrics.staffPresent)} tone="green" /><Info label="Absent today" value={String(data.metrics.staffAbsent)} tone={data.metrics.staffAbsent ? "rose" : "green"} /><Info label="Late clock-ins" value={String(data.metrics.staffLate)} tone={data.metrics.staffLate ? "amber" : "green"} /><Info label="Pending corrections" value={String(data.metrics.pendingAttendanceCorrections)} tone={data.metrics.pendingAttendanceCorrections ? "violet" : "green"} /></div>
    <Card title="Team operations" action={canManageStaff ? <div className="flex flex-wrap gap-2"><button onClick={openLeave} className="rounded-full border border-black/10 px-4 py-2 text-sm font-bold">Record leave</button><button onClick={openStaff} className="primary"><Plus size={15} /> Add team member</button></div> : undefined}>
      <div className="mb-5 flex flex-wrap gap-2">{teamTabs.map((value) => <button key={value} type="button" onClick={() => setTab(value)} className={`rounded-full px-4 py-2 text-sm font-bold ${tab === value ? "bg-[#173279] text-white" : "bg-[#F7FAFC] text-[#737174]"}`}>{title(value)}</button>)}</div>
      {localError && <p className="mb-4 rounded-xl bg-[#f2ded8] p-3 text-sm font-bold text-[#995849]">{localError}</p>}
      {tab === "directory" && <div className={`grid gap-5 ${canManageStaff ? "xl:grid-cols-[1fr_380px]" : ""}`}><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.staff.map((member) => <div key={member.id} className="rounded-2xl border border-black/8 p-5"><Avatar name={member.name} dark /><h3 className="mt-4 font-bold">{member.name}</h3><p className="text-sm text-[#737174]">{member.role} - {title(member.userRole)}</p><p className="mt-1 truncate text-xs text-[#978f87]">{member.email || "No email"}</p><div className="mt-4 border-t border-black/5 pt-4 text-sm"><p>{member.appointments} appointments today</p><p className="mt-1">{member.commissionRate}% commission - {inr.format(member.commissionEarned)} earned</p><p className="mt-1 text-xs text-[#737174]">{member.branchIds.length} assigned branches</p><p className="mt-2"><Status value={member.attendanceToday.state} /></p></div></div>)}</div>{canManageStaff && <form onSubmit={updateStaff} className="rounded-2xl bg-[#F7FAFC] p-4"><h3 className="font-bold">Staff controls</h3><div className="mt-3 grid gap-3"><Select name="staffId" label="Team member" options={data.staff.map((member) => [member.id, member.name])} /><Select name="role" label="Access role" options={[["MANAGER", "Manager"], ["RECEPTIONIST", "Receptionist"], ["STYLIST", "Stylist"], ["ACCOUNTANT", "Accountant"]]} /><Field name="jobTitle" label="Job title" /><Field name="commissionRate" label="Commission rate %" type="number" defaultValue="0" /><Field name="monthlySalary" label="Monthly salary" type="number" defaultValue="0" required={false} /><Select name="primaryBranchId" label="Primary branch" options={data.identity.branches.map((branch) => [branch.id, branch.name])} /><fieldset className="rounded-2xl border border-black/10 p-4"><legend className="px-2 text-sm font-bold">Assigned branches</legend>{data.identity.branches.map((branch) => <label key={branch.id} className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" name="branchIds" value={branch.id} defaultChecked={branch.id === branchId} /> {branch.name}</label>)}</fieldset><Field name="temporaryPassword" label="Temporary password, optional" type="password" required={false} /><label className="text-sm font-bold"><input name="isActive" type="checkbox" defaultChecked /> Active login</label><button className="primary justify-center">Save staff controls</button></div></form>}</div>}
      {/* Your own clock, above the team's. The person looking at this screen most often is the one
          who just walked in, not the manager auditing everyone. */}
      {tab === "attendance" && <div className="mb-5"><AttendanceClock data={data} submit={submit} onDone={() => void loadAttendance()} /></div>}

      {tab === "attendance" && <div className="grid gap-5 xl:grid-cols-[1fr_360px]"><div><div className="mb-4 flex flex-wrap gap-2"><WorkspaceDateInput className="w-44" value={attendanceDate} onChange={setAttendanceDate} /><WorkspaceSelect className="w-52" value={staffFilter} onChange={setStaffFilter} options={[{ value: "", label: "All staff" }, ...data.staff.map((member) => ({ value: member.id, label: member.name, description: member.role }))]} /><button onClick={() => void loadAttendance()} className="primary">Refresh</button></div>{loading ? <SlotMessage text="Loading attendance..." loading /> : <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm"><thead className="text-xs uppercase tracking-wider text-[#737174]"><tr><th className="pb-3">Staff</th><th className="pb-3">Shift</th><th className="pb-3">Clock</th><th className="pb-3">Worked</th><th className="pb-3">Status</th><th className="pb-3">Action</th></tr></thead><tbody>{attendanceRows.map((row) => <tr key={row.staffId} className="border-t border-black/5"><td className="py-4"><strong>{row.name}</strong><p className="text-xs text-[#737174]">{row.role}</p></td><td className="py-4">{row.shift ? `${formatTime(row.shift.startsAt)} - ${formatTime(row.shift.endsAt)}` : "No shift"}</td><td className="py-4">{row.firstClockIn ? formatTime(row.firstClockIn) : "-"}{row.lastClockOut ? ` - ${formatTime(row.lastClockOut)}` : row.openAttendanceId ? " - open" : ""}</td><td className="py-4">{(row.workedMinutes / 60).toFixed(2)}h<p className="text-xs text-[#737174]">Variance {(row.varianceMinutes / 60).toFixed(2)}h</p></td><td className="py-4"><Status value={row.state} />{row.lateMinutes > 0 && <p className="mt-1 text-xs font-bold text-[#1969A2]">{row.lateMinutes} min late</p>}</td><td className="py-4"><div className="flex flex-wrap gap-2"><button onClick={() => void attendanceAction("CLOCK_IN", row.staffId)} disabled={Boolean(row.openAttendanceId)} className="rounded-lg border px-2 py-1 text-xs font-bold disabled:opacity-40">Clock in</button><button onClick={() => void attendanceAction("CLOCK_OUT", row.staffId)} disabled={!row.openAttendanceId} className="rounded-lg border px-2 py-1 text-xs font-bold disabled:opacity-40">Clock out</button></div>{row.entries.filter((entry) => entry.status === "PENDING").map((entry) => <div key={entry.id} className="mt-2 rounded-xl border border-[#ECD7A7] bg-[#FFF7DF] p-2.5 text-xs">
  {/* Show the evidence, not just the verdict. "Pending" alone makes a manager guess; "612m from
      the branch, accurate to 18m" lets them decide in a second - and lets them notice when a
      distance is impossible. */}
  <p className="font-extrabold text-[#865C12]">{entry.note || "Needs review"}</p>
  <p className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] font-semibold text-[#8A6A2B]">
    <span>{formatTime(entry.clockIn)}</span>
    {entry.kind === "OFF_SITE" && <span>· Off-site</span>}
    {entry.distanceMeters !== null && entry.distanceMeters !== undefined && <span>· {entry.distanceMeters}m away</span>}
    {entry.accuracyMeters ? <span>· ±{entry.accuracyMeters}m</span> : null}
    {entry.lateMinutes > 0 && <span>· {entry.lateMinutes} min late</span>}
  </p>
  <div className="mt-2 flex gap-2">
    <button onClick={() => void approveAttendance(entry.id, "APPROVED")} className="rounded-lg bg-[#0B6B4F] px-2.5 py-1 font-bold text-white">Approve</button>
    <button onClick={() => void approveAttendance(entry.id, "REJECTED")} className="rounded-lg border border-[#C4403E] px-2.5 py-1 font-bold text-[#C4403E]">Reject</button>
  </div>
</div>)}</td></tr>)}</tbody></table>{!attendanceRows.length && <Empty text="No attendance rows for this date." />}</div>}</div><form onSubmit={manualCorrection} className="h-fit rounded-2xl bg-[#F7FAFC] p-4"><h3 className="font-bold">Manual correction</h3><p className="mt-1 text-xs text-[#737174]">Managers can approve corrections immediately from here.</p><div className="mt-3 grid gap-3"><Select name="staffId" label="Team member" options={data.staff.map((member) => [member.id, member.name])} /><Field name="clockIn" label="Clock in" type="datetime-local" /><Field name="clockOut" label="Clock out, optional" type="datetime-local" required={false} /><Field name="note" label="Reason" /><button className="primary justify-center">Save correction</button></div></form></div>}
      {tab === "shifts" && <div className="grid gap-5 xl:grid-cols-[1fr_360px]"><Card title="Published shifts"><p className="mb-4 text-xs text-[#737174]">Move a shift one day backward or forward. Conflicts are rechecked by the server.</p>{data.staff.flatMap((member) => member.shifts.map((shift) => ({ ...shift, member }))).length ? data.staff.flatMap((member) => member.shifts.map((shift) => ({ ...shift, member }))).map((shift) => <div key={shift.id} draggable className="mb-2 flex items-center gap-3 rounded-2xl border border-black/8 p-3"><GripVertical size={16} /><div className="min-w-0 flex-1"><p className="font-bold">{shift.member.name}</p><p className="text-xs text-[#737174]">{formatDate(new Date(shift.startsAt))} - {formatTime(shift.startsAt)}-{formatTime(shift.endsAt)}</p></div><button onClick={() => moveShift(shift.id, shift.startsAt, shift.endsAt, -1)} className="rounded-lg border px-2 py-1 text-xs">-1 day</button><button onClick={() => moveShift(shift.id, shift.startsAt, shift.endsAt, 1)} className="rounded-lg border px-2 py-1 text-xs">+1 day</button></div>) : <Empty text="No shifts published for today." />}</Card><Card title="Publish shift"><form onSubmit={createShift} className="space-y-3"><WorkspaceDateInput value={shiftDate} onChange={setShiftDate} /><Select name="staffId" label="Team member" options={data.staff.map((member) => [member.id, member.name])} /><Field name="startsAt" label="Starts" type="time" defaultValue="09:00" /><Field name="endsAt" label="Ends" type="time" defaultValue="18:00" /><Select name="type" label="Shift type" options={[["REGULAR", "Regular"], ["OVERTIME", "Overtime"], ["TRAINING", "Training"]]} /><button className="primary w-full justify-center">Publish shift</button></form></Card></div>}
      {tab === "payroll" && <div className="space-y-5"><div className="flex flex-wrap gap-2"><WorkspaceDateInput className="w-44" value={payrollFrom} onChange={setPayrollFrom} /><WorkspaceDateInput className="w-44" value={payrollTo} onChange={setPayrollTo} /><WorkspaceSelect className="w-52" value={staffFilter} onChange={setStaffFilter} options={[{ value: "", label: "All staff" }, ...data.staff.map((member) => ({ value: member.id, label: member.name, description: member.role }))]} /><button onClick={() => void loadPayroll()} className="primary">Calculate</button><button onClick={exportPayrollCsv} disabled={!payroll?.rows.length} className="rounded-full border border-black/10 px-4 py-2 text-sm font-bold disabled:opacity-40">Export CSV</button></div>{payroll && <div className="grid gap-3 sm:grid-cols-4"><Info label="Earned salary" value={inr.format(payroll.summary.earnedSalary)} tone="blue" /><Info label="Commission" value={inr.format(payroll.summary.serviceCommissions + payroll.summary.productCommissions)} tone="green" /><Info label="Tips" value={inr.format(payroll.summary.tips)} tone="amber" /><Info label="Total payable" value={inr.format(payroll.summary.gross)} tone="violet" /></div>}<div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="text-xs uppercase tracking-wider text-[#737174]"><tr><th className="pb-3">Staff</th><th className="pb-3">Days</th><th className="pb-3">Salary</th><th className="pb-3">Revenue</th><th className="pb-3">Commission</th><th className="pb-3">Tips</th><th className="pb-3 text-right">Payable</th></tr></thead><tbody>{(payroll?.rows || []).map((row) => <tr key={row.staffId} className="border-t border-black/5"><td className="py-4"><strong>{row.name}</strong><p className="text-xs text-[#737174]">{row.role}</p></td><td className="py-4">{row.workedDays}/{row.expectedDays}<p className="text-xs text-[#737174]">{row.paidLeaveDays > 0 ? `${row.paidLeaveDays} leave` : row.absentDays > 0 ? `${row.absentDays} absent` : (row.workedMinutes / 60).toFixed(1) + "h"}</p></td>
{/* Show the deduction next to the pay, not buried in a total. Someone querying their payslip
    asks "why is it short?", and the answer should already be on the screen. */}
<td className="py-4">{inr.format(row.earnedSalary)}{row.salaryDeduction > 0 && <p className="text-xs font-bold text-[#C4403E]">−{inr.format(row.salaryDeduction)}</p>}</td><td className="py-4">{inr.format(row.serviceRevenue + row.productRevenue)}</td><td className="py-4">{inr.format(row.serviceCommissions + row.productCommissions)}</td><td className="py-4">{inr.format(row.tips)}</td><td className="py-4 text-right font-bold">{inr.format(row.gross)}</td></tr>)}</tbody></table>{loading ? <SlotMessage text="Calculating payroll..." loading /> : !payroll?.rows.length && <Empty text="Choose filters and calculate payroll summary." />}</div><p className="rounded-2xl bg-[#F7FAFC] p-4 text-xs text-[#7c5a1e]">Payroll summary is an operational export only. PF, ESI, TDS, salary slips, and statutory payroll filing are intentionally not calculated.</p></div>}
    </Card>
  </div>;
}
