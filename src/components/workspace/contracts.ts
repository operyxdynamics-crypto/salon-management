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


export const navItems = ["Overview", "Appointments", "Customers", "Point of sale", "Register", "Services", "Inventory", "Masters", "Team", "Memberships", "Marketing", "Reviews", "Reports", "Settings"] as const;

export type NavItem = (typeof navItems)[number];

export type ModalName = "appointment" | "customer" | "service" | "stock" | "expense" | "leave" | "staff" | null;

export type BookingSeed = {
  branchId?: string;
  date?: string;
  startsAt?: string;
  staffId?: string;
  customerId?: string;
  source?: "WALK_IN" | "PHONE" | "STAFF_CREATED";
};

export type PosSeed = { branchId?: string; customerId?: string; appointmentId?: string };

export type MutationResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string; code?: string; details?: unknown };

export type SubmitFn = <T = unknown>(path: string, body: unknown, message: string, method?: string, closeModal?: boolean) => Promise<MutationResult<T>>;

export type WorkspaceDetail = { appointmentId: string | null; customerId: string | null; serviceId: string | null; invoiceId: string | null };

export type AppointmentItem = WorkspaceData["appointments"][number];

export type WorkspaceOption = { value: string; label: string; description?: string; disabled?: boolean };
