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
import { BranchProfileView } from "@/components/workspace/modules/branch-profile";
import { CompanyProfileView } from "@/components/workspace/modules/company-profile";
import { RolesView } from "@/components/workspace/modules/roles";
import { Card, Empty, Info, Row, formatDate, title } from "@/components/workspace/shared-ui";

const SETTINGS_TABS = [
  { id: "workspace", label: "Workspace" },
  { id: "roles", label: "Roles & rights" },
  { id: "company", label: "Company & GST" },
  { id: "branch", label: "This branch" },
  { id: "audit", label: "Audit log" },
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];

export function SettingsView({ data, submit }: { data: WorkspaceData; submit: SubmitFn }) {
  const [tab, setTab] = useState<SettingsTab>("workspace");

  return <div className="space-y-5">
    <div className="flex flex-wrap gap-1.5 rounded-2xl border border-[#E5E7EB] bg-white p-2 shadow-sm">
      {SETTINGS_TABS.map((item) => <button
        key={item.id}
        type="button"
        onClick={() => setTab(item.id)}
        className={`rounded-full px-4 py-2 text-xs font-extrabold transition ${tab === item.id ? "bg-[#173279] text-white" : "bg-[#F7FAFC] text-[#737174] hover:bg-[#eef5fc]"}`}
      >{item.label}</button>)}
    </div>

    {tab === "workspace" && <>
      <ShareBookingPageCard slug={data.identity.tenantSlug} tenantName={data.identity.tenantName} />
      <SubscriptionUsageCard subscription={data.identity.subscription} />
      <Card title="Workspace">
        <div className="grid gap-4 sm:grid-cols-2">
          <Info label="Business" value={data.identity.tenantName} />
          <Info label="Branch scope" value={data.identity.branchName} />
          <Info label="Location" value={data.identity.branchCity} />
          <Info label="Timezone" value="Asia/Kolkata" />
        </div>
      </Card>
    </>}

    {tab === "roles" && <RolesView data={data} submit={submit} />}
    {tab === "company" && <CompanyProfileView data={data} submit={submit} />}
    {tab === "branch" && <BranchProfileView data={data} submit={submit} />}

    {tab === "audit" && <Card title="Recent audit activity">
      {data.auditLogs.length
        ? data.auditLogs.slice(0, 20).map((log) => <Row key={log.id} primary={title(log.action)} secondary={`${log.user || "System"}  -  ${formatDate(new Date(log.createdAt))}`} value={log.entity} />)
        : <Empty text="No audit events recorded." />}
    </Card>}
  </div>;
}

export function SubscriptionUsageCard({ subscription }: { subscription: WorkspaceData["identity"]["subscription"] }) {
  if (!subscription) {
    return <Card title="SaaS package"><div className="rounded-2xl border border-[#F59E0B]/25 bg-[#FEF3C7] p-4 text-sm font-semibold text-[#92400E]">No active package is assigned. Ask Super Admin to assign a plan before adding more branches, services, staff, or appointments.</div></Card>;
  }
  const items = [
    { label: "Branches", used: subscription.usage.branches, limit: subscription.limits.branches },
    { label: "Staff", used: subscription.usage.staff, limit: subscription.limits.staff },
    { label: "Services", used: subscription.usage.services, limit: subscription.limits.services },
    { label: "Appointments this month", used: subscription.usage.monthlyAppointments, limit: subscription.limits.monthlyAppointments },
    { label: "Storage", used: subscription.usage.storageMb, limit: subscription.limits.storageMb, suffix: "MB" },
  ];
  const appointmentRemaining = Math.max(0, subscription.limits.monthlyAppointments - subscription.usage.monthlyAppointments);
  return <Card title="SaaS package" action={<span className="rounded-full bg-[#EFE8F6] px-3 py-1 text-xs font-semibold text-[#5B2A86]">{subscription.planName}</span>}>
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => <UsageBar key={item.label} {...item} />)}
      </div>
      <aside className="rounded-2xl border border-[#E8EAF0] bg-[#F6F7FB] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6B7280]">Plan status</p>
        <h3 className="mt-2 text-2xl font-bold tracking-tight text-[#171717]">{appointmentRemaining.toLocaleString("en-IN")}</h3>
        <p className="mt-1 text-sm text-[#6B7280]">appointments remaining this month</p>
        <div className="mt-4 grid gap-2">
          <button type="button" disabled className="rounded-xl border border-[#E8EAF0] bg-white px-4 py-3 text-left text-sm font-semibold text-[#9CA3AF] disabled:cursor-not-allowed">
            Request new brand
            <span className="mt-1 block text-xs font-medium text-[#9CA3AF]">Coming next: owner request - Super Admin approval - plan limit check.</span>
          </button>
          <button type="button" disabled className="rounded-xl border border-[#E8EAF0] bg-white px-4 py-3 text-left text-sm font-semibold text-[#9CA3AF] disabled:cursor-not-allowed">
            Request package upgrade
            <span className="mt-1 block text-xs font-medium text-[#9CA3AF]">Admin-assigned packages are supported; owner self-request workflow is pending.</span>
          </button>
        </div>
      </aside>
    </div>
  </Card>;
}

