"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Plus, Ticket } from "lucide-react";
import { inr } from "@/lib/format";
import type { WorkspaceData } from "@/lib/operations-types";

import { queryWorkspace } from "@/components/workspace/client";
import { SubmitFn } from "@/components/workspace/contracts";
import { Card, Empty, SlotMessage, WorkspaceSelect, formatDate } from "@/components/workspace/shared-ui";

type Coupon = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  discountType: "PERCENT" | "FLAT";
  discountValue: number;
  maxDiscountAmount: number | null;
  minBillAmount: number | null;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  maxPerCustomer: number | null;
  newCustomersOnly: boolean;
  serviceIds: string[];
  productIds: string[];
  serviceCategoryIds: string[];
  productCategoryIds: string[];
  branchIds: string[];
  isActive: boolean;
  redemptionCount: number;
  remaining: number | null;
};

/** Multi-select as toggleable chips. A salon owner should not meet a multi-select listbox. */
function ChipGroup({ label, options, selected, toggle }: {
  label: string;
  options: Array<{ id: string; name: string }>;
  selected: string[];
  toggle: (id: string) => void;
}) {
  if (!options.length) return null;
  return <div>
    <p className="text-xs font-bold text-[#737174]">{label}</p>
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {options.map((option) => {
        const isOn = selected.includes(option.id);
        return <button
          key={option.id}
          type="button"
          onClick={() => toggle(option.id)}
          className={`rounded-full px-3 py-1.5 text-xs font-extrabold transition ${isOn ? "bg-[#173279] text-white" : "bg-[#F7FAFC] text-[#737174]"}`}
        >{option.name}</button>;
      })}
    </div>
  </div>;
}

