"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Plus, ReceiptText, Search } from "lucide-react";
import { newId } from "@/lib/client-id";
import { inr } from "@/lib/format";
import type { WorkspaceData } from "@/lib/operations-types";

import { PosSeed, SubmitFn } from "@/components/workspace/contracts";
import { PosViewV2 } from "@/components/workspace/modules/pos";
import { getInvoice, getInvoices, updateInvoice } from "@/components/workspace/modules/reports-api";
import {
  InvoicePreview,
  openInvoicePrintWindow,
  type InvoiceActionPayload,
  type InvoiceDetail,
  type InvoiceListData,
} from "@/components/workspace/modules/reports";
import { Pager } from "@/components/workspace/details";
import { Card, Empty, Info, SlotMessage, Status, WorkspaceDateInput, WorkspaceSelect, formatDateTime, title } from "@/components/workspace/shared-ui";

/**
 * Billing.
 *
 * Billing used to open straight into a half-finished sale, and the invoices - the thing anyone
 * actually comes to this screen to find - lived inside Reports, next to expense charts.
 *
 * That is backwards. Most visits to Billing are to *look something up*: what did she pay, did that
 * refund go through, is this one still unpaid. Taking a new payment is an action you start, not a
 * screen you land in.
 *
 * So: invoices are the page. "New sale" is a button on it. Both live in the same module, because a
 * sale becomes an invoice and reception moves between the two constantly.
 */

export function BillingWorkspace({ data, submit, seed, clearSeed, focusedInvoiceId, onSelectBranch }: {
  data: WorkspaceData;
  submit: SubmitFn;
  seed?: PosSeed | null;
  clearSeed?: () => void;
  focusedInvoiceId?: string | null;
  /** Narrow the workspace to one branch, because a bill belongs to exactly one. */
  onSelectBranch?: (branchId: string) => void;
}) {
  // A seed means someone arrived here to bill a specific appointment or customer - so open the
  // sale, not the list.
  const [mode, setMode] = useState<"invoices" | "sale">(seed ? "sale" : "invoices");
  /**
   * The invoice a just-finished sale produced. Without this the id the POS hands over was dropped
   * and the receptionist landed on the list to hunt for the bill they had just taken money for.
   */
  const [justBilledId, setJustBilledId] = useState<string | null>(null);

  useEffect(() => { if (seed) setMode("sale"); }, [seed]);

  /** Leave the sale and show a specific invoice, when we know which one. */
  const leaveSaleFor = (invoiceId?: string) => {
    clearSeed?.();
    setJustBilledId(invoiceId ?? null);
    setMode("invoices");
  };

  if (mode === "sale") {
    const backLink = <button
      type="button"
      onClick={() => leaveSaleFor()}
      className="inline-flex items-center gap-1.5 text-sm font-bold text-[#6B7280] transition hover:text-[#5B2A86]"
    >
      <ArrowLeft size={15} /> Back to invoices
    </button>;

    /**
     * A bill belongs to exactly one branch. If the workspace is showing all of them, the old code
     * printed "Select a specific branch before recording a bill" and stopped - an error message
     * where a question should be. Ask instead.
     */
    if (!data.identity.branchId) {
      return <div className="space-y-4">
        {backLink}
        <BranchChooser branches={data.identity.branches} onSelect={onSelectBranch} />
      </div>;
    }

    return <div className="space-y-4">
      {backLink}
      <PosViewV2
        data={data}
        submit={submit}
        seed={seed}
        clearSeed={clearSeed}
        openInvoice={leaveSaleFor}
      />
    </div>;
  }

  return <InvoiceCenter
    data={data}
    // The invoice just billed wins over one deep-linked from the URL: it is the one the person in
    // front of the counter is waiting for.
    focusedInvoiceId={justBilledId ?? focusedInvoiceId}
    onNewSale={() => { setJustBilledId(null); setMode("sale"); }}
  />;
}

