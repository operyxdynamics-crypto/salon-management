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
import { Card, Empty, Field, Select, SetupRequiredCard, SlotMessage, Status, title } from "@/components/workspace/shared-ui";

export function MarketingView({ data, submit }: { data: WorkspaceData; submit: SubmitFn }) {
  const branchId = data.identity.branchId || "";
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!branchId) return;
    const form = new FormData(event.currentTarget);
    await submit("/api/v1/operations/campaigns", {
      branchId,
      name: form.get("name"),
      channel: form.get("channel"),
      segment: form.get("segment"),
      template: form.get("template"),
      scheduledAt: form.get("scheduledAt") ? new Date(String(form.get("scheduledAt"))).toISOString() : undefined,
      idempotencyKey: `campaign-${newId()}`,
    }, "Campaign draft saved. Delivery requires provider setup.");
  }
  if (!branchId) return <Card title="Marketing"><SlotMessage text="Select one branch before creating campaign drafts. All-branch campaign sending is disabled until provider configuration and consent rules are finalized." /></Card>;
  return <div className="space-y-5">
    <div className="grid gap-4 md:grid-cols-3">
      <SetupRequiredCard icon={<MessageCircle size={18} />} title="WhatsApp setup required" text="Approved WhatsApp Business templates and provider credentials are not configured yet." />
      <SetupRequiredCard icon={<Phone size={18} />} title="SMS setup required" text="OTP/reminder provider credentials are pending. Campaigns should not show sent success." />
      <SetupRequiredCard icon={<Mail size={18} />} title="Email setup required" text="Email sender domain, templates and delivery logs need production configuration." />
    </div>
    <div className="grid gap-5 xl:grid-cols-[1fr_400px]">
      <Card title="Campaign drafts and queues">{data.campaigns.length ? data.campaigns.map((campaign) => <div key={campaign.id} className="flex items-center gap-4 border-t border-black/5 py-4 first:border-0"><div className="grid size-10 place-items-center rounded-xl bg-[#E8FBFB] text-[#1969A2]"><Send size={17} /></div><div className="min-w-0 flex-1"><p className="truncate font-bold">{campaign.name}</p><p className="text-xs text-[#737174]">{title(campaign.channel)} - {campaign.sent} sent - {campaign.failed} failed</p><p className="mt-1 text-[11px] font-bold text-[#7b5514]">Delivery remains setup-required until provider credentials are added.</p></div><Status value={campaign.status} /></div>) : <Empty text="No campaign drafts created yet." />}</Card>
      <Card title="Campaign builder"><p className="mb-4 rounded-2xl bg-[#F7FAFC] p-3 text-xs font-bold text-[#7c5a1e]">This saves campaign configuration and consent-filtered recipients. It does not guarantee WhatsApp/SMS/email delivery until providers are configured.</p><form onSubmit={save} className="space-y-3"><Field name="name" label="Campaign name" /><Select name="channel" label="Channel" options={[["WHATSAPP", "WhatsApp"], ["SMS", "SMS"], ["EMAIL", "Email"]]} /><Select name="segment" label="Audience" options={[["ALL", "All consented customers"], ["BIRTHDAY", "Birthday customers"], ["INACTIVE", "Inactive customers"], ["LOYAL", "Loyal customers"]]} /><label className="text-sm font-bold">Message<textarea name="template" required maxLength={3000} className="field mt-2 min-h-32" placeholder="Hello {{name}}, ..." /></label><Field name="scheduledAt" label="Schedule, optional" type="datetime-local" required={false} /><button className="primary w-full justify-center">Save draft</button></form></Card>
    </div>
  </div>;
}
