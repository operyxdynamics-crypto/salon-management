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
import { getDayCloseSummary } from "@/components/workspace/modules/day-close-api";
import { Banner, Card, Empty, Info, Row, SlotMessage, Status, Summary, formatDateTime, title, varianceTone, varianceToneClass } from "@/components/workspace/shared-ui";

export type RegisterSessionDto = {
  id: string;
  branchId: string;
  status: string;
  openingBalance: number;
  openingNote: string | null;
  closingBalance: number | null;
  closingNote: string | null;
  expectedBalance: number | null;
  variance: number | null;
  openedAt: string;
  closedAt: string | null;
};

export type RegisterSummaryData = {
  state: "OPEN" | "CLOSED" | "NOT_OPENED";
  open: RegisterSessionDto | null;
  lastClosed: RegisterSessionDto | null;
  activeSession: RegisterSessionDto | null;
  since: string;
  until: string;
  sales: Record<string, number>;
  refunds: Record<string, number>;
  netPayments: Record<string, number>;
  expectedCash: number;
  summary: {
    invoiceCount: number;
    refundCount: number;
    grossSales: number;
    refundsTotal: number;
    netSales: number;
    subtotal: number;
    discount: number;
    tax: number;
    tips: number;
    expenses: number;
    commissions: number;
    stockMovementCount: number;
    stockQuantityMoved: number;
  };
  invoices: Array<{
    id: string;
    number: string;
    customer: string;
    type: string;
    status: string;
    taxMode: string;
    total: number;
    tax: number;
    tip: number;
    paid: number;
    createdAt: string;
    payments: Array<{ method: string; amount: number; reference: string | null }>;
  }>;
  expenses: Array<{ id: string; category: string; amount: number; note: string | null; spentAt: string }>;
  stockMovements: Array<{ id: string; product: string; type: string; quantity: number; reference: string | null; createdAt: string }>;
  benefits: Record<string, { count: number; amount: number; points: number }>;
};

