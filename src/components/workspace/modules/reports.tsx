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
  Download,
  Gift,
  GripVertical,
  Link2,
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
// Pure GST rules - no database import, so this is safe in a client component.
import { renderInvoiceDocument, type PaperSize } from "@/lib/invoice-document";
import type { AppointmentDetail, CustomerProfile, ServiceProfile, WorkspaceData } from "@/lib/operations-types";

import { Pager } from "@/components/workspace/details";
import { getInvoice, getInvoices, updateInvoice } from "@/components/workspace/modules/reports-api";
import { Card, Empty, Info, MiniBars, Row, SlotMessage, Status, Summary, WorkspaceDateInput, WorkspaceSelect, formatDate, formatDateTime, title } from "@/components/workspace/shared-ui";

export type InvoiceListData = {
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

export type InvoiceDetail = {
  id: string;
  number: string;
  branch: { id: string; name: string; city?: string | null; address?: string | null; state?: string | null; postalCode?: string | null };
  seller?: { legalName: string; gstin: string | null; stateCode?: string | null };
  placeOfSupplyState?: string | null;
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
  lines: Array<{ id: string; type: string; description: string; quantity: number; unitPrice: number; discount: number; taxRate: number; hsnCode?: string | null; priceTaxMode: "EXCLUSIVE" | "INCLUSIVE"; tax: number; total: number; refundSourceLineId?: string | null; staff: string | null }>;
  payments: Array<{ id: string; method: string; amount: number; reference: string | null; createdAt: string }>;
  benefits: Array<{ id: string; kind: string; sourceType: string; sourceId: string | null; amount: number | null; points: number | null; note: string | null; createdAt: string }>;
  refunds: Array<{ id: string; number: string; status?: string; total: number; reason?: string | null; createdAt: string; lines?: Array<{ id: string; description: string; quantity: number; total: number; refundSourceLineId: string | null }> }>;
};

export type InvoiceActionPayload = { reason: string; method?: "CASH" | "CARD" | "UPI"; restockProducts?: boolean; lines?: Array<{ invoiceLineId: string; quantity: number }> };

export function ReportsView({ data, open, focusedInvoiceId }: { data: WorkspaceData; open: () => void; focusedInvoiceId?: string | null }) {
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
      setInvoiceData(await getInvoices<InvoiceListData>(params));
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
      setDetail(await getInvoice<InvoiceDetail>(invoiceId, branchId));
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Unable to load invoice");
    } finally {
      setDetailLoading(false);
    }
  }

  async function invoiceAction(action: "REFUND" | "VOID", options: InvoiceActionPayload) {
    if (!detail) return;
    const reason = options.reason.trim();
    if (reason.length < 3) return setLocalError("Reason must be at least 3 characters.");
    const body = action === "REFUND"
      ? { action, branchId: detail.branch.id, reason, method: options.method || "CASH", restockProducts: options.restockProducts ?? true, lines: options.lines, idempotencyKey: `refund-${newId()}` }
      : { action, branchId: detail.branch.id, reason, idempotencyKey: `void-${newId()}` };
    setDetailLoading(true);
    try {
      await updateInvoice(detail.id, body);
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
    anchor.download = `operyx-invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  function downloadInvoicePdf(paper: PaperSize) {
    if (!detail) return;
    openInvoicePrintWindow(detail, paper);
  }

  const invoices = invoiceData?.invoices || [];

  // Franchise sales pass through this workspace but belong to the franchisee. Showing one combined
  // "revenue" figure would be a wrong number an owner might act on, not a rounding error.
  const franchiseRevenue = data.metrics.franchiseMonthRevenue ?? 0;
  const companyRevenue = data.metrics.companyMonthRevenue ?? data.metrics.monthRevenue;
  const hasFranchiseRevenue = Math.abs(franchiseRevenue) > 0.01;

  const cards: Array<[string, number, string | undefined]> = [
    ["Your revenue", companyRevenue, hasFranchiseRevenue ? "Excludes franchise sales" : undefined],
    ["GST collected", data.metrics.monthTax, undefined],
    ["Expenses", data.metrics.monthExpenses, undefined],
    ["Net before payroll", companyRevenue - data.metrics.monthExpenses, undefined],
  ];

  return <div className="space-y-5">
    {hasFranchiseRevenue && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#EFD9A8] bg-[#FEF5E6] p-4">
      <div>
        <p className="text-sm font-extrabold text-[#8A5C00]">Franchise sales are not counted as your revenue</p>
        <p className="mt-0.5 text-xs font-semibold text-[#8A5C00]/85">
          FOFO branches bill under their own GSTIN, so their sales belong to the franchisee. Every figure below excludes them.
        </p>
      </div>
      <div className="text-right">
        <p className="text-[10px] font-extrabold uppercase tracking-[.12em] text-[#8A5C00]/75">Franchise sales this month</p>
        <strong className="text-lg text-[#8A5C00]">{inr.format(franchiseRevenue)}</strong>
      </div>
    </div>}

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(([label, value, hint]) => <div key={label} className="rounded-3xl bg-white p-5">
        <p className="text-sm text-[#737174]">{label}</p>
        <strong className="mt-2 block text-3xl">{inr.format(Number(value))}</strong>
        {hint && <p className="mt-1 text-xs font-semibold text-[#8A5C00]">{hint}</p>}
      </div>)}
    </div>
    <div className="grid gap-5 lg:grid-cols-2"><Card title="Revenue by day"><MiniBars items={data.trends.revenue} money /></Card><Card title="Top services"><MiniBars items={data.trends.topServices} /></Card></div>
    <Card title="Expenses" action={<button onClick={open} className="primary"><Plus size={15} /> Add expense</button>}>{data.expenses.length ? data.expenses.slice(0, 10).map((expense) => <Row key={expense.id} primary={expense.category} secondary={formatDate(new Date(expense.spentAt))} value={inr.format(expense.amount)} />) : <Empty text="No expenses recorded." />}</Card>
    <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
      <Card title="Invoice center" action={<button onClick={exportCsv} className="rounded-full border border-black/10 px-4 py-2 text-sm font-bold">Export CSV</button>}>
        <div className="grid gap-3 md:grid-cols-6"><label className="workspace-search-field md:col-span-2 flex items-center gap-2 rounded-xl border border-black/10 px-3"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} className="w-full py-3 text-sm outline-none" placeholder="Invoice, customer, phone" /></label><WorkspaceSelect value={taxMode} onChange={(value) => { setTaxMode(value); setPage(1); }} options={[{ value: "all", label: "All tax modes" }, { value: "GST", label: "GST" }, { value: "NON_GST", label: "Non-GST" }]} /><WorkspaceSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={[{ value: "all", label: "All status" }, { value: "PAID", label: "Paid" }, { value: "PARTIALLY_PAID", label: "Partial payment" }, { value: "PARTIALLY_REFUNDED", label: "Partially refunded" }, { value: "REFUNDED", label: "Refunded" }, { value: "VOID", label: "Void" }]} /><WorkspaceSelect value={type} onChange={(value) => { setType(value); setPage(1); }} options={[{ value: "all", label: "All types" }, { value: "SALE", label: "Sales" }, { value: "REFUND", label: "Refunds" }]} /><button onClick={() => void loadInvoices()} className="primary justify-center">Apply</button><WorkspaceDateInput value={dateFrom} onChange={(value) => { setDateFrom(value); setPage(1); }} /><WorkspaceDateInput value={dateTo} onChange={(value) => { setDateTo(value); setPage(1); }} /></div>
        {invoiceData && <div className="mt-5 grid gap-3 sm:grid-cols-4"><Info label="Invoices" value={String(invoiceData.summary.count)} tone="blue" /><Info label="Tax" value={inr.format(invoiceData.summary.tax)} tone="amber" /><Info label="Paid" value={inr.format(invoiceData.summary.paid)} tone="green" /><Info label="Outstanding" value={inr.format(invoiceData.summary.outstanding)} tone="rose" /></div>}
        {localError && <p className="mt-4 rounded-xl bg-[#f2ded8] p-3 text-sm font-bold text-[#995849]">{localError}</p>}
        <div className="mt-5 overflow-x-auto"><table className="soft-table w-full min-w-[900px] text-left text-sm"><thead className="text-xs uppercase tracking-wider text-[#737174]"><tr><th className="pb-3">Invoice</th><th className="pb-3">Customer</th><th className="pb-3">Date</th><th className="pb-3">Mode</th><th className="pb-3">Status</th><th className="pb-3 text-right">Total</th><th className="pb-3 text-right">Action</th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id} onClick={() => void openInvoice(invoice.id)} className={`cursor-pointer border-t border-black/5 ${selectedId === invoice.id ? "bg-[#F7FAFC]" : ""}`}><td className="py-4"><p className="font-bold">{invoice.number}</p><p className="text-xs text-[#737174]">{invoice.branch.name} | {title(invoice.type)}</p></td><td className="py-4">{invoice.customer.name}<span className="block text-xs text-[#737174]">{invoice.customer.phone}</span></td><td className="py-4">{formatDateTime(invoice.createdAt)}</td><td className="py-4"><span className={`rounded-full px-2 py-1 text-xs font-bold ${invoice.taxMode === "GST" ? "bg-[#e7f8f2] text-[#1789AA]" : "bg-[#F7FAFC] text-[#737174]"}`}>{invoice.taxMode === "GST" ? "GST" : "Non-GST"}</span></td><td className="py-4"><Status value={invoice.status} /></td><td className="py-4 text-right font-bold">{inr.format(invoice.total)}</td><td className="py-4 text-right"><button type="button" onClick={(event) => { event.stopPropagation(); void openInvoice(invoice.id); }} className="rounded-full border border-[#E5E7EB] bg-[#F7FAFC] px-3 py-1.5 text-xs font-extrabold text-[#7b5514]">Open</button></td></tr>)}</tbody></table>{loading ? <SlotMessage text="Loading invoices..." loading /> : !invoices.length && <Empty text="No invoices match these filters." />}</div>
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

export function InvoicePreview({ detail, onDownloadPdf, onInvoiceAction }: { detail: InvoiceDetail; onDownloadPdf: (paper: PaperSize) => void; onInvoiceAction: (action: "REFUND" | "VOID", options: InvoiceActionPayload) => Promise<void> }) {
  const [pendingAction, setPendingAction] = useState<"REFUND" | "VOID" | null>(null);
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState<"CASH" | "CARD" | "UPI">("CASH");
  const [restockProducts, setRestockProducts] = useState(true);
  const [refundQuantities, setRefundQuantities] = useState<Record<string, number>>({});
  const canRefund = detail.type === "SALE" && !["REFUNDED", "VOID"].includes(detail.status);
  const canVoid = detail.type === "SALE" && detail.paid === 0 && !["REFUNDED", "VOID"].includes(detail.status);
  const productLines = detail.lines.filter((line) => line.type === "PRODUCT");
  const serviceLines = detail.lines.filter((line) => line.type === "SERVICE");
  const refundedTotal = detail.refunds.reduce((sum, refund) => sum + refund.total, 0);
  const netAfterRefunds = detail.type === "SALE" ? Math.max(0, detail.total - refundedTotal) : detail.total;
  const refundedByLine = detail.refunds.reduce<Record<string, number>>((result, refund) => {
    for (const line of refund.lines || []) {
      if (!line.refundSourceLineId) continue;
      result[line.refundSourceLineId] = (result[line.refundSourceLineId] || 0) + line.quantity;
    }
    return result;
  }, {});
  const refundableQuantity = (line: InvoiceDetail["lines"][number]) => Math.max(0, Number((line.quantity - (refundedByLine[line.id] || 0)).toFixed(2)));
  const selectedRefundLines = detail.lines
    .map((line) => ({ invoiceLineId: line.id, quantity: Math.min(refundableQuantity(line), Math.max(0, refundQuantities[line.id] || 0)), line }))
    .filter((item) => item.quantity > 0);
  const selectedRefundTotal = Number((selectedRefundLines.reduce((sum, item) => {
    const ratio = item.line.quantity > 0 ? item.quantity / item.line.quantity : 0;
    return sum + item.line.total * ratio;
  }, 0) + (detail.refunds.length === 0 && detail.lines.every((line) => (refundQuantities[line.id] || 0) >= refundableQuantity(line) - 0.001) ? detail.tip : 0)).toFixed(2));
  const reversalNotes = [
    pendingAction === "REFUND" ? `Create a credit note for ${inr.format(selectedRefundTotal)} from selected lines.` : "",
    pendingAction === "REFUND" && restockProducts && productLines.length ? `${productLines.length} product line(s) will return to stock.` : "",
    pendingAction === "REFUND" && !restockProducts && productLines.length ? "Product stock will not be returned." : "",
    pendingAction === "REFUND" && serviceLines.some((line) => line.staff) ? "Service commissions for assigned staff will be reversed." : "",
    pendingAction === "REFUND" && detail.payments.some((payment) => payment.method === "WALLET") ? "Wallet redemption will be restored to the customer balance." : "",
    pendingAction === "REFUND" && detail.payments.some((payment) => payment.method === "GIFT_CARD") ? "Gift card redemption will be restored to the card balance." : "",
    pendingAction === "REFUND" && detail.benefits.some((benefit) => benefit.kind.includes("LOYALTY")) ? "Loyalty earned/redeemed on this invoice will be reversed." : "",
    pendingAction === "REFUND" && detail.benefits.some((benefit) => benefit.kind === "PACKAGE_REDEEM") ? "Package service usage will be restored." : "",
    pendingAction === "VOID" ? "Void is allowed only for unpaid invoices. No payment refund will be created." : "",
  ].filter(Boolean);

  useEffect(() => {
    if (pendingAction !== "REFUND") return;
    setRefundQuantities(Object.fromEntries(detail.lines.map((line) => [line.id, refundableQuantity(line)])));
  }, [detail.id, pendingAction]);

  async function confirmInvoiceAction() {
    if (!pendingAction || reason.trim().length < 3) return;
    if (pendingAction === "REFUND" && !selectedRefundLines.length) return;
    await onInvoiceAction(pendingAction, {
      reason,
      method: refundMethod,
      restockProducts,
      lines: pendingAction === "REFUND" ? selectedRefundLines.map((item) => ({ invoiceLineId: item.invoiceLineId, quantity: item.quantity })) : undefined,
    });
    setPendingAction(null);
    setReason("");
  }

  return <div className="overflow-hidden rounded-[1.75rem] border border-[#E5E7EB] bg-[#F7FAFC] shadow-[0_18px_60px_rgba(31,41,55,.12)]">
    <div className="bg-[#173279] p-5 text-white">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#16B994]">{detail.taxMode === "GST" ? "GST invoice" : "Non-GST invoice"}</p>
          <h3 className="mt-2 font-serif text-3xl leading-tight">{detail.number}</h3>
          <p className="mt-2 text-xs text-white/55">{formatDateTime(detail.createdAt)} | {detail.branch.name}{detail.branch.city ? `, ${detail.branch.city}` : ""}</p>
        </div>
        <Status value={detail.status} />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
        <Summary label="Paid" value={inr.format(detail.paid)} />
        <Summary label="Outstanding" value={inr.format(detail.outstanding)} />
        <Summary label="Refunded" value={inr.format(refundedTotal)} />
        <Summary label="Net sale" value={inr.format(netAfterRefunds)} />
      </div>
    </div>
    <div className="p-5">
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#1789AA]">Customer</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="font-bold">{detail.customer.name}</p>
          <span className="rounded-full bg-[#F7FAFC] px-2.5 py-1 text-xs font-bold text-[#737174]">{detail.customer.phone}</span>
        </div>
        {detail.customer.email && <p className="mt-1 text-xs text-[#737174]">{detail.customer.email}</p>}
      </div>
      <div className="mt-5 overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
        {detail.lines.map((line, index) => <div key={line.id} className="border-t border-[#E5E7EB] p-4 first:border-0">
          <div className="flex justify-between gap-4">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#1789AA]">Item {index + 1} | {title(line.type)}</p>
              <p className="mt-1 font-bold">{line.description}</p>
              <p className="mt-1 text-xs text-[#737174]">Qty {line.quantity} | Staff: {line.staff || "Not assigned"}</p>
            </div>
            <strong className="text-right">{inr.format(line.total)}</strong>
          </div>
          <p className="mt-2 text-xs text-[#737174]">Rate {inr.format(line.unitPrice)} | Discount {inr.format(line.discount)} | GST {line.taxRate}% {line.priceTaxMode === "INCLUSIVE" ? "included" : "extra"} ({inr.format(line.tax)})</p>
        </div>)}
      </div>
      <div className="mt-5 rounded-2xl bg-[#173279] p-4 text-sm text-white">
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
      {detail.refunds.length > 0 && <div className="mt-5 rounded-2xl border border-[#E5E7EB] bg-white p-4">
        <h4 className="text-sm font-extrabold">Refund history</h4>
        <div className="mt-2 space-y-3">{detail.refunds.map((refund) => <div key={refund.id} className="rounded-xl bg-[#F7FAFC] p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold">{refund.number}</p>
              <p className="text-xs text-[#737174]">{formatDateTime(refund.createdAt)}{refund.reason ? ` | ${refund.reason}` : ""}</p>
            </div>
            <strong className="text-sm text-[#984f43]">-{inr.format(refund.total)}</strong>
          </div>
          {Boolean(refund.lines?.length) && <p className="mt-2 text-xs text-[#737174]">{refund.lines!.map((line) => `${line.description} x ${line.quantity}`).join(" | ")}</p>}
        </div>)}</div>
      </div>}
      {/* Two papers, two jobs: A4 portrait is the filing and email copy, A5 landscape is the one
          handed across the counter. Each offers the same three verbs, so the choice is "which
          paper" first and "what do I do with it" second - rather than six unrelated buttons. */}
      <div className="mt-5 space-y-2">
        <InvoicePaperActions paper="A4" caption="Portrait · files and email" detail={detail} onPrint={onDownloadPdf} />
        <InvoicePaperActions paper="A5" caption="Landscape · counter copy" detail={detail} onPrint={onDownloadPdf} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {canRefund && <button type="button" onClick={() => setPendingAction("REFUND")} className="rounded-full bg-[#f2ded8] px-4 py-2 text-sm font-bold text-[#995849]">Refund</button>}
        {canVoid && <button type="button" onClick={() => setPendingAction("VOID")} className="rounded-full border border-black/10 px-4 py-2 text-sm font-bold">Void</button>}
      </div>
      {pendingAction && <div className="mt-5 rounded-2xl border border-[#e9c2b9] bg-[#fff0ec] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-extrabold text-[#984f43]">{pendingAction === "REFUND" ? "Refund reversal preview" : "Void invoice preview"}</p>
            <p className="mt-1 text-xs font-semibold text-[#7e635d]">Confirm this only after manager/accountant approval where required.</p>
          </div>
          <button type="button" onClick={() => setPendingAction(null)} className="rounded-full bg-white px-3 py-1 text-xs font-bold">Cancel</button>
        </div>
        <ul className="mt-3 space-y-1 text-xs font-semibold text-[#7e635d]">{reversalNotes.map((note) => <li key={note}>- {note}</li>)}</ul>
        {pendingAction === "REFUND" && <div className="mt-4 overflow-hidden rounded-2xl border border-[#e8c7bf] bg-white">
          <div className="grid grid-cols-[1fr_92px_96px] gap-2 bg-[#F7FAFC] px-3 py-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#8b5b51]">
            <span>Line</span><span className="text-right">Available</span><span className="text-right">Refund</span>
          </div>
          {detail.lines.map((line) => {
            const available = refundableQuantity(line);
            return <div key={line.id} className="grid grid-cols-[1fr_92px_96px] items-center gap-2 border-t border-[#f1ded9] px-3 py-3 text-sm">
              <div>
                <p className="font-bold">{line.description}</p>
                <p className="text-xs text-[#737174]">{title(line.type)} | Sold {line.quantity} | {inr.format(line.total)}</p>
              </div>
              <span className="text-right text-xs font-bold text-[#737174]">{available}</span>
              <input className="field p-2 text-right" type="number" min="0" max={available} step="0.01" disabled={available <= 0} value={refundQuantities[line.id] ?? 0} onChange={(event) => setRefundQuantities((current) => ({ ...current, [line.id]: Number(event.target.value) }))} />
            </div>;
          })}
          <div className="flex items-center justify-between border-t border-[#f1ded9] bg-[#F7FAFC] px-3 py-3 text-sm font-extrabold">
            <span>Selected credit note total</span>
            <strong className="text-[#984f43]">{inr.format(selectedRefundTotal)}</strong>
          </div>
        </div>}
        {pendingAction === "REFUND" && <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <WorkspaceSelect label="Refund method" value={refundMethod} onChange={(value) => setRefundMethod(value as typeof refundMethod)} options={(["CASH", "CARD", "UPI"] as const).map((method) => ({ value: method, label: method }))} compact />
          <label className="flex items-center gap-2 self-end rounded-2xl bg-white px-3 py-3 text-xs font-bold text-[#1F2937]"><input type="checkbox" checked={restockProducts} onChange={(event) => setRestockProducts(event.target.checked)} /> Return product lines to stock</label>
        </div>}
        <label className="mt-4 block text-xs font-bold text-[#1F2937]">Reason<textarea className="field mt-1 min-h-20" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={pendingAction === "REFUND" ? "Example: Customer service correction, product return, duplicate billing" : "Example: Draft invoice created by mistake"} /></label>
        <button type="button" disabled={reason.trim().length < 3 || (pendingAction === "REFUND" && (!selectedRefundLines.length || selectedRefundTotal <= 0))} onClick={() => void confirmInvoiceAction()} className="mt-4 w-full rounded-full bg-[#984f43] px-4 py-3 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-45">Confirm {title(pendingAction.toLowerCase())}</button>
      </div>}
      <p className="mt-4 text-center text-xs text-[#737174]">Thank you for choosing Operyx.</p>
    </div>
  </div>;
}

/**
 * Open the invoice in a print window. A4 is the filing copy, A5 the counter copy handed to the
 * customer; the paper size changes the sheet and the type scale, not the content - a smaller bill
 * is not a less legal one.
 */
export function openInvoicePrintWindow(detail: InvoiceDetail, paper: PaperSize = "A4") {
  const popup = window.open("", "_blank", "width=920,height=1100");
  if (!popup) {
    window.print();
    return;
  }
  popup.document.write(renderInvoiceDocument(detail, paper));
  popup.document.close();
}

/**
 * One paper size, three verbs.
 *
 * Download and Share both need a real file, so both go through the server PDF route; Print stays
 * client-side because the browser's own dialog is the fastest path to a printer at a counter.
 */
function InvoicePaperActions({ paper, caption, detail, onPrint }: {
  paper: PaperSize;
  caption: string;
  detail: InvoiceDetail;
  onPrint: (paper: PaperSize) => void;
}) {
  const [busy, setBusy] = useState<"download" | "share" | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [note, setNote] = useState("");

  const pdfUrl = `/api/v1/operations/invoices/${detail.id}/pdf?paper=${paper}&branchId=${encodeURIComponent(detail.branch.id)}`;
  const fileName = `${detail.number.replace(/[^A-Za-z0-9]+/g, "-")}-${paper}.pdf`;
  const invoiceLink = typeof window === "undefined" ? "" : `${window.location.origin}/workspace/billing?invoiceId=${detail.id}`;
  const message = `Hi ${detail.customer.name}, here is your invoice ${detail.number} for ${inr.format(detail.total)} from ${detail.branch.name}.`;

  async function fetchPdf() {
    const response = await fetch(pdfUrl);
    if (!response.ok) throw new Error("Could not build the PDF");
    return new File([await response.blob()], fileName, { type: "application/pdf" });
  }

  async function download() {
    setBusy("download");
    setNote("");
    try {
      const file = await fetchPdf();
      const href = URL.createObjectURL(file);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(href);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Could not build the PDF");
    } finally {
      setBusy(null);
    }
  }

  /** The device's own share sheet, which is the only route that can attach the PDF itself. */
  async function shareFile() {
    setBusy("share");
    setNote("");
    try {
      const file = await fetchPdf();
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: detail.number, text: message });
      } else {
        setNote("This device can't attach files. Use WhatsApp or Email, or download it first.");
      }
    } catch (error) {
      // A cancelled share sheet is not a failure worth shouting about.
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setNote(error instanceof Error ? error.message : "Could not share the PDF");
      }
    } finally {
      setBusy(null);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(invoiceLink);
    setNote("Link copied. It opens for signed-in staff only.");
  }

  const dial = detail.customer.phone.replace(/[^\d]/g, "");

  return <div className="rounded-2xl border border-[#E5E7EB] bg-white p-2.5">
    <div className="flex flex-wrap items-center gap-2">
      <div className="mr-auto min-w-0 pl-1">
        <p className="text-sm font-extrabold text-[#1F2937]">{paper}</p>
        <p className="text-[11px] font-semibold text-[#9CA3AF]">{caption}</p>
      </div>

      <button type="button" onClick={() => void download()} disabled={busy === "download"} className="inline-flex items-center gap-1.5 rounded-full bg-[#5B2A86] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#472066] disabled:opacity-60">
        <Download size={15} />{busy === "download" ? "Building..." : "Download"}
      </button>
      <button type="button" onClick={() => onPrint(paper)} className="inline-flex items-center gap-1.5 rounded-full border border-[#5B2A86] px-4 py-2 text-sm font-bold text-[#5B2A86] transition hover:bg-[#F3E8FF]">
        <ReceiptText size={15} />Print
      </button>
      <div className="relative">
        <button type="button" onClick={() => setShareOpen(!shareOpen)} aria-expanded={shareOpen} className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-bold text-[#6B7280] transition hover:border-[#5B2A86]/30 hover:text-[#5B2A86]">
          <Send size={15} />Share
        </button>
        {shareOpen && <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-lg">
          <a href={`https://wa.me/${dial}?text=${encodeURIComponent(`${message} ${invoiceLink}`)}`} target="_blank" rel="noreferrer" onClick={() => setShareOpen(false)} className="flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-[#1F2937] hover:bg-[#F6F7FB]">
            <MessageCircle size={15} className="text-[#0B6B4F]" />WhatsApp customer
          </a>
          <a href={detail.customer.email ? `mailto:${detail.customer.email}?subject=${encodeURIComponent(`Invoice ${detail.number}`)}&body=${encodeURIComponent(`${message}\n\n${invoiceLink}`)}` : undefined} onClick={() => setShareOpen(false)} className={`flex items-center gap-2 px-3 py-2.5 text-sm font-bold hover:bg-[#F6F7FB] ${detail.customer.email ? "text-[#1F2937]" : "pointer-events-none text-[#C7CBD1]"}`}>
            <Mail size={15} />{detail.customer.email ? "Email customer" : "No email on file"}
          </a>
          <button type="button" onClick={() => { setShareOpen(false); void shareFile(); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-bold text-[#1F2937] hover:bg-[#F6F7FB]">
            <Send size={15} />{busy === "share" ? "Preparing..." : "Share PDF file"}
          </button>
          <button type="button" onClick={() => { setShareOpen(false); void copyLink(); }} className="flex w-full items-center gap-2 border-t border-[#F0F1F4] px-3 py-2.5 text-left text-sm font-bold text-[#1F2937] hover:bg-[#F6F7FB]">
            <Link2 size={15} />Copy invoice link
          </button>
        </div>}
      </div>
    </div>
    {note && <p className="mt-2 px-1 text-[11px] font-semibold text-[#6B7280]">{note}</p>}
  </div>;
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] || character));
}
