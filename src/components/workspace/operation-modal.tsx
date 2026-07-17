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

import { AppointmentModalV2 } from "@/components/workspace/booking-modal";
import { BookingSeed, ModalName, SubmitFn } from "@/components/workspace/contracts";
import { Field, Select, WorkspaceModalShell, title } from "@/components/workspace/shared-ui";
import { taxOptionsForKind, taxRateFor } from "@/lib/tax-classes";

export function ServiceModalV2({ data, busy, error, close, submit }: { data: WorkspaceData; busy: boolean; error: string; close: () => void; submit: SubmitFn }) {
  const taxOptions = taxOptionsForKind(data.taxClasses, "SERVICE");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    // Send the link to the tax master and the rate behind it, so invoices and reports stay correct
    // even though the source of truth is the Tax master.
    const taxClassId = form.get("taxClassId");
    await submit("/api/v1/operations/services", {
      name: form.get("name"),
      categoryId: form.get("categoryId"),
      durationMinutes: Number(form.get("duration")),
      price: Number(form.get("price")),
      taxClassId: taxClassId || undefined,
      taxRate: taxOptions.length ? taxRateFor(data.taxClasses, taxClassId) : Number(form.get("tax")),
      priceTaxMode: form.get("priceTaxMode"),
    }, "Service created.");
  }
  const hasCategories = data.serviceCategories.some((category) => category.isActive);
  return <WorkspaceModalShell title="New service" eyebrow="Service master" description="Create a salon-owned service, then tune branch pricing and booking visibility from Service Master." icon={<Sparkles size={22} />} close={close} onSubmit={save} busy={busy || !hasCategories} error={error} submitLabel="Save service">
    <div className="grid gap-4 sm:grid-cols-2">
      <Field name="name" label="Service name" placeholder="Hair spa, bridal makeup..." helper="Use the customer-facing name shown in billing and bookings." />
      <Select name="categoryId" label="Category" options={data.serviceCategories.filter((category) => category.isActive).map((category) => [category.id, category.name])} />
      <Field name="duration" label="Duration in minutes" type="number" helper="Default appointment duration before branch overrides." />
      <Field name="price" label="Customer price" type="number" helper="Enter the listed price in INR." />
      <Select name="priceTaxMode" label="GST pricing" defaultValue="EXCLUSIVE" options={[["EXCLUSIVE", "GST extra"], ["INCLUSIVE", "GST included"]]} />
      {taxOptions.length
        ? <Select name="taxClassId" label="Tax" options={taxOptions} />
        : <Field name="tax" label="GST rate" type="number" defaultValue="18" helper="Add tax rates in the Tax master to pick from a list." />}
    </div>
    {!hasCategories && <p className="mt-5 rounded-2xl border border-[#e9c2b9] bg-[#fff0ec] p-3 text-sm font-bold text-[#984f43]">Create an active service category first.</p>}
  </WorkspaceModalShell>;
}