export function CouponsPanel({ data, submit }: { data: WorkspaceData; submit: SubmitFn }) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [creating, setCreating] = useState(false);
  const [discountType, setDiscountType] = useState<"PERCENT" | "FLAT">("PERCENT");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [serviceCategoryIds, setServiceCategoryIds] = useState<string[]>([]);
  const [productCategoryIds, setProductCategoryIds] = useState<string[]>([]);
  const branchId = data.identity.branchId || "";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCoupons(await queryWorkspace<Coupon[]>(`/api/v1/operations/coupons?branchId=${encodeURIComponent(branchId || "all")}`));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load coupons");
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  function startEdit(coupon: Coupon | null) {
    setEditing(coupon);
    setCreating(!coupon);
    setDiscountType(coupon?.discountType ?? "PERCENT");
    setServiceIds(coupon?.serviceIds ?? []);
    setProductIds(coupon?.productIds ?? []);
    setServiceCategoryIds(coupon?.serviceCategoryIds ?? []);
    setProductCategoryIds(coupon?.productCategoryIds ?? []);
    setError("");
  }

  function toggle(list: string[], setList: (value: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  }

  function optionalNumber(form: FormData, key: string) {
    const raw = String(form.get(key) || "").trim();
    return raw ? Number(raw) : null;
  }

  function optionalDate(form: FormData, key: string) {
    const raw = String(form.get(key) || "").trim();
    return raw ? new Date(raw).toISOString() : null;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    const body = {
      branchId,
      code: String(form.get("code") || "").trim().toUpperCase(),
      name: String(form.get("name") || "").trim(),
      description: String(form.get("description") || "").trim() || null,
      discountType,
      discountValue: Number(form.get("discountValue") || 0),
      maxDiscountAmount: discountType === "PERCENT" ? optionalNumber(form, "maxDiscountAmount") : null,
      minBillAmount: optionalNumber(form, "minBillAmount"),
      startsAt: optionalDate(form, "startsAt"),
      endsAt: optionalDate(form, "endsAt"),
      maxRedemptions: optionalNumber(form, "maxRedemptions"),
      maxPerCustomer: optionalNumber(form, "maxPerCustomer"),
      newCustomersOnly: form.get("newCustomersOnly") === "on",
      serviceIds,
      productIds,
      serviceCategoryIds,
      productCategoryIds,
      branchIds: [],
      isActive: form.get("isActive") === "on",
    };

    const result = editing
      ? await submit("/api/v1/operations/coupons", { ...body, id: editing.id }, "Coupon saved.", "PATCH", false)
      : await submit("/api/v1/operations/coupons", body, "Coupon created.", "POST", false);

    if (result.ok) {
      setEditing(null);
      setCreating(false);
      await load();
    } else {
      setError(result.error);
    }
  }

  const serviceCategories = data.serviceCategories.filter((category) => category.isActive).map((category) => ({ id: category.id, name: category.name }));
  const services = data.services.filter((service) => service.isActive).map((service) => ({ id: service.id, name: service.name }));
  const products = data.inventory.map((product) => ({ id: product.id, name: product.name }));
  const productCategories = [...new Map(data.inventory.filter((product) => product.categoryId).map((product) => [product.categoryId!, { id: product.categoryId!, name: product.category }])).values()];

  return <Card
    title="Coupons"
    action={<button type="button" onClick={() => startEdit(null)} className="primary"><Plus size={15} /> New coupon</button>}
  >
    <p className="-mt-2 mb-4 text-sm font-semibold text-[#737174]">Discount codes reception types at checkout. Usage limits are enforced at the moment of payment, not before.</p>

    {error && <p className="mb-3 rounded-xl bg-[#fff0ec] p-3 text-sm font-bold text-[#995849]">{error}</p>}

    {(creating || editing) && <form onSubmit={save} className="mb-5 space-y-4 rounded-2xl border border-[#DDE7EF] bg-[#F7FAFC] p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs font-bold text-[#737174]">Code<input name="code" required defaultValue={editing?.code || ""} className="field mt-1 uppercase" placeholder="MONSOON20" /></label>
        <label className="text-xs font-bold text-[#737174]">Name<input name="name" required defaultValue={editing?.name || ""} className="field mt-1" placeholder="Monsoon offer" /></label>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <WorkspaceSelect label="Discount type" value={discountType} onChange={(value) => setDiscountType(value as "PERCENT" | "FLAT")} options={[{ value: "PERCENT", label: "Percentage off" }, { value: "FLAT", label: "Flat amount off" }]} />
        <label className="text-xs font-bold text-[#737174]">{discountType === "PERCENT" ? "Percent off" : "Amount off"}<input name="discountValue" type="number" min="0" step="0.01" required defaultValue={String(editing?.discountValue ?? "")} className="field mt-1" /></label>
        {discountType === "PERCENT" && <label className="text-xs font-bold text-[#737174]">Maximum discount<input name="maxDiscountAmount" type="number" min="0" step="0.01" defaultValue={editing?.maxDiscountAmount ?? ""} className="field mt-1" placeholder="No cap" /></label>}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-xs font-bold text-[#737174]">Minimum bill<input name="minBillAmount" type="number" min="0" step="0.01" defaultValue={editing?.minBillAmount ?? ""} className="field mt-1" placeholder="No minimum" /></label>
        <label className="text-xs font-bold text-[#737174]">Valid from<input name="startsAt" type="date" defaultValue={editing?.startsAt?.slice(0, 10) || ""} className="field mt-1" /></label>
        <label className="text-xs font-bold text-[#737174]">Valid until<input name="endsAt" type="date" defaultValue={editing?.endsAt?.slice(0, 10) || ""} className="field mt-1" /></label>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-xs font-bold text-[#737174]">Total uses allowed<input name="maxRedemptions" type="number" min="1" defaultValue={editing?.maxRedemptions ?? ""} className="field mt-1" placeholder="Unlimited" /></label>
        <label className="text-xs font-bold text-[#737174]">Uses per customer<input name="maxPerCustomer" type="number" min="1" defaultValue={editing?.maxPerCustomer ?? ""} className="field mt-1" placeholder="Unlimited" /></label>
        <div className="flex flex-col gap-2 self-end">
          <label className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-xs font-bold"><input type="checkbox" name="newCustomersOnly" defaultChecked={editing?.newCustomersOnly ?? false} /> First-time customers only</label>
          <label className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-xs font-bold"><input type="checkbox" name="isActive" defaultChecked={editing?.isActive ?? true} /> Active</label>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-[#E5E7EB] bg-white p-4">
        <p className="text-xs font-extrabold uppercase tracking-[.12em] text-[#1789AA]">What it applies to</p>
        <p className="text-xs font-semibold text-[#737174]">Pick nothing and it discounts the whole bill. Pick anything and it only discounts what you picked.</p>
        <ChipGroup label="Service categories" options={serviceCategories} selected={serviceCategoryIds} toggle={(id) => toggle(serviceCategoryIds, setServiceCategoryIds, id)} />
        <ChipGroup label="Product categories" options={productCategories} selected={productCategoryIds} toggle={(id) => toggle(productCategoryIds, setProductCategoryIds, id)} />
        <ChipGroup label="Individual services" options={services} selected={serviceIds} toggle={(id) => toggle(serviceIds, setServiceIds, id)} />
        <ChipGroup label="Individual products" options={products} selected={productIds} toggle={(id) => toggle(productIds, setProductIds, id)} />
      </div>

      <label className="block text-xs font-bold text-[#737174]">Description<input name="description" defaultValue={editing?.description || ""} className="field mt-1" placeholder="Shown internally only" /></label>

      <div className="flex gap-2">
        <button type="submit" className="primary justify-center">{editing ? "Save coupon" : "Create coupon"}</button>
        <button type="button" onClick={() => { setEditing(null); setCreating(false); }} className="rounded-xl border border-[#E5E7EB] bg-white px-4 py-2.5 text-sm font-extrabold text-[#737174]">Cancel</button>
      </div>
    </form>}

    {loading ? <SlotMessage text="Loading coupons..." loading /> : coupons.length ? <div className="grid gap-3 md:grid-cols-2">
      {coupons.map((coupon) => <div key={coupon.id} className={`rounded-2xl border p-4 ${coupon.isActive ? "border-[#E5E7EB] bg-white" : "border-[#E5E7EB] bg-[#F7FAFC] opacity-60"}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-extrabold"><Ticket size={14} className="shrink-0 text-[#1789AA]" /><span className="truncate font-mono">{coupon.code}</span></p>
            <p className="mt-0.5 truncate text-xs font-semibold text-[#737174]">{coupon.name}</p>
          </div>
          <strong className="shrink-0 text-sm text-[#0f6f57]">
            {coupon.discountType === "PERCENT" ? `${coupon.discountValue}% off` : `${inr.format(coupon.discountValue)} off`}
          </strong>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-bold">
          {coupon.maxDiscountAmount != null && <span className="rounded-full bg-[#F7FAFC] px-2 py-1 text-[#737174]">up to {inr.format(coupon.maxDiscountAmount)}</span>}
          {coupon.minBillAmount != null && <span className="rounded-full bg-[#F7FAFC] px-2 py-1 text-[#737174]">min bill {inr.format(coupon.minBillAmount)}</span>}
          {coupon.newCustomersOnly && <span className="rounded-full bg-[#f5effc] px-2 py-1 text-[#674d8c]">new customers</span>}
          {coupon.endsAt && <span className="rounded-full bg-[#F7FAFC] px-2 py-1 text-[#737174]">until {formatDate(new Date(coupon.endsAt))}</span>}
          {(coupon.serviceIds.length || coupon.productIds.length || coupon.serviceCategoryIds.length || coupon.productCategoryIds.length)
            ? <span className="rounded-full bg-[#eef5fc] px-2 py-1 text-[#315d89]">restricted</span>
            : <span className="rounded-full bg-[#e7f8f2] px-2 py-1 text-[#0f6f57]">whole bill</span>}
          {!coupon.isActive && <span className="rounded-full bg-[#fff0ec] px-2 py-1 text-[#984f43]">inactive</span>}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#E5E7EB] pt-3">
          <p className="text-xs font-bold text-[#737174]">
            Used {coupon.redemptionCount} time{coupon.redemptionCount === 1 ? "" : "s"}
            {coupon.remaining !== null && <span className={coupon.remaining === 0 ? "text-[#984f43]" : ""}> - {coupon.remaining} left</span>}
          </p>
          <button type="button" onClick={() => startEdit(coupon)} className="rounded-full border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-extrabold text-[#173279]">Edit</button>
        </div>
      </div>)}
    </div> : <Empty text="No coupons yet. Create one and reception can type it at checkout." />}
  </Card>;
}
