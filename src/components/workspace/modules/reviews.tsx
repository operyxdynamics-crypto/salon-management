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
import { Card, Empty, Info, WorkspaceSelect, formatDate, title } from "@/components/workspace/shared-ui";

export function ReviewsView({ data, submit }: { data: WorkspaceData; submit: SubmitFn }) {
  const [rating, setRating] = useState("all");
  const items = data.reviews.filter((review) => rating === "all" || review.rating === Number(rating));
  async function reply(reviewId: string, mode: "reply" | "report") {
    const text = window.prompt(mode === "reply" ? "Write the salon reply:" : "Why should the platform review this rating?")?.trim();
    if (!text) return;
    await submit(`/api/v1/operations/reviews/${reviewId}`, mode === "reply" ? { salonReply: text } : { reportReason: text }, mode === "reply" ? "Reply published." : "Review reported to platform.", "PATCH");
  }
  const averageRating = data.reviews.length ? data.reviews.reduce((sum, review) => sum + review.rating, 0) / data.reviews.length : 0;
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-3">
      <Info label="Verified reviews" value={String(data.reviews.length)} tone="blue" />
      <Info label="Average rating" value={averageRating ? averageRating.toFixed(1) : "No data"} tone="amber" />
      <Info label="Needs reply" value={String(data.reviews.filter((review) => !review.salonReply).length)} tone="rose" />
    </div>
    <Card title="Verified visit reviews" action={<WorkspaceSelect className="w-48" value={rating} onChange={setRating} options={[{ value: "all", label: "All ratings" }, ...[5, 4, 3, 2, 1].map((value) => ({ value: String(value), label: `${value} stars` }))]} compact />}>
      <p className="mb-4 rounded-2xl bg-[#F7FAFC] p-3 text-xs font-bold text-[#7c5a1e]">Internal review inbox is available. Public marketplace review display and advanced moderation dashboards remain future marketplace work.</p>
      {items.length ? items.map((review) => <div key={review.id} className="border-t border-black/5 py-5 first:border-0"><div className="flex items-center justify-between gap-3"><div><p className="font-bold">{review.customer}</p><p className="text-xs text-[#737174]">{formatDate(new Date(review.createdAt))} - Verified completed visit</p></div><span className="font-bold text-[#1969A2]">{"★".repeat(review.rating)}</span></div><p className="mt-3 text-sm">{review.comment || "No written comment."}</p>{review.salonReply && <p className="mt-3 rounded-xl bg-[#F7FAFC] p-3 text-sm"><strong>Salon reply:</strong> {review.salonReply}</p>}<div className="mt-3 flex gap-2"><button onClick={() => reply(review.id, "reply")} className="rounded-full border px-3 py-1.5 text-xs font-bold">Reply</button><button onClick={() => reply(review.id, "report")} className="rounded-full border px-3 py-1.5 text-xs font-bold text-[#1969A2]">Report</button></div></div>) : <Empty text="No verified reviews match this filter." />}
    </Card>
  </div>;
}
