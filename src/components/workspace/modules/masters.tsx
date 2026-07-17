"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AlertTriangle, Layers, Plus, RefreshCw, Search } from "lucide-react";
import type { WorkspaceData } from "@/lib/operations-types";
// Types only - importing from @/lib/masters would pull the database and next/headers into the
// client bundle.
import { type MasterType } from "@/lib/masters-types";

import {
  Badge,
  Banner,
  Button,
  Card,
  Cell,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Row,
  SkeletonTable,
  Table,
} from "@/components/ui";
import { queryWorkspace } from "@/components/workspace/client";
import { SubmitFn } from "@/components/workspace/contracts";
import { CouponsPanel } from "@/components/workspace/modules/masters-coupons";
import { VendorsView } from "@/components/workspace/modules/vendors";
import { WorkspaceSelect } from "@/components/workspace/shared-ui";

type MasterRow = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  usageCount: number;
  meta: Record<string, string | number | boolean | null>;
};

type MasterPayload = {
  type: MasterType;
  label: { title: string; singular: string; blurb: string };
  rows: MasterRow[];
  vendors: Array<{ id: string; name: string }>;
};

type MasterTab = MasterType | "coupons" | "vendors";

const TAB_LABELS: Record<MasterTab, string> = {
  "service-categories": "Service categories",
  "product-categories": "Product categories",
  "brands": "Brands",
  "units": "Units",
  "tax-classes": "Tax classes",
  "coupons": "Coupons",
  "vendors": "Vendors & brands",
  "expense-categories": "Expense categories",
};

const TAB_GROUPS: Array<{ label: string; tabs: MasterTab[] }> = [
  { label: "Catalogue", tabs: ["service-categories", "product-categories", "brands", "units"] },
  { label: "Commercial", tabs: ["tax-classes", "coupons"] },
  { label: "Suppliers", tabs: ["vendors", "expense-categories"] },
];

/** Tabs that render their own panel instead of the generic master table. */
const CUSTOM_TABS = new Set<MasterTab>(["coupons", "vendors"]);

/**
 * Which masters belong to which part of the business.
 *
 * A salon owner thinks in domains, not in a flat "masters" bucket: everything about products in one
 * place, everything about services in another, the money-and-supplier settings in a third. The
 * Products and Services screens embed this with their own scope so the owner never has to hunt.
 */
export type MasterScope = "all" | "products" | "services" | "suppliers";

const SCOPE_TABS: Record<MasterScope, MasterTab[]> = {
  all: ["service-categories", "product-categories", "brands", "units", "tax-classes", "coupons", "vendors", "expense-categories"],
  products: ["product-categories", "brands", "units", "tax-classes"],
  services: ["service-categories", "tax-classes"],
  // Coupons live on the Offers screen, so Suppliers is vendors-and-brands plus expense heads.
  suppliers: ["vendors", "expense-categories"],
};