export function OperationModal({ name, data, busy, error, bookingSeed, close, submit }: { name: Exclude<ModalName, null>; data: WorkspaceData; busy: boolean; error: string; bookingSeed: BookingSeed; close: () => void; submit: SubmitFn }) {
  const specializedModal = name === "appointment"
    ? <AppointmentModalV2 data={data} busy={busy} error={error} bookingSeed={bookingSeed} close={close} submit={submit} />
    : name === "service"
      ? <ServiceModalV2 data={data} busy={busy} error={error} close={close} submit={submit} />
      : null;
  if (specializedModal) return specializedModal;
  const meta = operationModalMeta(name);
  async function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (name === "customer") await submit("/api/v1/operations/customers", { name: form.get("name"), phone: form.get("phone"), email: form.get("email"), notes: form.get("notes") }, "Customer saved.");
    if (name === "service") await submit("/api/v1/operations/services", { name: form.get("name"), category: form.get("category"), durationMinutes: Number(form.get("duration")), price: Number(form.get("price")), taxRate: Number(form.get("tax")) }, "Service created.");
    if (name === "stock") await submit("/api/v1/operations/inventory", { inventoryItemId: form.get("inventoryItemId"), quantity: Number(form.get("quantity")), type: form.get("type"), reference: form.get("reference"), idempotencyKey: `stock-${newId()}` }, "Stock updated.");
    if (name === "expense") await submit("/api/v1/operations/expenses", { category: form.get("category"), amount: Number(form.get("amount")), note: form.get("note"), spentAt: new Date(String(form.get("spentAt"))).toISOString() }, "Expense recorded.");
    if (name === "leave") await submit("/api/v1/operations/staff/leave", { staffId: form.get("staffId"), startsAt: new Date(String(form.get("startsAt"))).toISOString(), endsAt: new Date(String(form.get("endsAt"))).toISOString(), reason: form.get("reason") }, "Staff leave recorded.");
    if (name === "staff") await submit("/api/v1/operations/staff", { name: form.get("name"), email: form.get("email"), password: form.get("password"), role: form.get("role"), jobTitle: form.get("jobTitle"), commissionRate: Number(form.get("commissionRate")), primaryBranchId: form.get("primaryBranchId"), branchIds: form.getAll("branchIds") }, "Team member created.");
  }
  return <WorkspaceModalShell title={meta.title} eyebrow={meta.eyebrow} description={meta.description} icon={meta.icon} close={close} onSubmit={handle} busy={busy} error={error} submitLabel={meta.submitLabel}>
    {name === "customer" && <div className="space-y-5">
      <div className="rounded-3xl border border-[#16B994]/20 bg-[#F7FAFC] p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="name" label="Customer name" placeholder="Full name" />
          <Field name="phone" label="India mobile" defaultValue="+91" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="email" label="Email" type="email" required={false} placeholder="Optional email" />
        <Field name="notes" label="Notes" required={false} placeholder="Preference, allergy, or reminder" />
      </div>
    </div>}
    {name === "stock" && <div className="grid gap-4 sm:grid-cols-2">
      <Select name="inventoryItemId" label="Product" options={data.inventory.map((item) => [item.id, item.name])} />
      <Select name="type" label="Movement" options={[["PURCHASE", "Purchase"], ["ADJUSTMENT_IN", "Adjustment in"], ["ADJUSTMENT_OUT", "Adjustment out"]]} />
      <Field name="quantity" label="Quantity" type="number" helper="Use positive quantity; movement type decides direction." />
      <Field name="reference" label="Reference" required={false} placeholder="Bill no., reason, or note" />
    </div>}
    {name === "expense" && <div className="grid gap-4 sm:grid-cols-2">
      <Field name="category" label="Expense category" placeholder="Rent, utilities, supplies..." />
      <Field name="amount" label="Amount" type="number" />
      <Field name="spentAt" label="Date and time" type="datetime-local" />
      <Field name="note" label="Note" required={false} placeholder="Optional context" />
    </div>}
    {name === "leave" && <div className="grid gap-4 sm:grid-cols-2">
      <Select name="staffId" label="Team member" options={data.staff.map((item) => [item.id, item.name])} />
      <Field name="reason" label="Reason" required={false} placeholder="Leave, training, personal..." />
      <Field name="startsAt" label="Starts" type="datetime-local" />
      <Field name="endsAt" label="Ends" type="datetime-local" />
    </div>}
    {name === "staff" && <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="name" label="Name" />
        <Field name="email" label="Login email" type="email" />
        <Field name="password" label="Temporary password" type="password" />
        <Select name="role" label="Access role" options={[["MANAGER", "Manager"], ["RECEPTIONIST", "Receptionist"], ["STYLIST", "Stylist"], ["ACCOUNTANT", "Accountant"]]} />
        <Field name="jobTitle" label="Job title" placeholder="Senior stylist, receptionist..." />
        <Field name="commissionRate" label="Commission rate %" type="number" defaultValue="0" />
        <Select name="primaryBranchId" label="Primary branch" options={data.identity.branches.map((branch) => [branch.id, branch.name])} />
      </div>
      <fieldset className="rounded-3xl border border-[#DDE7EF] bg-[#F7FAFC] p-4">
        <legend className="px-2 text-sm font-extrabold text-[#173279]">Assigned branches</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {data.identity.branches.map((branch) => <label key={branch.id} className="flex items-center gap-3 rounded-2xl bg-white px-3 py-3 text-sm font-bold text-[#1F2937] shadow-sm"><input type="checkbox" name="branchIds" value={branch.id} className="size-4 accent-[#16B994]" /> <span className="min-w-0"><span className="block truncate">{branch.name}</span><span className="block text-xs font-semibold text-[#737174]">{branch.city}</span></span></label>)}
        </div>
      </fieldset>
    </div>}
  </WorkspaceModalShell>;
}

export function modalTitle(name: Exclude<ModalName, null>) { return ({ appointment: "New appointment", customer: "Add customer", service: "New service", stock: "Stock movement", expense: "Add expense", leave: "Record leave", staff: "Add team member" } as const)[name]; }

export function operationModalMeta(name: Exclude<ModalName, null>) {
  const meta = {
    customer: { title: "Add customer", eyebrow: "Quick CRM profile", description: "Create the minimum profile needed for booking, billing, and visit history without slowing reception down.", icon: <Users size={22} />, submitLabel: "Save customer" },
    stock: { title: "Stock movement", eyebrow: "Stock control", description: "Record a branch stock update with a clear movement type and reference for audit history.", icon: <Boxes size={22} />, submitLabel: "Save stock movement" },
    expense: { title: "Add expense", eyebrow: "Daily spending", description: "Capture branch expenses so register closing and reports reconcile with the day.", icon: <ReceiptText size={22} />, submitLabel: "Save expense" },
    leave: { title: "Record leave", eyebrow: "Team schedule", description: "Mark staff leave or unavailable time so appointment availability stays accurate.", icon: <Clock size={22} />, submitLabel: "Save leave" },
    staff: { title: "Add team member", eyebrow: "Staff access", description: "Create a staff login, role, commission defaults, and branch access in one place.", icon: <UserRound size={22} />, submitLabel: "Save team member" },
    appointment: { title: "New appointment", eyebrow: "Booking", description: "Create a customer booking.", icon: <CalendarDays size={22} />, submitLabel: "Save appointment" },
    service: { title: "New service", eyebrow: "Service master", description: "Create a service.", icon: <Sparkles size={22} />, submitLabel: "Save service" },
  } as const;
  return meta[name];
}
