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

import { SubmitFn } from "@/components/workspace/contracts";
import { getServiceCategoryTemplates } from "@/components/workspace/modules/services-api";
import { Card, Empty, Info, Status, SummaryTile, WorkspaceSelect, title } from "@/components/workspace/shared-ui";

export function ServicesView({ data, open, submit, openProfile }: { data: WorkspaceData; open: () => void; submit: SubmitFn; openProfile: (id: string) => void }) {
  const [viewMode, setViewMode] = useState<"cards" | "list">(() => typeof window === "undefined" ? "cards" : (localStorage.getItem("operyx-service-master-view") as "cards" | "list") || "cards");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [bookingFilter, setBookingFilter] = useState("all");

  useEffect(() => {
    localStorage.setItem("operyx-service-master-view", viewMode);
  }, [viewMode]);

  async function saveOverride(event: FormEvent<HTMLFormElement>, serviceId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await submit("/api/v1/operations/services/" + serviceId, {
      price: Number(form.get("price")),
      durationMinutes: Number(form.get("durationMinutes")),
      taxRate: Number(form.get("taxRate")),
      priceTaxMode: form.get("priceTaxMode"),
      isActive: form.get("isActive") === "on",
      onlineBooking: form.get("onlineBooking") === "on",
      bufferBefore: Number(form.get("bufferBefore")),
      bufferAfter: Number(form.get("bufferAfter")),
      sortOrder: Number(form.get("sortOrder")),
    }, "Branch service settings updated.", "PATCH");
  }

  const filteredServices = data.services.filter((service) => {
    const search = query.trim().toLowerCase();
    const matchesSearch = !search || `${service.name} ${service.category}`.toLowerCase().includes(search);
    const matchesCategory = categoryFilter === "all" || service.categoryId === categoryFilter || service.category === categoryFilter;
    const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? service.isActive : !service.isActive);
    const matchesBooking = bookingFilter === "all" || (bookingFilter === "online" ? service.onlineBooking : !service.onlineBooking);
    return matchesSearch && matchesCategory && matchesStatus && matchesBooking;
  });
  const categoryOptions = [{ value: "all", label: "All categories" }, ...data.serviceCategories.map((category) => ({ value: category.id, label: category.name, description: category.isActive ? "Active category" : "Archived category" }))];

  function editorFields(service: WorkspaceData["services"][number], compact = false) {
    return <>
      <ServiceSettingField label="Branch price" hint="Customer price" name="price" type="number" step="0.01" defaultValue={service.price} compact={compact} />
      <ServicePricingModeField defaultValue={service.priceTaxMode} compact={compact} />
      <ServiceSettingField label="Duration min" hint="Appointment time" name="durationMinutes" type="number" defaultValue={service.durationMinutes} compact={compact} />
      <ServiceSettingField label="GST %" hint="Tax rate" name="taxRate" type="number" step="0.01" defaultValue={service.taxRate} compact={compact} />
      <ServiceSettingField label="Sort order" hint="Display order" name="sortOrder" type="number" defaultValue={service.sortOrder} compact={compact} />
      <ServiceSettingField label="Buffer before" hint="Minutes" name="bufferBefore" type="number" defaultValue={service.bufferBefore} compact={compact} />
      <ServiceSettingField label="Buffer after" hint="Minutes" name="bufferAfter" type="number" defaultValue={service.bufferAfter} compact={compact} />
      <ServiceToggle name="isActive" label="Active" defaultChecked={service.isActive} compact={compact} />
      <ServiceToggle name="onlineBooking" label="Online booking" defaultChecked={service.onlineBooking} compact={compact} />
    </>;
  }

  return <Card title="Services and pricing" action={<div className="flex flex-wrap justify-end gap-2"><div className="rounded-full bg-[#F7FAFC] p-1"><button type="button" onClick={() => setViewMode("cards")} className={`rounded-full px-3 py-2 text-xs font-extrabold ${viewMode === "cards" ? "bg-[#173279] text-white" : "text-[#737174]"}`}>Card view</button><button type="button" onClick={() => setViewMode("list")} className={`rounded-full px-3 py-2 text-xs font-extrabold ${viewMode === "list" ? "bg-[#173279] text-white" : "text-[#737174]"}`}>List view</button></div><button onClick={open} className="primary"><Plus size={15} /> New service</button></div>}>
    <div className="mb-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_180px_190px]">
      <label className="workspace-search-field flex items-center gap-2 rounded-2xl border border-[#DDE7EF] bg-white px-4 shadow-sm">
        <Search size={16} className="shrink-0 text-[#1789AA]" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} className="workspace-plain-input w-full bg-transparent py-3 text-sm font-bold outline-none placeholder:text-[#9BA8B3]" placeholder="Search service or category" />
      </label>
      <WorkspaceSelect value={categoryFilter} onChange={setCategoryFilter} options={categoryOptions} compact />
      <WorkspaceSelect value={statusFilter} onChange={setStatusFilter} options={[{ value: "all", label: "All status" }, { value: "active", label: "Active only" }, { value: "inactive", label: "Archived only" }]} compact />
      <WorkspaceSelect value={bookingFilter} onChange={setBookingFilter} options={[{ value: "all", label: "All booking" }, { value: "online", label: "Online booking" }, { value: "offline", label: "In-salon only" }]} compact />
    </div>

    {viewMode === "cards" ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {filteredServices.map((service) => (
        <form onSubmit={(event) => saveOverride(event, service.id)} key={service.id} className="overflow-hidden rounded-[1.5rem] border border-[#E5E7EB] bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-[#16B994]/35 hover:shadow-md">
          <div className="border-b border-[#E5E7EB] bg-[#F7FAFC] p-5">
            <div className="flex items-start justify-between gap-3">
              <span className="rounded-full bg-[#E8FBFB] px-3 py-1 text-xs font-bold text-[#1969A2]">{service.category}</span>
              <Status value={service.isActive ? "ACTIVE" : "INACTIVE"} />
            </div>
            <div className="mt-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-serif text-xl font-bold">{service.name}</h3>
                <p className="mt-2 text-xs font-semibold text-[#847c74]">Master: {service.masterDurationMinutes} min | {inr.format(service.masterPrice)}</p>
              </div>
              <button type="button" onClick={() => openProfile(service.id)} className="shrink-0 rounded-full border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-bold text-[#1789AA]">View profile</button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Info label="Branch price" value={inr.format(service.price)} tone="green" />
              <Info label="Duration" value={`${service.durationMinutes}m`} tone="blue" />
              <Info label="GST" value={`${service.taxRate}% ${service.priceTaxMode === "INCLUSIVE" ? "included" : "extra"}`} tone="amber" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 p-5">
            {editorFields(service)}
            <button className="col-span-2 mt-2 w-full rounded-xl border border-[#173279] px-4 py-2.5 text-sm font-bold text-[#173279] transition hover:bg-[#173279] hover:text-white">Save service settings</button>
          </div>
        </form>
      ))}
    </div> : <div className="space-y-3">
      <div className="hidden overflow-x-auto lg:block">
        <div className="min-w-[1240px] overflow-hidden rounded-3xl border border-[#E5E7EB] bg-white">
          <div className="grid grid-cols-[1.45fr_.72fr_.65fr_.62fr_.7fr_.52fr_.45fr_.68fr_.38fr_.5fr_.58fr] items-center gap-3 bg-[#F7FAFC] px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#737174]">
            <span>Service</span><span>Category</span><span>Master price</span><span>Branch price</span><span>GST pricing</span><span>Duration</span><span>GST</span><span>Buffers <span className="block text-[9px] normal-case tracking-normal text-[#9CA3AF]">Before / after</span></span><span className="text-center">Active</span><span className="text-center">Online</span><span className="text-center">Actions</span>
          </div>
          {filteredServices.map((service) => <form key={service.id} onSubmit={(event) => saveOverride(event, service.id)} className="grid grid-cols-[1.45fr_.72fr_.65fr_.62fr_.7fr_.52fr_.45fr_.68fr_.38fr_.5fr_.58fr] items-center gap-3 border-t border-[#E5E7EB] px-4 py-2.5 text-sm transition hover:bg-[#FAFAFC] focus-within:bg-[#FAFAFC]">
            <button type="button" onClick={() => openProfile(service.id)} className="min-w-0 truncate text-left font-extrabold text-[#1F2937] transition hover:text-[#5B2A86]">{service.name}</button>
            <span className="truncate rounded-full bg-[#E8FBFB] px-3 py-1 text-xs font-extrabold text-[#1789AA]">{service.category}</span>
            <span className="font-extrabold text-[#1F2937]">{inr.format(service.masterPrice)}</span>
            <ServiceSettingField label="Branch price" hint="INR" name="price" type="number" step="0.01" defaultValue={service.price} tableCell />
            <ServicePricingModeField defaultValue={service.priceTaxMode} tableCell />
            <ServiceSettingField label="Duration in minutes" hint="Minutes" name="durationMinutes" type="number" defaultValue={service.durationMinutes} tableCell />
            <ServiceSettingField label="GST percentage" hint="Percent" name="taxRate" type="number" step="0.01" defaultValue={service.taxRate} tableCell />
            <div className="grid grid-cols-2 gap-1.5"><ServiceSettingField label="Buffer before in minutes" hint="Minutes" name="bufferBefore" type="number" defaultValue={service.bufferBefore} tableCell /><ServiceSettingField label="Buffer after in minutes" hint="Minutes" name="bufferAfter" type="number" defaultValue={service.bufferAfter} tableCell /><input type="hidden" name="sortOrder" value={service.sortOrder} /></div>
            <ServiceToggle name="isActive" label="Active" defaultChecked={service.isActive} tableCell />
            <ServiceToggle name="onlineBooking" label="Online booking" defaultChecked={service.onlineBooking} tableCell />
            <div className="flex flex-col gap-1.5"><button className="rounded-xl bg-[#5B2A86] px-3 py-2 text-xs font-extrabold text-white transition hover:bg-[#472066] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B2A86]/35">Save</button><button type="button" onClick={() => openProfile(service.id)} className="rounded-xl border border-[#DDE7EF] px-3 py-2 text-xs font-extrabold text-[#5B2A86] transition hover:border-[#5B2A86]/30 hover:bg-[#F3E8FF]">Profile</button></div>
          </form>)}
        </div>
      </div>
      <div className="grid gap-3 lg:hidden">
        {filteredServices.map((service) => <form key={service.id} onSubmit={(event) => saveOverride(event, service.id)} className="rounded-3xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="truncate font-extrabold">{service.name}</p><p className="mt-1 text-xs font-bold text-[#1789AA]">{service.category}</p><p className="mt-1 text-xs text-[#737174]">Master {service.masterDurationMinutes} min - {inr.format(service.masterPrice)}</p></div>
            <button type="button" onClick={() => openProfile(service.id)} className="shrink-0 rounded-full bg-[#F7FAFC] px-3 py-1.5 text-xs font-extrabold text-[#1789AA]">Profile</button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">{editorFields(service, true)}</div>
          <button className="mt-3 w-full rounded-full bg-[#173279] px-4 py-3 text-sm font-extrabold text-white">Save service settings</button>
        </form>)}
      </div>
    </div>}
    {!filteredServices.length && <Empty text="No services match the selected filters." />}
  </Card>;
}