export function MastersView({ data, submit, scope = "all", flush = false }: { data: WorkspaceData; submit: SubmitFn; scope?: MasterScope; flush?: boolean }) {
  // Only the tabs this scope owns. The Products and Services screens pass a scope so each shows
  // just its own setup; the standalone Masters nav item passes nothing and shows everything.
  const allowed = SCOPE_TABS[scope];
  const groups = TAB_GROUPS
    .map((group) => ({ ...group, tabs: group.tabs.filter((item) => allowed.includes(item)) }))
    .filter((group) => group.tabs.length > 0);
  const singleGroup = groups.length <= 1;

  const [tab, setTab] = useState<MasterTab>(allowed[0]);
  const type = (CUSTOM_TABS.has(tab) ? "product-categories" : tab) as MasterType;

  const [payload, setPayload] = useState<MasterPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<MasterRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [archiving, setArchiving] = useState<MasterRow | null>(null);
  const [busy, setBusy] = useState(false);
  const branchId = data.identity.branchId || "";

  const load = useCallback(async () => {
    if (CUSTOM_TABS.has(tab)) return;
    setLoading(true);
    setError("");
    try {
      setPayload(await queryWorkspace<MasterPayload>(`/api/v1/operations/masters/${type}?branchId=${encodeURIComponent(branchId || "all")}&includeArchived=${showArchived}`));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load masters");
    } finally {
      setLoading(false);
    }
  }, [tab, type, branchId, showArchived]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values: Record<string, unknown> = { name: String(form.get("name") || "").trim() };

    if (form.get("code") !== null) values.code = String(form.get("code") || "").trim() || null;
    if (form.get("description") !== null) values.description = String(form.get("description") || "").trim() || null;
    if (type === "tax-classes") {
      values.kind = String(form.get("kind") || "GOODS");
      values.rate = Number(form.get("rate") || 0);
    }
    if (type === "units") values.allowsFraction = form.get("allowsFraction") === "on";
    if (type === "brands") values.vendorId = String(form.get("vendorId") || "") || null;

    setBusy(true);
    const result = editing
      ? await submit(`/api/v1/operations/masters/${type}`, { id: editing.id, branchId, patch: values }, "Saved.", "PATCH", false)
      : await submit(`/api/v1/operations/masters/${type}`, { ...values, branchId }, "Created.", "POST", false);
    setBusy(false);

    if (result.ok) {
      setEditing(null);
      setCreating(false);
      await load();
    } else {
      setError(result.error);
    }
  }

  async function confirmArchive() {
    if (!archiving) return;
    setBusy(true);
    const result = await submit(
      `/api/v1/operations/masters/${type}`,
      { id: archiving.id, branchId, patch: { isActive: !archiving.isActive } },
      archiving.isActive ? "Archived." : "Restored.",
      "PATCH",
      false,
    );
    setBusy(false);
    setArchiving(null);
    if (result.ok) await load();
    else setError(result.error);
  }

  const rows = (payload?.rows || []).filter((row) => `${row.name} ${row.code ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  const isTax = type === "tax-classes";
  const editorOpen = creating || Boolean(editing);

  const headers = ["Name", ...(type === "units" || isTax ? ["Code"] : []), ...(isTax ? ["Rate"] : []), ...(type === "brands" ? ["Vendor"] : []), "In use by", ""];

  // A scoped view (inside Products/Services) is a short list, so drop the group headers and show a
  // flat row. The standalone Masters screen keeps the group headers because it holds everything.
  const flat = scope !== "all" || singleGroup;
  const tabButton = (item: MasterTab) => <button
    key={item}
    type="button"
    onClick={() => { setTab(item); setQuery(""); setEditing(null); setCreating(false); }}
    className={`rounded-[var(--radius-sm)] px-3 py-1.5 text-[13px] font-medium transition-colors duration-[var(--dur-fast)] focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] ${tab === item ? "bg-[var(--accent-soft)] text-[var(--accent-text)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"}`}
  >{TAB_LABELS[item]}</button>;

  return <div className="space-y-4">
    {/* Grouped when showing everything - a flat row of nine tabs makes you read all nine to find
        one. Flat when scoped, because the list is already short. */}
    <div className={`flex flex-wrap items-center gap-x-5 gap-y-2 ${flush ? "" : "rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-card)] p-3 shadow-[var(--shadow-sm)]"}`}>
      {flat
        ? groups.flatMap((group) => group.tabs).map(tabButton)
        : groups.map((group) => <div key={group.label} className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{group.label}</span>
            {group.tabs.map(tabButton)}
          </div>)}
    </div>

    {tab === "coupons" && <CouponsPanel data={data} submit={submit} />}

    {tab === "vendors" && <VendorsView data={data} submit={submit} />}

    {!CUSTOM_TABS.has(tab) && <Card
      title={payload?.label.title || "Masters"}
      description={payload?.label.blurb}
      action={<>
        <IconButton label="Refresh" variant="secondary" size="sm" onClick={() => void load()}><RefreshCw size={15} /></IconButton>
        <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={() => { setCreating(true); setEditing(null); }}>Add</Button>
      </>}
    >
      {isTax && <Banner tone="warning" icon={<AlertTriangle size={15} />} title="These codes need your confirmation">
        HSN and SAC codes are printed on GST invoices and are legally required. The seeded codes are a starting point - check them against your product mix before issuing invoices.
      </Banner>}

      {error && <div className={isTax ? "mt-3" : ""}><Banner tone="danger" icon={<AlertTriangle size={15} />} onDismiss={() => setError("")}>{error}</Banner></div>}

      <div className={`flex flex-wrap gap-2 ${isTax || error ? "mt-4" : ""}`}>
        <div className="relative min-w-0 flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search" />
        </div>
        <label className="flex h-[var(--control-h)] shrink-0 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-card)] px-3 text-[13px] font-medium text-[var(--text-secondary)]">
          <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Show archived
        </label>
      </div>

      {editorOpen && <form onSubmit={save} className="mt-4 grid gap-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-sunken)] p-4 md:grid-cols-2">
        <Field label="Name"><Input name="name" required defaultValue={editing?.name || ""} placeholder="Name" autoFocus /></Field>

        {(type === "units" || isTax) && <Field
          label={isTax ? "HSN / SAC code" : "Short code"}
          hint={isTax ? "The first digits identify the goods or service class" : "Shown on the POS and invoices"}
        >
          <Input name="code" required defaultValue={editing?.code || ""} placeholder={isTax ? "3305 or 999721" : "ml"} />
        </Field>}

        {isTax && <>
          <WorkspaceSelect name="kind" label="Applies to" defaultValue={String(editing?.meta.kind || "GOODS")} options={[{ value: "GOODS", label: "Products (HSN)" }, { value: "SERVICE", label: "Services (SAC)" }]} />
          <Field label="GST rate %"><Input name="rate" type="number" min="0" max="100" step="0.01" required defaultValue={String(editing?.meta.rate ?? 18)} /></Field>
        </>}

        {type === "units" && <label className="flex items-end gap-2 pb-2 text-[13px] font-medium text-[var(--text-primary)]">
          <input type="checkbox" name="allowsFraction" defaultChecked={editing ? Boolean(editing.meta.allowsFraction) : true} />
          Can be a fraction (ml, grams)
        </label>}

        {type === "brands" && <WorkspaceSelect name="vendorId" label="Supplied by" required={false} defaultValue={String(editing?.meta.vendorId || "")} options={[{ value: "", label: "No vendor" }, ...(payload?.vendors || []).map((vendor) => ({ value: vendor.id, label: vendor.name }))]} />}

        {type !== "units" && !isTax && <Field label="Description"><Input name="description" defaultValue={editing?.description || ""} placeholder="Optional" /></Field>}

        <div className="flex gap-2 md:col-span-2">
          <Button type="submit" variant="primary" loading={busy}>{editing ? "Save changes" : "Create"}</Button>
          <Button type="button" variant="ghost" onClick={() => { setEditing(null); setCreating(false); }}>Cancel</Button>
        </div>
      </form>}

      <div className="mt-4">
        {loading ? <SkeletonTable rows={4} columns={4} /> : rows.length ? <Table headers={headers} minWidth={640}>
          {rows.map((row) => <Row key={row.id}>
            <Cell>
              <div className={row.isActive ? "" : "opacity-55"}>
                <p className="font-medium text-[var(--text-primary)]">{row.name}</p>
                {row.description && <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{row.description}</p>}
                {!row.isActive && <span className="mt-1 inline-block"><Badge>Archived</Badge></span>}
              </div>
            </Cell>
            {(type === "units" || isTax) && <Cell muted><span className="font-mono text-xs">{row.code}</span></Cell>}
            {isTax && <Cell><span className="tabular-nums">{String(row.meta.rate)}%</span></Cell>}
            {type === "brands" && <Cell muted>{String(row.meta.vendorName || "-")}</Cell>}
            <Cell>
              {/* The usage count is the fact that decides whether archiving is safe, so it sits in
                  the table rather than only in the confirm dialog. */}
              {row.usageCount
                ? <Badge tone="info">{row.usageCount} record{row.usageCount === 1 ? "" : "s"}</Badge>
                : <Badge>Not used</Badge>}
            </Cell>
            <Cell align="right">
              <div className="flex justify-end gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => { setEditing(row); setCreating(false); }}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => setArchiving(row)}>{row.isActive ? "Archive" : "Restore"}</Button>
              </div>
            </Cell>
          </Row>)}
        </Table> : <EmptyState
          icon={<Layers size={18} />}
          title={query ? `Nothing matches "${query}"` : `Add your first ${payload?.label.singular ?? "record"}`}
          description={query ? "Try a different search." : payload?.label.blurb}
          action={!query ? <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={() => setCreating(true)}>Add</Button> : undefined}
        />}
      </div>
    </Card>}

    {/* Archive, never delete: invoices and stock movements point at these rows. The dialog says so
        plainly rather than asking "are you sure?" */}
    {archiving && <ConfirmDialog
      title={`${archiving.isActive ? "Archive" : "Restore"} ${archiving.name}?`}
      consequence={archiving.isActive
        ? archiving.usageCount
          ? `${archiving.usageCount} record${archiving.usageCount === 1 ? "" : "s"} already use this. They keep it and stay unchanged - it just cannot be picked for anything new.`
          : "Nothing uses this yet. It will be hidden from new records."
        : "It becomes selectable again on new records."}
      confirmLabel={archiving.isActive ? "Archive" : "Restore"}
      tone={archiving.isActive ? "danger" : "accent"}
      busy={busy}
      onConfirm={() => void confirmArchive()}
      onCancel={() => setArchiving(null)}
    />}
  </div>;
}