export function RegisterView({ data, submit, openInvoice }: { data: WorkspaceData; submit: SubmitFn; openInvoice: (invoiceId?: string) => void }) {
  const branchId = data.identity.branchId || "";
  const [summary, setSummary] = useState<RegisterSummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState("");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [openingNote, setOpeningNote] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [closingNote, setClosingNote] = useState("");
  const methods = ["CASH", "UPI", "CARD", "WALLET", "LOYALTY", "GIFT_CARD", "PACKAGE"];

  const loadSummary = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setLocalError("");
    try {
      setSummary(await getDayCloseSummary<RegisterSummaryData>(branchId));
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Unable to load register summary");
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => { queueMicrotask(() => void loadSummary()); }, [loadSummary]);

  useEffect(() => {
    if (summary?.state === "OPEN") setCountedCash(summary.expectedCash.toFixed(2));
  }, [summary?.activeSession?.id, summary?.expectedCash, summary?.state]);

  async function openRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await submit<RegisterSessionDto>("/api/v1/operations/register", {
      action: "OPEN",
      branchId,
      openingBalance: Number(openingBalance || 0),
      openingNote,
      idempotencyKey: `register-open-${newId()}`,
    }, "Day opened.", "POST", false);
    if (result.ok) {
      setOpeningBalance("0");
      setOpeningNote("");
      await loadSummary();
    } else {
      setLocalError(result.error);
    }
  }

  async function closeRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!summary) return;
    const counted = Number(countedCash || 0);
    const variance = Number((counted - summary.expectedCash).toFixed(2));
    if (Math.abs(variance) > 100 && !window.confirm(`Day close variance is ${inr.format(variance)}. Close anyway?`)) return;
    const result = await submit<RegisterSessionDto>("/api/v1/operations/register", {
      action: "CLOSE",
      branchId,
      closingBalance: counted,
      closingNote,
      idempotencyKey: `register-close-${newId()}`,
    }, "Day closed.", "POST", false);
    if (result.ok) {
      setClosingNote("");
      await loadSummary();
    } else {
      setLocalError(result.error);
    }
  }

  function exportCsv() {
    if (!summary) return;
    const rows = [
      ["Day close summary", data.identity.branchName],
      ["State", summary.state],
      ["Since", summary.since],
      ["Until", summary.until],
      ["Opening balance", String(summary.activeSession?.openingBalance ?? 0)],
      ["Expected cash", String(summary.expectedCash)],
      ["Closing balance", String(summary.activeSession?.closingBalance ?? "")],
      ["Variance", String(summary.activeSession?.variance ?? "")],
      [],
      ["Payment method", "Sales", "Refunds", "Net"],
      ...methods.map((method) => [method, String(summary.sales[method] ?? 0), String(summary.refunds[method] ?? 0), String(summary.netPayments[method] ?? 0)]),
      [],
      ["Totals"],
      ["Gross sales", String(summary.summary.grossSales)],
      ["Refunds", String(summary.summary.refundsTotal)],
      ["Net sales", String(summary.summary.netSales)],
      ["GST / tax", String(summary.summary.tax)],
      ["Tips", String(summary.summary.tips)],
      ["Expenses", String(summary.summary.expenses)],
      ["Commissions", String(summary.summary.commissions)],
      [],
      ["Invoices", "Customer", "Date", "Type", "Tax mode", "Status", "Payments", "Tax", "Tip", "Total"],
      ...summary.invoices.map((invoice) => [invoice.number, invoice.customer, invoice.createdAt, invoice.type, invoice.taxMode, invoice.status, invoice.payments.map((payment) => payment.method).join(" + "), String(invoice.tax), String(invoice.tip), String(invoice.total)]),
      [],
      ["Expenses", "Date", "Amount", "Note"],
      ...summary.expenses.map((expense) => [expense.category, expense.spentAt, String(expense.amount), expense.note || ""]),
      [],
      ["Stock movement", "Type", "Quantity", "Reference", "Date"],
      ...summary.stockMovements.map((movement) => [movement.product, movement.type, String(movement.quantity), movement.reference || "", movement.createdAt]),
    ];
    const blob = new Blob([rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `operyx-day-close-${data.identity.branchName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  if (!branchId) return <Card title="Day Close"><SlotMessage text="Select one branch before opening or closing the day. All-branch scope is available for reports only." /></Card>;
  const activeSession = summary?.activeSession;
  const liveVariance = summary ? Number((Number(countedCash || 0) - summary.expectedCash).toFixed(2)) : 0;
  const benefitRows = summary ? Object.entries(summary.benefits).sort(([left], [right]) => left.localeCompare(right)) : [];
  return <div className="space-y-5">
    <div className="relative overflow-hidden rounded-[2rem] border border-[#16B994]/30 bg-[#173279] p-6 text-white shadow-[0_24px_70px_rgba(23,50,121,.2)]">
      <div className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-[#16B994]/20 blur-3xl" />
      <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="inline-flex rounded-full border border-[#16B994]/35 bg-[#16B994]/12 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-[#F7FAFC]">Day close</p>
          <h2 className="mt-4 font-serif text-4xl leading-tight">Daily cash counter for {data.identity.branchName}</h2>
          <p className="mt-2 max-w-2xl text-sm text-white/62">Open the day before counter sales, then close with counted cash and reconcile sales, refunds, expenses, GST, tips, commissions and stock movement.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void loadSummary()} className="rounded-full border border-white/12 bg-white/10 px-4 py-2.5 text-sm font-bold text-white"><RefreshCw size={15} className="mr-2 inline" />Refresh</button>
          <button type="button" onClick={exportCsv} disabled={!summary} className="rounded-full bg-[#16B994] px-4 py-2.5 text-sm font-bold text-[#111111] disabled:opacity-40"><ReceiptText size={15} className="mr-2 inline" />Export CSV</button>
        </div>
      </div>
    </div>

    {localError && <Banner tone="error" text={localError} onClose={() => setLocalError("")} />}
    {loading && <SlotMessage text="Loading register summary..." loading />}

    {summary && <div className="grid gap-5 xl:grid-cols-[1fr_410px]">
      <div className="space-y-5">
        <Card title="Closing summary" action={<Status value={summary.state} />}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Info label="Opening balance" value={inr.format(activeSession?.openingBalance ?? 0)} tone="blue" />
            <Info label="Cash sales" value={inr.format(summary.sales.CASH ?? 0)} tone="green" />
            <Info label="Cash refunds" value={inr.format(summary.refunds.CASH ?? 0)} tone={(summary.refunds.CASH ?? 0) ? "rose" : "green"} />
            <Info label="Expected cash" value={inr.format(summary.expectedCash)} tone="amber" />
          </div>
          {summary.state === "CLOSED" && <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Info label="Counted cash" value={inr.format(activeSession?.closingBalance ?? 0)} tone="blue" />
            <Info label="Variance" value={inr.format(activeSession?.variance ?? 0)} tone={varianceTone(activeSession?.variance ?? 0)} />
            <Info label="Closed at" value={activeSession?.closedAt ? formatDateTime(activeSession.closedAt) : "-"} tone="neutral" />
          </div>}
          <div className="mt-5 rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] p-4 text-sm text-[#737174]">
            <p><strong>Window:</strong> {formatDateTime(summary.since)} to {formatDateTime(summary.until)}</p>
            {activeSession?.openingNote && <p className="mt-1"><strong>Opening note:</strong> {activeSession.openingNote}</p>}
            {activeSession?.closingNote && <p className="mt-1"><strong>Closing note:</strong> {activeSession.closingNote}</p>}
            {summary.state === "NOT_OPENED" && <p className="mt-1 font-bold text-[#865c12]">No register has been opened today for this branch.</p>}
          </div>
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Sales and tax">
            <div className="grid gap-3 sm:grid-cols-2">
              <Info label="Invoice count" value={String(summary.summary.invoiceCount)} tone="blue" />
              <Info label="Refund count" value={String(summary.summary.refundCount)} tone={summary.summary.refundCount ? "rose" : "green"} />
              <Info label="Gross sales" value={inr.format(summary.summary.grossSales)} tone="green" />
              <Info label="Refunds" value={inr.format(summary.summary.refundsTotal)} tone={summary.summary.refundsTotal ? "rose" : "green"} />
              <Info label="Net sales" value={inr.format(summary.summary.netSales)} tone="green" />
              <Info label="GST / tax" value={inr.format(summary.summary.tax)} tone="amber" />
              <Info label="Tips" value={inr.format(summary.summary.tips)} tone="violet" />
              <Info label="Expenses" value={inr.format(summary.summary.expenses)} tone={summary.summary.expenses ? "rose" : "green"} />
            </div>
          </Card>
          <Card title="Staff and stock">
            <div className="grid gap-3 sm:grid-cols-2">
              <Info label="Commissions" value={inr.format(summary.summary.commissions)} tone="amber" />
              <Info label="Stock entries" value={String(summary.summary.stockMovementCount)} tone="blue" />
              <Info label="Stock quantity moved" value={String(summary.summary.stockQuantityMoved)} tone="neutral" />
              <Info label="Net cash impact" value={inr.format(summary.netPayments.CASH ?? 0)} tone={varianceTone(summary.netPayments.CASH ?? 0)} />
            </div>
            <div className="mt-4">
              {benefitRows.length ? benefitRows.map(([kind, item]) => <Row key={kind} primary={title(kind)} secondary={`${item.count} transaction(s), ${item.points} point movement`} value={item.amount ? inr.format(item.amount) : `${item.points} pts`} />) : <Empty text="No wallet, gift card, package, or loyalty movements in this register window." />}
            </div>
          </Card>
        </div>

        <Card title="Payment split">
          <div className="overflow-x-auto"><table className="soft-table w-full min-w-[720px] text-left text-sm"><thead className="text-xs uppercase tracking-wider text-[#737174]"><tr><th className="pb-3">Method</th><th className="pb-3 text-right">Sales</th><th className="pb-3 text-right">Refunds</th><th className="pb-3 text-right">Net</th></tr></thead><tbody>{methods.map((method) => <tr key={method} className="border-t border-black/5"><td className="py-3 font-bold">{title(method)}</td><td className="py-3 text-right">{inr.format(summary.sales[method] ?? 0)}</td><td className="py-3 text-right">{inr.format(summary.refunds[method] ?? 0)}</td><td className="py-3 text-right font-bold">{inr.format(summary.netPayments[method] ?? 0)}</td></tr>)}</tbody></table></div>
        </Card>

        <Card title="Recent invoices and refunds">
          {summary.invoices.length ? <div className="overflow-x-auto"><table className="soft-table w-full min-w-[820px] text-left text-sm"><thead className="text-xs uppercase tracking-wider text-[#737174]"><tr><th className="pb-3">Invoice</th><th className="pb-3">Customer</th><th className="pb-3">Date</th><th className="pb-3">Status</th><th className="pb-3 text-right">Tax</th><th className="pb-3 text-right">Total</th><th className="pb-3 text-right">Action</th></tr></thead><tbody>{summary.invoices.map((invoice) => <tr key={invoice.id} onClick={() => openInvoice(invoice.id)} className="cursor-pointer border-t border-black/5 hover:bg-[#F7FAFC]"><td className="py-4"><p className="font-bold">{invoice.number}</p><p className="text-xs text-[#737174]">{title(invoice.type)} | {invoice.taxMode === "GST" ? "GST" : "Non-GST"}</p></td><td className="py-4">{invoice.customer}</td><td className="py-4">{formatDateTime(invoice.createdAt)}</td><td className="py-4"><Status value={invoice.status} /></td><td className="py-4 text-right">{inr.format(invoice.tax)}</td><td className="py-4 text-right font-bold">{inr.format(invoice.total)}</td><td className="py-4 text-right"><button type="button" onClick={(event) => { event.stopPropagation(); openInvoice(invoice.id); }} className="rounded-full border border-[#E5E7EB] bg-[#F7FAFC] px-3 py-1.5 text-xs font-extrabold text-[#7b5514]">Open</button></td></tr>)}</tbody></table></div> : <Empty text="No sales or refunds in this register window." />}
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Expenses">{summary.expenses.length ? summary.expenses.map((expense) => <Row key={expense.id} primary={expense.category} secondary={`${formatDateTime(expense.spentAt)}${expense.note ? ` | ${expense.note}` : ""}`} value={inr.format(expense.amount)} />) : <Empty text="No expenses in this register window." />}</Card>
          <Card title="Stock movement">{summary.stockMovements.length ? summary.stockMovements.map((movement) => <Row key={movement.id} primary={movement.product} secondary={`${title(movement.type)} | ${formatDateTime(movement.createdAt)}${movement.reference ? ` | ${movement.reference}` : ""}`} value={String(movement.quantity)} />) : <Empty text="No stock movement in this register window." />}</Card>
        </div>
      </div>

      <aside className="h-fit rounded-[1.75rem] border border-[#E5E7EB] bg-white p-5 shadow-sm xl:sticky xl:top-24">
        {summary.state === "OPEN" ? <form onSubmit={closeRegister}>
          <p className="text-[11px] font-extrabold uppercase tracking-[.18em] text-[#1789AA]">Close day</p>
          <h3 className="mt-1 font-serif text-2xl font-semibold">Count cash drawer</h3>
          <div className="mt-5 rounded-2xl bg-[#173279] p-4 text-sm text-white">
            <Summary label="Opening cash" value={inr.format(activeSession?.openingBalance ?? 0)} />
            <Summary label="Cash sales" value={inr.format(summary.sales.CASH ?? 0)} />
            <Summary label="Cash refunds" value={`-${inr.format(summary.refunds.CASH ?? 0)}`} />
            <Summary label="Cash expenses" value={`-${inr.format(summary.summary.expenses)}`} />
            <div className="mt-3 flex justify-between border-t border-white/12 pt-3 text-lg"><span>Expected cash</span><strong>{inr.format(summary.expectedCash)}</strong></div>
          </div>
          <label className="mt-5 block text-sm font-bold text-[#1F2937]">Counted cash<input className="field mt-2" type="number" min="0" step="0.01" value={countedCash} onChange={(event) => setCountedCash(event.target.value)} /></label>
          <div className={`mt-3 rounded-2xl border p-4 text-sm font-bold ${varianceToneClass(liveVariance)}`}>Live variance: {inr.format(liveVariance)}</div>
          <label className="mt-4 block text-sm font-bold text-[#1F2937]">Closing note <span className="text-xs font-semibold text-[#737174]">Optional</span><textarea className="field mt-2 min-h-24" value={closingNote} onChange={(event) => setClosingNote(event.target.value)} placeholder="Reason for variance, cash handover, or manager note" /></label>
          <button className="primary mt-5 w-full justify-center">Close day</button>
          <p className="mt-3 text-center text-xs text-[#737174]">Closing is allowed with variance, but it is audit logged.</p>
        </form> : <form onSubmit={openRegister}>
          <p className="text-[11px] font-extrabold uppercase tracking-[.18em] text-[#1789AA]">Open day</p>
          <h3 className="mt-1 font-serif text-2xl font-semibold">{summary.state === "CLOSED" ? "Day closed" : "Start today's counter"}</h3>
          {summary.state === "CLOSED" && <div className="mt-4 rounded-2xl border border-[#a8ead8] bg-[#e7f8f2] p-4 text-sm font-bold text-[#0f6f57]">This branch register is already closed for the latest session. Open a new session only if the counter must restart.</div>}
          <label className="mt-5 block text-sm font-bold text-[#1F2937]">Opening cash balance<input className="field mt-2" type="number" min="0" step="0.01" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} /></label>
          <label className="mt-4 block text-sm font-bold text-[#1F2937]">Opening note <span className="text-xs font-semibold text-[#737174]">Optional</span><textarea className="field mt-2 min-h-24" value={openingNote} onChange={(event) => setOpeningNote(event.target.value)} placeholder="Cash handover or opening note" /></label>
          <button className="primary mt-5 w-full justify-center">Open day</button>
          <p className="mt-3 text-center text-xs text-[#737174]">One open day is allowed per branch.</p>
        </form>}
      </aside>
    </div>}
  </div>;
}