export function ServiceSettingField({ label, hint, name, type, step, defaultValue, compact, tableCell }: { label: string; hint: string; name: string; type: string; step?: string; defaultValue: number; compact?: boolean; tableCell?: boolean }) {
  if (tableCell) return <label className="block rounded-xl border border-[#DDE7EF] bg-white px-2.5 py-2 transition focus-within:border-[#5B2A86] focus-within:ring-2 focus-within:ring-[#5B2A86]/10" title={`${label} (${hint})`}>
    <span className="sr-only">{label}</span>
    <input className="w-full min-w-0 bg-transparent text-sm font-bold text-[#1F2937] outline-none" aria-label={label} name={name} type={type} step={step} defaultValue={defaultValue} />
  </label>;
  return <label className={`rounded-xl border border-black/10 bg-white ${compact ? "px-2 py-1.5" : "px-3 py-2"}`}>
    <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-[#1969A2]">{label}</span>
    <input className={`mt-1 w-full bg-transparent font-semibold outline-none ${compact ? "text-xs" : "text-sm"}`} aria-label={label} name={name} type={type} step={step} defaultValue={defaultValue} />
    <span className="mt-0.5 block text-[10px] font-semibold text-[#8b8178]">{hint}</span>
  </label>;
}

function ServicePricingModeField({ defaultValue, compact, tableCell }: { defaultValue: "EXCLUSIVE" | "INCLUSIVE"; compact?: boolean; tableCell?: boolean }) {
  return <label className={`block rounded-xl border border-[#DDE7EF] bg-white ${tableCell ? "px-2 py-2" : compact ? "px-2 py-1.5" : "px-3 py-2"}`} title="Choose whether GST is added to or already included in the price">
    <span className={tableCell ? "sr-only" : "block text-[11px] font-bold uppercase tracking-[0.12em] text-[#1969A2]"}>GST pricing</span>
    <select name="priceTaxMode" defaultValue={defaultValue} aria-label="GST pricing" className={`w-full bg-transparent font-bold text-[#1F2937] outline-none ${compact || tableCell ? "text-xs" : "mt-1 text-sm"}`}>
      <option value="EXCLUSIVE">GST extra</option>
      <option value="INCLUSIVE">GST included</option>
    </select>
    {!tableCell && <span className="mt-0.5 block text-[10px] font-semibold text-[#8b8178]">Controls the customer total</span>}
  </label>;
}

export function ServiceToggle({ name, label, defaultChecked, compact, tableCell }: { name: string; label: string; defaultChecked: boolean; compact?: boolean; tableCell?: boolean }) {
  if (tableCell) return <label className="flex cursor-pointer justify-center" title={label}>
    <span className="sr-only">{label}</span>
    <input aria-label={label} name={name} type="checkbox" defaultChecked={defaultChecked} className="size-5 cursor-pointer accent-[#5B2A86]" />
  </label>;
  return <label className={`flex items-center justify-between gap-2 rounded-xl bg-[#F7FAFC] font-bold text-[#1F2937] ${compact ? "px-2 py-2 text-xs" : "px-3 py-2 text-sm"}`}>
    <span>{label}</span>
    <input name={name} type="checkbox" defaultChecked={defaultChecked} className="size-4 accent-[#16B994]" />
  </label>;
}

export function ServicesViewV2({ data, open, submit, openProfile }: { data: WorkspaceData; open: () => void; submit: SubmitFn; openProfile: (id: string) => void }) {
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; color: string | null }>>([]);
  const branchId = data.identity.branchId;
  const activeServices = data.services.filter((service) => service.isActive).length;
  const onlineServices = data.services.filter((service) => service.onlineBooking).length;
  const activeCategories = data.serviceCategories.filter((category) => category.isActive).length;
  useEffect(() => {
    if (!branchId) return;
    getServiceCategoryTemplates(branchId)
      .then((result) => setTemplates(result.templates || []))
      .catch(() => setTemplates([]));
  }, [branchId, data.serviceCategories]);
  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await submit("/api/v1/operations/service-categories", {
      name: form.get("name"),
      color: form.get("color"),
      sortOrder: data.serviceCategories.length,
    }, "Service category created.", "POST", false);
    if (result.ok) event.currentTarget.reset();
  }
  return <div className="space-y-5">
    <div className="relative overflow-hidden rounded-[2rem] border border-[#16B994]/30 bg-[#173279] p-6 text-white shadow-[0_24px_70px_rgba(23,50,121,.18)]">
      <div className="pointer-events-none absolute -right-20 -top-20 size-56 rounded-full bg-[#16B994]/24 blur-3xl" />
      <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#16B994]">Service master</p>
          <h2 className="mt-2 font-serif text-3xl font-semibold">Catalogue, pricing and online booking controls</h2>
          <p className="mt-2 max-w-2xl text-sm text-white/62">Keep master services clean, then adjust branch price, duration, GST, buffers and visibility from each service card.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs sm:min-w-[420px]">
          <SummaryTile label="Services" value={String(data.services.length)} />
          <SummaryTile label="Active" value={String(activeServices)} />
          <SummaryTile label="Online" value={String(onlineServices)} />
        </div>
      </div>
    </div>
    <Card title="Service category master">
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Info label="Categories" value={String(data.serviceCategories.length)} tone="blue" />
        <Info label="Active categories" value={String(activeCategories)} tone="green" />
        <Info label="Templates" value={String(templates.length)} tone="amber" />
      </div>
      {templates.length > 0 && <div className="mb-5 rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] p-4"><p className="text-sm font-bold">{brandName} starter templates</p><div className="mt-3 flex flex-wrap gap-2">{templates.filter((template) => !data.serviceCategories.some((category) => category.name.toLowerCase() === template.name.toLowerCase())).map((template) => <button key={template.id} onClick={() => void submit("/api/v1/operations/service-categories", { templateIds: [template.id] }, `${template.name} copied to your catalogue.`, "POST", false)} className="rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-bold"><Plus size={13} className="mr-1 inline" />{template.name}</button>)}</div></div>}
      <form onSubmit={createCategory} className="mb-5 grid gap-2 sm:grid-cols-[1fr_120px_auto]"><input className="field" name="name" required placeholder="New category name" /><input className="field h-12" name="color" type="color" defaultValue="#1789AA" /><button className="primary justify-center">Add category</button></form>
      <div className="flex flex-wrap gap-2">{data.serviceCategories.map((category) => <div key={category.id} className={`flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-bold ${category.isActive ? "bg-white" : "opacity-50"}`}><span className="size-3 rounded-full" style={{ backgroundColor: category.color || "#1789AA" }} />{category.name}<button onClick={() => void submit(`/api/v1/operations/service-categories/${category.id}`, { isActive: !category.isActive }, category.isActive ? "Category archived." : "Category restored.", "PATCH", false)} className="text-xs text-[#1969A2]">{category.isActive ? "Archive" : "Restore"}</button></div>)}</div>
    </Card>
    <ServicesView data={data} open={open} submit={submit} openProfile={openProfile} />
  </div>;
}
