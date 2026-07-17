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
import { Card, Empty, Field, Info, Select, formatDate, title } from "@/components/workspace/shared-ui";

export function BenefitsView({ data, submit }: { data: WorkspaceData; submit: SubmitFn }) {
  const [kind, setKind] = useState<"MEMBERSHIP" | "PACKAGE" | "GIFT_CARD" | "REWARD_RULE" | "WALLET_ADJUSTMENT" | "PURCHASE_MEMBERSHIP" | "PURCHASE_PACKAGE">("MEMBERSHIP");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const branchId = data.identity.branchId || data.identity.branches[0]?.id;
    const common = { kind, branchId };
    if (kind === "MEMBERSHIP") await submit("/api/v1/operations/benefits", { ...common, name: form.get("name"), price: Number(form.get("price")), durationDays: Number(form.get("durationDays")), benefits: form.get("benefits"), discountPercent: Number(form.get("discountPercent") || 0), rewardMultiplier: Number(form.get("rewardMultiplier") || 1) }, "Membership created.");
    if (kind === "PACKAGE") await submit("/api/v1/operations/benefits", { ...common, name: form.get("name"), price: Number(form.get("price")), validityDays: Number(form.get("validityDays")), services: [{ serviceId: form.get("serviceId"), quantity: Number(form.get("quantity")) }] }, "Package created.");
    if (kind === "GIFT_CARD") await submit("/api/v1/operations/benefits", { ...common, customerId: form.get("customerId") || undefined, value: Number(form.get("value")), expiresAt: form.get("expiresAt") ? new Date(String(form.get("expiresAt"))).toISOString() : undefined, idempotencyKey: "gift-card-" + newId() }, "Gift card issued.");
    if (kind === "REWARD_RULE") await submit("/api/v1/operations/benefits", { ...common, name: form.get("name"), pointsPerAmount: Number(form.get("pointsPerAmount")), amountPerPoint: Number(form.get("amountPerPoint")), earnOnTax: form.get("earnOnTax") === "on", minRedeemPoints: Number(form.get("minRedeemPoints") || 0), maxRedeemPercent: Number(form.get("maxRedeemPercent") || 20), expiryDays: form.get("expiryDays") ? Number(form.get("expiryDays")) : undefined }, "Reward rule activated.");
    if (kind === "WALLET_ADJUSTMENT") await submit("/api/v1/operations/benefits", { ...common, customerId: form.get("customerId"), direction: form.get("direction"), amount: Number(form.get("amount")), reason: form.get("reason"), idempotencyKey: "wallet-" + newId() }, "Wallet adjusted.");
    if (kind === "PURCHASE_MEMBERSHIP") await submit("/api/v1/operations/benefits", { ...common, customerId: form.get("customerId"), membershipId: form.get("membershipId"), idempotencyKey: "membership-" + newId() }, "Membership assigned.");
    if (kind === "PURCHASE_PACKAGE") await submit("/api/v1/operations/benefits", { ...common, customerId: form.get("customerId"), packageId: form.get("packageId"), idempotencyKey: "package-" + newId() }, "Package assigned.");
  }
  async function updateBenefit(body: Record<string, unknown>, message: string) {
    const branchId = data.identity.branchId || data.identity.branches[0]?.id;
    if (!branchId) return;
    await submit("/api/v1/operations/benefits", { ...body, branchId }, message, "PATCH", false);
  }
  const activeReward = data.rewardRules.find((rule) => rule.isActive);
  return <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3"><Info label="Active reward rule" value={activeReward ? activeReward.name : "Not configured"} tone="violet" /><Info label="Earn rate" value={activeReward ? `${activeReward.pointsPerAmount} pts per rupee` : "Default 1 per INR 100"} tone="green" /><Info label="Redeem value" value={activeReward ? `${inr.format(activeReward.amountPerPoint)} per point` : "INR 1 per point"} tone="amber" /></div>
      <Card title="Membership plans">{data.memberships.length ? data.memberships.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-t border-black/5 py-3 first:border-0"><div><p className="text-sm font-bold">{item.name}</p><p className="text-xs text-[#737174]">{item.durationDays} days - {item.discountPercent}% discount - {item.rewardMultiplier}x rewards - {item.isActive ? "Active" : "Archived"}</p></div><div className="text-right"><strong className="text-sm">{inr.format(item.price)}</strong><button onClick={() => void updateBenefit({ kind: "MEMBERSHIP", id: item.id, isActive: !item.isActive }, item.isActive ? "Membership archived." : "Membership restored.")} className="mt-1 block text-xs font-bold text-[#1969A2]">{item.isActive ? "Archive" : "Restore"}</button></div></div>) : <Empty text="No membership plans configured." />}</Card>
      <Card title="Prepaid packages">{data.packages.length ? data.packages.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-t border-black/5 py-3 first:border-0"><div><p className="text-sm font-bold">{item.name}</p><p className="text-xs text-[#737174]">{item.validityDays} days - {item.isActive ? "Active" : "Archived"}</p></div><div className="text-right"><strong className="text-sm">{inr.format(item.price)}</strong><button onClick={() => void updateBenefit({ kind: "PACKAGE", id: item.id, isActive: !item.isActive }, item.isActive ? "Package archived." : "Package restored.")} className="mt-1 block text-xs font-bold text-[#1969A2]">{item.isActive ? "Archive" : "Restore"}</button></div></div>) : <Empty text="No packages configured." />}</Card>
      <Card title="Gift cards">{data.giftCards.length ? data.giftCards.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-t border-black/5 py-3 first:border-0"><div><p className="text-sm font-bold">{item.code}</p><p className="text-xs text-[#737174]">{item.customer || "Unassigned"} - {title(item.status)}{item.expiresAt ? ` - Expires ${formatDate(new Date(item.expiresAt))}` : ""}</p></div><div className="text-right"><strong className="text-sm">{inr.format(item.balance)}</strong><button onClick={() => void updateBenefit({ kind: "GIFT_CARD", id: item.id, status: item.status === "ACTIVE" ? "CANCELLED" : "ACTIVE" }, item.status === "ACTIVE" ? "Gift card cancelled." : "Gift card restored.")} className="mt-1 block text-xs font-bold text-[#1969A2]">{item.status === "ACTIVE" ? "Cancel" : "Restore"}</button></div></div>) : <Empty text="No gift cards issued." />}</Card>
      <Card title="Reward rules">{data.rewardRules.length ? data.rewardRules.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-t border-black/5 py-3 first:border-0"><div><p className="text-sm font-bold">{item.name}</p><p className="text-xs text-[#737174]">{item.pointsPerAmount} pts per rupee - {inr.format(item.amountPerPoint)} per point - {item.isActive ? "Active" : "Archived"}</p></div><button onClick={() => void updateBenefit({ kind: "REWARD_RULE", id: item.id, isActive: !item.isActive }, item.isActive ? "Reward rule archived." : "Reward rule activated.")} className="text-xs font-bold text-[#1969A2]">{item.isActive ? "Archive" : "Activate"}</button></div>) : <Empty text="No reward rules configured." />}</Card>
    </div>
    <Card title="Benefit and reward actions">
      <div className="mb-4 grid grid-cols-2 gap-2">{(["MEMBERSHIP", "PACKAGE", "GIFT_CARD", "REWARD_RULE", "WALLET_ADJUSTMENT", "PURCHASE_MEMBERSHIP", "PURCHASE_PACKAGE"] as const).map((value) => <button type="button" key={value} onClick={() => setKind(value)} className={`rounded-xl border px-2 py-2 text-xs font-bold ${kind === value ? "bg-[#173279] text-white" : ""}`}>{title(value)}</button>)}</div>
      <form onSubmit={save} className="space-y-3">
        {kind === "MEMBERSHIP" && <><Field name="name" label="Plan name" /><Field name="price" label="Price" type="number" /><Field name="durationDays" label="Duration in days" type="number" /><Field name="discountPercent" label="Billing discount percent" type="number" defaultValue="0" /><Field name="rewardMultiplier" label="Reward multiplier" type="number" defaultValue="1" /><Field name="benefits" label="Benefits" /></>}
        {kind === "PACKAGE" && <><Field name="name" label="Package name" /><Field name="price" label="Price" type="number" /><Field name="validityDays" label="Validity in days" type="number" /><Select name="serviceId" label="Included service" options={data.services.map((item) => [item.id, item.name])} /><Field name="quantity" label="Uses" type="number" defaultValue="1" /></>}
        {kind === "GIFT_CARD" && <><Select name="customerId" label="Customer, optional" required={false} options={data.customers.map((item) => [item.id, item.name])} /><Field name="value" label="Card value" type="number" /><Field name="expiresAt" label="Expiry" type="date" required={false} /></>}
        {kind === "REWARD_RULE" && <><Field name="name" label="Rule name" defaultValue="Standard rewards" /><Field name="pointsPerAmount" label="Points per rupee" type="number" defaultValue="0.01" /><Field name="amountPerPoint" label="Rupee value per point" type="number" defaultValue="1" /><Field name="minRedeemPoints" label="Minimum redeem points" type="number" defaultValue="0" /><Field name="maxRedeemPercent" label="Max invoice redeem percent" type="number" defaultValue="20" /><Field name="expiryDays" label="Point expiry days, optional" type="number" required={false} /><label className="text-sm font-bold"><input name="earnOnTax" type="checkbox" /> Earn rewards on GST amount too</label></>}
        {kind === "WALLET_ADJUSTMENT" && <><Select name="customerId" label="Customer" options={data.customers.map((item) => [item.id, item.name])} /><Select name="direction" label="Direction" options={[["CREDIT", "Credit"], ["DEBIT", "Debit"]]} /><Field name="amount" label="Amount" type="number" /><Field name="reason" label="Reason" /></>}
        {kind === "PURCHASE_MEMBERSHIP" && <><Select name="customerId" label="Customer" options={data.customers.map((item) => [item.id, item.name])} /><Select name="membershipId" label="Membership" options={data.memberships.map((item) => [item.id, item.name])} /></>}
        {kind === "PURCHASE_PACKAGE" && <><Select name="customerId" label="Customer" options={data.customers.map((item) => [item.id, item.name])} /><Select name="packageId" label="Package" options={data.packages.map((item) => [item.id, item.name])} /></>}
        <button className="primary w-full justify-center">Save</button>
      </form>
    </Card>
  </div>;
}
