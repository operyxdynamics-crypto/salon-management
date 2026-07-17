"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AlertTriangle, Plus, Store, Tag, Truck, X } from "lucide-react";
import type { WorkspaceData } from "@/lib/operations-types";

import { Badge, Banner, Button, Card, EmptyState, Field, Input, Overlay, SkeletonTable } from "@/components/ui";
import { queryWorkspace } from "@/components/workspace/client";
import { SubmitFn } from "@/components/workspace/contracts";

type BrandRow = {
  id: string;
  name: string;
  isActive: boolean;
  meta: { vendorId?: string | null; vendorName?: string | null };
};

/**
 * Vendors, with the brands each one supplies.
 *
 * The link between a brand and its vendor already existed in the data - a brand knows its vendor -
 * but only one way: you could say "L'Oreal comes from Beauty Distributors" from the brand, and
 * never open the vendor to see everything they bring you. This is the other direction, which is how
 * a salon owner actually thinks: "what do I get from this supplier, and who else could I add?"
 *
 * Assigning a brand to a vendor is just setting that brand's vendorId, so no new endpoint is needed.
 */
export function VendorsView({ data, submit }: {
  data: WorkspaceData;
  submit: SubmitFn;
}) {
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [assigningTo, setAssigningTo] = useState<string | null>(null);
  const [addingVendor, setAddingVendor] = useState(false);
  const branchId = data.identity.branchId || "all";
  // A vendor is created against a specific branch (the mutation needs one); fall back to the first.
  const mutationBranchId = data.identity.branchId || data.identity.branches[0]?.id || "";
  const openAddVendor = () => setAddingVendor(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await queryWorkspace<{ rows: BrandRow[] }>(`/api/v1/operations/masters/brands?branchId=${encodeURIComponent(branchId)}&includeArchived=false`);
      setBrands(payload.rows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load brands");
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function setBrandVendor(brandId: string, vendorId: string | null) {
    const result = await submit("/api/v1/operations/masters/brands", { id: brandId, branchId, patch: { vendorId } }, vendorId ? "Brand assigned." : "Brand unassigned.", "PATCH", false);
    if (result.ok) { setAssigningTo(null); await load(); }
    else setError(result.error);
  }

  const activeVendors = data.vendors.filter((vendor) => vendor.isActive);
  const brandsByVendor = new Map<string, BrandRow[]>();
  for (const brand of brands) {
    const key = brand.meta.vendorId ?? "";
    if (!brandsByVendor.has(key)) brandsByVendor.set(key, []);
    brandsByVendor.get(key)!.push(brand);
  }
  const unassignedBrands = brandsByVendor.get("") ?? [];

  return <div className="space-y-4">
    {error && <Banner tone="danger" icon={<AlertTriangle size={15} />} onDismiss={() => setError("")}>{error}</Banner>}

    <Card
      title="Vendors"
      description="Your suppliers, and the brands each one brings you."
      action={<Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={openAddVendor}>Add vendor</Button>}
    >
      {loading ? <SkeletonTable rows={3} columns={2} /> : activeVendors.length ? <div className="grid gap-3 lg:grid-cols-2">
        {activeVendors.map((vendor) => {
          const vendorBrands = brandsByVendor.get(vendor.id) ?? [];
          return <div key={vendor.id} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-card)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-text)]"><Truck size={16} /></span>
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-medium text-[var(--text-primary)]">{vendor.name}</p>
                  <p className="truncate text-xs text-[var(--text-secondary)]">{vendor.gstin ? `GSTIN ${vendor.gstin}` : vendor.phone || "No GSTIN"}</p>
                </div>
              </div>
              <Badge tone={vendorBrands.length ? "accent" : "neutral"}>{vendorBrands.length} {vendorBrands.length === 1 ? "brand" : "brands"}</Badge>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] pt-3">
              {vendorBrands.map((brand) => <span key={brand.id} className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--accent-text)]">
                <Tag size={11} />{brand.name}
                <button type="button" onClick={() => void setBrandVendor(brand.id, null)} aria-label={`Unassign ${brand.name}`} className="opacity-60 transition hover:opacity-100"><X size={12} /></button>
              </span>)}

              {/* Assign an unassigned brand to this vendor. */}
              {assigningTo === vendor.id ? <select
                autoFocus
                defaultValue=""
                onChange={(event) => event.target.value && void setBrandVendor(event.target.value, vendor.id)}
                onBlur={() => setAssigningTo(null)}
                className="rounded-full border border-[var(--border-strong)] bg-[var(--surface-card)] px-2 py-1 text-xs font-semibold text-[var(--text-primary)]"
              >
                <option value="" disabled>Pick a brand…</option>
                {unassignedBrands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
              </select> : <button
                type="button"
                onClick={() => setAssigningTo(vendor.id)}
                disabled={!unassignedBrands.length}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--border-strong)] px-2.5 py-1 text-xs font-semibold text-[var(--text-muted)] transition hover:text-[var(--text-primary)] disabled:opacity-40"
              ><Plus size={11} /> Assign brand</button>}
            </div>
          </div>;
        })}
      </div> : <EmptyState icon={<Truck size={18} />} title="No vendors yet" description="Add the suppliers you buy products from, then assign their brands." action={<Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={openAddVendor}>Add vendor</Button>} />}
    </Card>

    {/* Brands nobody supplies. A shampoo with no vendor is a purchase you cannot attribute. */}
    {!loading && unassignedBrands.length > 0 && <Card title="Brands with no vendor" description="Assign each to the supplier you buy it from.">
      <div className="flex flex-wrap gap-1.5">
        {unassignedBrands.map((brand) => <span key={brand.id} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)]">
          <Store size={12} />{brand.name}
        </span>)}
      </div>
      <p className="mt-3 text-xs text-[var(--text-muted)]">Open a vendor above and use “Assign brand” to link these.</p>
    </Card>}

    {addingVendor && <Overlay title="Add vendor" description="A supplier you buy products from." size="md" onClose={() => setAddingVendor(false)}>
      <VendorForm branchId={mutationBranchId} submit={submit} onSaved={() => { setAddingVendor(false); }} />
    </Overlay>}
  </div>;
}

/** Minimal add-vendor form, used by the Vendors screen. */
export function VendorForm({ branchId, submit, onSaved }: { branchId: string; submit: SubmitFn; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    const result = await submit("/api/v1/operations/inventory/vendors", {
      branchId,
      name: form.get("name"),
      phone: String(form.get("phone") || "") || undefined,
      email: String(form.get("email") || "") || undefined,
      gstin: String(form.get("gstin") || "") || undefined,
    }, "Vendor added.", "POST", false);
    setBusy(false);
    if (result.ok) onSaved();
    else setError(result.error);
  }

  return <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
    {error && <div className="sm:col-span-2"><Banner tone="danger">{error}</Banner></div>}
    <Field label="Vendor name"><Input name="name" required placeholder="Beauty Distributors Pvt Ltd" autoFocus /></Field>
    <Field label="GSTIN" hint="Needed to claim input credit on purchases"><Input name="gstin" placeholder="29AABCB…" /></Field>
    <Field label="Phone"><Input name="phone" /></Field>
    <Field label="Email"><Input name="email" type="email" /></Field>
    <div className="sm:col-span-2"><Button type="submit" variant="primary" loading={busy}>Add vendor</Button></div>
  </form>;
}