/**
 * Which branch is this sale for?
 *
 * A bill belongs to exactly one branch, so if the workspace is showing several this has to be
 * asked. A brand with fifty branches cannot scan a grid, so it is searchable, and branches are
 * grouped under the business that operates them - a franchisee's till is not the company's.
 */
function BranchChooser({ branches, onSelect }: {
  branches: WorkspaceData["identity"]["branches"];
  onSelect?: (branchId: string) => void;
}) {
  const [search, setSearch] = useState("");

  const query = search.trim().toLowerCase();
  const matches = query
    ? branches.filter((branch) => `${branch.name} ${branch.city} ${branch.state} ${branch.operatorName ?? ""}`.toLowerCase().includes(query))
    : branches;

  const groups = [...matches.reduce((map, branch) => {
    const key = branch.operatorName ?? "Your company";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(branch);
    return map;
  }, new Map<string, typeof branches>()).entries()].sort(([left], [right]) => left.localeCompare(right));

  return <Card title="Which branch is this sale for?">
    <p className="-mt-2 text-sm font-semibold text-[#6B7280]">
      You are looking at {branches.length} branches. A bill has to belong to one of them.
    </p>

    <div className="relative mt-4">
      <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-[#9a938b]" />
      <input
        className="field pl-10"
        placeholder="Search branch, city, or business"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        autoFocus
      />
    </div>

    <div className="mt-4 max-h-[26rem] space-y-4 overflow-y-auto">
      {groups.map(([operator, operatorBranches]) => <div key={operator}>
        <p className="px-1 pb-1.5 text-[10px] font-extrabold uppercase tracking-[.14em] text-[#9CA3AF]">{operator}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {operatorBranches.map((branch) => <button
            key={branch.id}
            type="button"
            disabled={!onSelect}
            onClick={() => onSelect?.(branch.id)}
            className="flex items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-4 text-left transition hover:border-[#5B2A86] hover:bg-[#F9F7FC] disabled:opacity-50"
          >
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="truncate font-extrabold text-[#1F2937]">{branch.name}</span>
                <span className="shrink-0 rounded-full bg-[#F6F7FB] px-1.5 py-0.5 text-[9px] font-extrabold text-[#6B7280]">{branch.ownershipModel}</span>
              </span>
              {/* A branch that cannot legally invoice says so before you ring up three items. */}
              <span className={`mt-0.5 block truncate text-xs font-semibold ${branch.gstReady ? "text-[#6B7280]" : "text-[#94302E]"}`}>
                {branch.gstReady ? branch.city : "No GSTIN - GST billing blocked here"}
              </span>
            </span>
            <ArrowLeft size={16} className="shrink-0 rotate-180 text-[#9CA3AF]" />
          </button>)}
        </div>
      </div>)}

      {!matches.length && <Empty text={`No branch matches "${search}".`} />}
    </div>
  </Card>;
}

function InvoiceCenter({ data, focusedInvoiceId, onNewSale }: {
  data: WorkspaceData;
  focusedInvoiceId?: string | null;
  onNewSale: () => void;
}) {
  const branchId = data.identity.branchId || "all";
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [taxMode, setTaxMode] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [invoiceData, setInvoiceData] = useState<InvoiceListData | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");

  const loadInvoices = useCallback(async () => {
    const params = new URLSearchParams({ branchId, page: String(page), pageSize: "20" });
    if (query.trim()) params.set("query", query.trim());
    if (taxMode !== "all") params.set("taxMode", taxMode);
    if (status !== "all") params.set("status", status);
    if (type !== "all") params.set("type", type);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    setLoading(true);
    setError("");
    try {
      setInvoiceData(await getInvoices<InvoiceListData>(params));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load invoices");
    } finally {
      setLoading(false);
    }
  }, [branchId, dateFrom, dateTo, page, query, status, taxMode, type]);

  useEffect(() => { queueMicrotask(() => void loadInvoices()); }, [loadInvoices]);

  const openInvoice = useCallback(async (invoiceId: string) => {
    setSelectedId(invoiceId);
    setDetailLoading(true);
    setError("");
    try {
      setDetail(await getInvoice<InvoiceDetail>(invoiceId, branchId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load invoice");
    } finally {
      setDetailLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    if (focusedInvoiceId) void openInvoice(focusedInvoiceId);
  }, [focusedInvoiceId, openInvoice]);

  async function invoiceAction(action: "REFUND" | "VOID", options: InvoiceActionPayload) {
    if (!detail) return;
    const reason = options.reason.trim();
    if (reason.length < 3) return setError("Reason must be at least 3 characters.");
    const body = action === "REFUND"
      ? { action, branchId: detail.branch.id, reason, method: options.method || "CASH", restockProducts: options.restockProducts ?? true, lines: options.lines, idempotencyKey: `refund-${newId()}` }
      : { action, branchId: detail.branch.id, reason, idempotencyKey: `void-${newId()}` };
    setDetailLoading(true);
    try {
      await updateInvoice(detail.id, body);
      await loadInvoices();
      await openInvoice(detail.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to update invoice");
    } finally {
      setDetailLoading(false);
    }
  }

  function exportCsv() {
    const rows = [
      ["Invoice", "Customer", "Phone", "Branch", "Date", "Type", "Tax mode", "Status", "Payment methods", "Tax", "Total", "Outstanding"],
      ...(invoiceData?.invoices || []).map((invoice) => [invoice.number, invoice.customer.name, invoice.customer.phone, invoice.branch.name, invoice.createdAt, invoice.type, invoice.taxMode, invoice.status, invoice.payments.map((payment) => payment.method).join(" + "), String(invoice.tax), String(invoice.total), String(invoice.outstanding)]),
    ];
    const blob = new Blob([rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `operyx-invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  const invoices = invoiceData?.invoices || [];
  const unpaidCount = invoices.filter((invoice) => invoice.outstanding > 0).length;
  const anyFilterActive = status !== "all" || type !== "all" || taxMode !== "all" || Boolean(dateFrom) || Boolean(dateTo);

  return <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
    <Card
      title="Invoices"
      action={<>
        <button type="button" onClick={exportCsv} className="rounded-full border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-bold text-[#6B7280]">Export CSV</button>
        <button type="button" onClick={onNewSale} className="primary"><Plus size={15} /> New sale</button>
      </>}
    >
      {/* Two questions get one tap each; the rest hide behind "More filters", as on Bookings. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {([
          ["all", "All", invoices.length],
          ["PARTIALLY_PAID", "Unpaid", unpaidCount],
        ] as const).map(([value, label, count]) => <button
          key={value}
          type="button"
          onClick={() => { setStatus(value); setPage(1); }}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-extrabold transition ${status === value ? "bg-[#5B2A86] text-white shadow-sm" : "bg-[#F6F7FB] text-[#6B7280] hover:bg-[#EFE8F6] hover:text-[#5B2A86]"}`}
        >
          {label}
          <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${status === value ? "bg-white/20" : count && value !== "all" ? "bg-[#F5D0C5] text-[#984f43]" : "bg-white text-[#9CA3AF]"}`}>{count}</span>
        </button>)}

        <div className="ml-auto flex items-center gap-2">
          <div className="relative w-60">
            <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-[#9a938b]" />
            <input className="field pl-10" placeholder="Invoice, customer, phone" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen((value) => !value)}
            className={`rounded-xl border px-3 py-3 text-sm font-extrabold transition ${filtersOpen || anyFilterActive ? "border-[#5B2A86] bg-[#EFE8F6] text-[#5B2A86]" : "border-[#E5E7EB] bg-white text-[#6B7280]"}`}
          >More filters</button>
        </div>
      </div>

      {filtersOpen && <div className="mb-4 grid gap-2 rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] p-3 md:grid-cols-5">
        <WorkspaceSelect value={taxMode} onChange={(value) => { setTaxMode(value); setPage(1); }} options={[{ value: "all", label: "All tax modes" }, { value: "GST", label: "GST" }, { value: "NON_GST", label: "Non-GST" }]} />
        <WorkspaceSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={[{ value: "all", label: "All status" }, { value: "PAID", label: "Paid" }, { value: "PARTIALLY_PAID", label: "Partial payment" }, { value: "PARTIALLY_REFUNDED", label: "Partially refunded" }, { value: "REFUNDED", label: "Refunded" }, { value: "VOID", label: "Void" }]} />
        <WorkspaceSelect value={type} onChange={(value) => { setType(value); setPage(1); }} options={[{ value: "all", label: "All types" }, { value: "SALE", label: "Sales" }, { value: "REFUND", label: "Refunds" }]} />
        <WorkspaceDateInput value={dateFrom} onChange={(value) => { setDateFrom(value); setPage(1); }} />
        <WorkspaceDateInput value={dateTo} onChange={(value) => { setDateTo(value); setPage(1); }} />
      </div>}

      {invoiceData && <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Info label="Invoices" value={String(invoiceData.summary.count)} tone="blue" />
        <Info label="Tax" value={inr.format(invoiceData.summary.tax)} tone="amber" />
        <Info label="Paid" value={inr.format(invoiceData.summary.paid)} tone="green" />
        <Info label="Outstanding" value={inr.format(invoiceData.summary.outstanding)} tone={invoiceData.summary.outstanding ? "rose" : "green"} />
      </div>}

      {error && <p className="mb-3 rounded-xl bg-[#f2ded8] p-3 text-sm font-bold text-[#995849]">{error}</p>}

      <div className="overflow-x-auto">
        <table className="soft-table w-full min-w-[820px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-[#9CA3AF]">
            <tr><th className="pb-3">Invoice</th><th className="pb-3">Customer</th><th className="pb-3">Date</th><th className="pb-3">Status</th><th className="pb-3 text-right">Total</th></tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => <tr
              key={invoice.id}
              onClick={() => void openInvoice(invoice.id)}
              className={`cursor-pointer border-t border-black/5 transition hover:bg-[#F9FAFB] ${selectedId === invoice.id ? "bg-[#EFE8F6]" : ""}`}
            >
              <td className="py-3">
                <p className="font-bold">{invoice.number}</p>
                <p className="text-xs text-[#9CA3AF]">{invoice.branch.name} | {title(invoice.type)}</p>
              </td>
              <td className="py-3">{invoice.customer.name}<span className="block text-xs text-[#9CA3AF]">{invoice.customer.phone}</span></td>
              <td className="py-3 text-[#6B7280]">{formatDateTime(invoice.createdAt)}</td>
              <td className="py-3"><Status value={invoice.status} /></td>
              <td className="py-3 text-right">
                <strong className="tabular-nums">{inr.format(invoice.total)}</strong>
                {invoice.outstanding > 0 && <span className="block text-xs font-bold text-[#b47a18]">{inr.format(invoice.outstanding)} due</span>}
              </td>
            </tr>)}
          </tbody>
        </table>
        {loading ? <SlotMessage text="Loading invoices..." loading /> : !invoices.length && <Empty text={query || anyFilterActive ? "No invoices match these filters." : "No invoices yet. Take a payment and it appears here."} />}
      </div>

      {invoiceData && <Pager page={page} total={invoiceData.pagination.total} pageSize={invoiceData.pagination.pageSize} setPage={setPage} />}
    </Card>

    <aside className="h-fit rounded-3xl bg-white p-6 shadow-sm">
      {!detail && !detailLoading && <SlotMessage text="Select an invoice to see its lines, payments, and refund actions." />}
      {detailLoading && <SlotMessage text="Loading invoice..." loading />}
      {detail && !detailLoading && <InvoicePreview detail={detail} onDownloadPdf={(paper) => openInvoicePrintWindow(detail, paper)} onInvoiceAction={invoiceAction} />}
    </aside>
  </div>;
}

export { ReceiptText };
