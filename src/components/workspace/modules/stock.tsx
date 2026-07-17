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
import { taxOptionsForKind, taxRateFor } from "@/lib/tax-classes";
import type { AppointmentDetail, CustomerProfile, ServiceProfile, WorkspaceData } from "@/lib/operations-types";

import { SubmitFn } from "@/components/workspace/contracts";
import { Card, Empty, Field, Info, Row, Select, SlotMessage, Status, formatDate, formatDateTime, title } from "@/components/workspace/shared-ui";

export function InventoryView({ data, open, submit }: { data: WorkspaceData; open: () => void; submit: SubmitFn }) {
  const [tab, setTab] = useState<"products" | "purchase" | "transfer" | "stocktake" | "recipes">("products");
  const branchId = data.identity.branchId || "";
  const lowStock = data.inventory.filter((item) => item.quantity <= item.reorderLevel);
  const productTaxOptions = taxOptionsForKind(data.taxClasses, "GOODS");

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
      taxClassId: form.get("taxClassId") || undefined,
      taxRate: productTaxOptions.length ? taxRateFor(data.taxClasses, form.get("taxClassId")) : Number(form.get("taxRate")),
      priceTaxMode: form.get("priceTaxMode"),
      reorderLevel: Number(form.get("reorderLevel")),
      openingQuantity: Number(form.get("openingQuantity") || 0),
      vendorId: form.get("vendorId") || undefined,
      idempotencyKey: `product-${newId()}`,
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
      idempotencyKey: `purchase-${newId()}`,
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
      idempotencyKey: `transfer-${newId()}`,
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
      idempotencyKey: `stocktake-${newId()}`,
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

  if (!branchId) return <Card title="Stock"><SlotMessage text="Select a specific branch before changing stock." /></Card>;
  return <div className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Info label="Products" value={String(data.inventory.length)} tone="blue" />
      <Info label="Stock value" value={inr.format(data.inventory.reduce((sum, item) => sum + item.stockValue, 0))} tone="green" />
      <Info label="Low stock" value={String(lowStock.length)} tone={lowStock.length ? "amber" : "green"} />
      <Info label="Vendors" value={String(data.vendors.length)} tone="violet" />
    </div>
    <Card title="Stock operations" action={<button onClick={open} className="primary"><PackagePlus size={15} /> Quick movement</button>}>
      <div className="mb-5 flex flex-wrap gap-2">{(["products", "purchase", "transfer", "stocktake", "recipes"] as const).map((value) => <button key={value} type="button" onClick={() => setTab(value)} className={`rounded-full px-4 py-2 text-sm font-bold ${tab === value ? "bg-[#173279] text-white" : "bg-[#F7FAFC] text-[#737174]"}`}>{title(value)}</button>)}</div>
      {tab === "products" && <div className="grid gap-5 xl:grid-cols-[1fr_380px]"><div className="overflow-x-auto"><table className="w-full min-w-[880px] text-left text-sm"><thead className="text-xs uppercase tracking-wider text-[#737174]"><tr><th className="pb-3">Product</th><th className="pb-3">SKU</th><th className="pb-3">Sale price</th><th className="pb-3">GST pricing</th><th className="pb-3">On hand</th><th className="pb-3">Value</th><th className="pb-3">Status</th></tr></thead><tbody>{data.inventory.map((item) => <tr key={item.id} className="border-t border-black/5"><td className="py-4"><strong>{item.name}</strong><p className="text-xs text-[#737174]">{item.category} - {item.unit}</p></td><td className="py-4">{item.sku}</td><td className="py-4 font-bold">{inr.format(item.retailPrice)}</td><td className="py-4"><span className="rounded-full bg-[#F3E8FF] px-2.5 py-1 text-xs font-bold text-[#5B2A86]">{item.taxRate}% {item.priceTaxMode === "INCLUSIVE" ? "included" : "extra"}</span></td><td className="py-4">{item.quantity} {item.unit}</td><td className="py-4">{inr.format(item.stockValue)}</td><td className="py-4"><Status value={item.quantity <= item.reorderLevel ? "LOW_STOCK" : "HEALTHY"} /></td></tr>)}</tbody></table>{!data.inventory.length && <Empty text="No products created yet." />}</div><div className="space-y-5"><form onSubmit={createProduct} className="rounded-2xl bg-[#F7FAFC] p-4"><h3 className="font-bold">Add product</h3><div className="mt-3 grid gap-3"><Field name="name" label="Product name" /><Field name="sku" label="SKU / barcode" /><Field name="category" label="Category" /><Field name="unit" label="Unit" defaultValue="pcs" /><Field name="retailPrice" label="Customer sale price" type="number" /><Select name="priceTaxMode" label="GST pricing" defaultValue="EXCLUSIVE" options={[["EXCLUSIVE", "GST extra"], ["INCLUSIVE", "GST included"]]} />{productTaxOptions.length ? <Select name="taxClassId" label="Tax" options={productTaxOptions} /> : <Field name="taxRate" label="GST rate" type="number" defaultValue="18" />}<Field name="costPrice" label="Cost price" type="number" /><Field name="reorderLevel" label="Low-stock level" type="number" /><Field name="openingQuantity" label="Opening stock" type="number" defaultValue="0" required={false} /><Select name="vendorId" label="Vendor, optional" required={false} options={data.vendors.map((vendor) => [vendor.id, vendor.name])} /><button className="primary justify-center">Create product</button></div></form><form onSubmit={createVendor} className="rounded-2xl bg-[#e7f8f2] p-4"><h3 className="font-bold">Add vendor</h3><div className="mt-3 grid gap-3"><Field name="name" label="Vendor name" /><Field name="phone" label="Phone" required={false} /><Field name="email" label="Email" type="email" required={false} /><Field name="gstin" label="GSTIN" required={false} /><Field name="notes" label="Notes" required={false} /><button className="rounded-full bg-[#1789AA] px-4 py-3 text-sm font-bold text-white">Save vendor</button></div></form></div></div>}
      {tab === "purchase" && <div className="grid gap-5 xl:grid-cols-[380px_1fr]"><form onSubmit={recordPurchase} className="rounded-2xl bg-[#F7FAFC] p-4"><h3 className="font-bold">Record purchase</h3><div className="mt-3 grid gap-3"><Select name="vendorId" label="Vendor, optional" required={false} options={data.vendors.map((vendor) => [vendor.id, vendor.name])} /><Field name="invoiceNumber" label="Supplier invoice no." required={false} /><Field name="purchasedAt" label="Purchase date" type="datetime-local" /><Select name="inventoryItemId" label="Product" options={data.inventory.map((item) => [item.id, item.name])} /><Field name="quantity" label="Quantity" type="number" /><Field name="unitCost" label="Unit cost" type="number" /><Field name="taxRate" label="GST rate" type="number" defaultValue="18" /><Field name="note" label="Note" required={false} /><button className="primary justify-center">Add purchase stock</button></div></form><div><h3 className="mb-3 font-bold">Recent purchase entries</h3>{data.purchaseEntries.length ? data.purchaseEntries.map((purchase) => <Row key={purchase.id} primary={purchase.invoiceNumber || "Purchase entry"} secondary={`${purchase.vendor || "No vendor"}  -  ${formatDate(new Date(purchase.purchasedAt))}  -  ${purchase.lines} line(s)`} value={inr.format(purchase.total)} />) : <Empty text="No purchase entries yet." />}</div></div>}
      {tab === "transfer" && <div className="grid gap-5 xl:grid-cols-[380px_1fr]"><form onSubmit={transferStock} className="rounded-2xl bg-[#f3f7ff] p-4"><h3 className="font-bold">Branch transfer</h3><div className="mt-3 grid gap-3"><Select name="toBranchId" label="Send to branch" options={data.identity.branches.filter((branch) => branch.id !== branchId).map((branch) => [branch.id, branch.name])} /><Select name="inventoryItemId" label="Product" options={data.inventory.map((item) => [item.id, item.name])} /><Field name="quantity" label="Quantity" type="number" /><Field name="note" label="Note" required={false} /><button className="primary justify-center">Transfer stock</button></div></form><SlotMessage text="Transfers create stock-out and stock-in movements and are blocked if the source branch has insufficient stock." /></div>}
      {tab === "stocktake" && <div className="grid gap-5 xl:grid-cols-[380px_1fr]"><form onSubmit={recordStocktake} className="rounded-2xl bg-[#F7FAFC] p-4"><h3 className="font-bold">Stocktake count</h3><div className="mt-3 grid gap-3"><Field name="countedAt" label="Counted at" type="datetime-local" /><Select name="inventoryItemId" label="Product" options={data.inventory.map((item) => [item.id, `${item.name} (${item.quantity} ${item.unit})`])} /><Field name="countedQty" label="Counted quantity" type="number" /><Field name="note" label="Reason / note" required={false} /><button className="primary justify-center">Save count</button></div></form><div><h3 className="mb-3 font-bold">Recent stock movements</h3>{data.stockMovements.length ? data.stockMovements.slice(0, 12).map((movement) => <Row key={movement.id} primary={`${title(movement.type)}  -  ${movement.product}`} secondary={`${formatDateTime(movement.createdAt)}${movement.reference ? `  -  ${movement.reference}` : ""}`} value={`${movement.quantity > 0 ? "+" : ""}${movement.quantity}`} />) : <Empty text="No stock movements yet." />}</div></div>}
      {tab === "recipes" && <div className="grid gap-5 xl:grid-cols-[380px_1fr]"><form onSubmit={saveRecipe} className="rounded-2xl bg-[#e7f8f2] p-4"><h3 className="font-bold">Service consumption</h3><p className="mt-1 text-xs text-[#737174]">When this service is sold, the selected product quantity will be deducted automatically.</p><div className="mt-3 grid gap-3"><Select name="serviceId" label="Service" options={data.services.map((item) => [item.id, item.name])} /><Select name="inventoryItemId" label="Product consumed" options={data.inventory.map((item) => [item.id, item.name])} /><Field name="quantity" label="Quantity per service" type="number" /><button className="primary justify-center">Save recipe</button></div></form><SlotMessage text="Recipes are applied during billing checkout after stock is rechecked. If required products are unavailable, checkout is stopped." /></div>}
    </Card>
  </div>;
}