export function UsageBar({ label, used, limit, suffix = "" }: { label: string; used: number; limit: number; suffix?: string }) {
  const percentage = limit > 0 ? Math.min(100, used / limit * 100) : 0;
  const isWarning = percentage >= 80;
  const isFull = percentage >= 100;
  return <div className="rounded-2xl border border-[#E8EAF0] bg-white p-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-[#171717]">{label}</p>
        <p className="mt-1 text-xs text-[#6B7280]">{used.toLocaleString("en-IN")}{suffix ? ` ${suffix}` : ""} used of {limit.toLocaleString("en-IN")}{suffix ? ` ${suffix}` : ""}</p>
      </div>
      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${isFull ? "bg-[#FEE2E2] text-[#B91C1C]" : isWarning ? "bg-[#FEF3C7] text-[#B45309]" : "bg-[#D1FAE5] text-[#047857]"}`}>{Math.round(percentage)}%</span>
    </div>
    <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[#EEF2F7]">
      <div className={`dashboard-bar-grow h-full rounded-full ${isFull ? "bg-[#DC2626]" : isWarning ? "bg-[#F59E0B]" : "bg-[#14B8A6]"}`} style={{ width: `${Math.max(4, percentage)}%` }} />
    </div>
  </div>;
}

export function ShareBookingPageCard({ slug, tenantName }: { slug: string; tenantName: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? `/book/${slug}` : `${window.location.origin}/book/${slug}`;
  const whatsappText = encodeURIComponent(`Hi! You can book your appointment with ${tenantName} here: ${url}`);
  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }).catch(() => undefined);
  }
  return (
    <Card title="Share your booking page" action={<a href={url} target="_blank" rel="noreferrer" className="text-sm font-bold text-[#1789AA]">Preview</a>}>
      <p className="text-sm text-[#737174]">Send this link to your customers via WhatsApp, SMS, or Instagram bio. They can pick a service and confirm a slot in seconds.</p>
      <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-black/10 bg-[#F7FAFC] p-3 sm:flex-row sm:items-center">
        <code className="flex-1 truncate font-mono text-sm">{url}</code>
        <button onClick={copy} className="rounded-full bg-[#173279] px-4 py-2 text-xs font-bold text-white">{copied ? "Copied!" : "Copy link"}</button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={`https://wa.me/?text=${whatsappText}`} target="_blank" rel="noreferrer" className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-bold">Share on WhatsApp</a>
        <a href={`mailto:?subject=${encodeURIComponent("Book your appointment")}&body=${whatsappText}`} className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-bold">Share via email</a>
      </div>
    </Card>
  );
}
