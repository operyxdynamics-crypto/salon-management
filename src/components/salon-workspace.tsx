"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
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
import { getWorkspaceBootstrap, mutateWorkspace, WorkspaceClientError } from "@/components/workspace/client";
import { AppointmentItem, BookingSeed, ModalName, MutationResult, NavItem, PosSeed, WorkspaceDetail, WorkspaceOption, navItems } from "@/components/workspace/contracts";
import { Avatar, Banner, canCheckoutAppointmentStatus, canOpen, mobileNavLabel, mobileTabsForRole, roleExperienceLabel, title } from "@/components/workspace/shared-ui";

const Overview = dynamic(() => import("@/components/workspace/modules/overview").then((module) => module.Overview), { loading: WorkspaceModuleLoading });
const AppointmentsView = dynamic(() => import("@/components/workspace/modules/bookings").then((module) => module.AppointmentsView), { loading: WorkspaceModuleLoading });
const CustomersView = dynamic(() => import("@/components/workspace/modules/customers").then((module) => module.CustomersView), { loading: WorkspaceModuleLoading });
// Billing is the invoice module. The POS is an action inside it, not the whole screen - most visits
// here are to look an invoice up, not to start a sale.
const BillingWorkspace = dynamic(() => import("@/components/workspace/modules/billing-workspace").then((module) => module.BillingWorkspace), { loading: WorkspaceModuleLoading });
const RegisterView = dynamic(() => import("@/components/workspace/modules/day-close").then((module) => module.RegisterView), { loading: WorkspaceModuleLoading });
const ServicesDomain = dynamic(() => import("@/components/workspace/modules/services-domain").then((module) => module.ServicesDomain), { loading: WorkspaceModuleLoading });
const ProductsDomain = dynamic(() => import("@/components/workspace/modules/products-domain").then((module) => module.ProductsDomain), { loading: WorkspaceModuleLoading });
const TeamView = dynamic(() => import("@/components/workspace/modules/team").then((module) => module.TeamView), { loading: WorkspaceModuleLoading });
const OffersDomain = dynamic(() => import("@/components/workspace/modules/offers-domain").then((module) => module.OffersDomain), { loading: WorkspaceModuleLoading });
const MarketingView = dynamic(() => import("@/components/workspace/modules/marketing").then((module) => module.MarketingView), { loading: WorkspaceModuleLoading });
const ReviewsView = dynamic(() => import("@/components/workspace/modules/reviews").then((module) => module.ReviewsView), { loading: WorkspaceModuleLoading });
const ReportsView = dynamic(() => import("@/components/workspace/modules/reports").then((module) => module.ReportsView), { loading: WorkspaceModuleLoading });
const SettingsView = dynamic(() => import("@/components/workspace/modules/settings").then((module) => module.SettingsView), { loading: WorkspaceModuleLoading });
const MastersView = dynamic(() => import("@/components/workspace/modules/masters").then((module) => module.MastersView), { loading: WorkspaceModuleLoading });

// Branch scope picker: ownership presets (COCO/FOCO/FOFO) over the existing multi-select, with
// branches grouped under the business that operates them.
import { BranchScopePicker, scopeSummary } from "@/components/workspace/branch-scope";
const OperationModal = dynamic(() => import("@/components/workspace/operation-modal").then((module) => module.OperationModal));
const AppointmentDrawer = dynamic(() => import("@/components/workspace/details").then((module) => module.AppointmentDrawer));
const CustomerProfileView = dynamic(() => import("@/components/workspace/details").then((module) => module.CustomerProfileView));
const ServiceProfileView = dynamic(() => import("@/components/workspace/details").then((module) => module.ServiceProfileView));

function WorkspaceModuleLoading() {
  return <div className="grid min-h-56 place-items-center rounded-2xl border border-[#E5E7EB] bg-white text-sm font-semibold text-[#6B7280]"><RefreshCw size={18} className="mr-2 inline animate-spin" />Loading module...</div>;
}


type ThemeMode = "system" | "light" | "dark";


type WorkspaceCommandItem = {
  label: string;
  helper: string;
  icon: LucideIcon;
  onClick: () => void;
  primary?: boolean;
  module?: NavItem;
};
type ModuleSignalItem = {
  label: string;
  value: string;
  tone?: "neutral" | "green" | "blue" | "amber" | "rose" | "violet";
};
type ModuleExperienceConfig = {
  eyebrow: string;
  title: string;
  summary: string;
  focus: string;
  signals: ModuleSignalItem[];
};


const icons: Record<NavItem, typeof LayoutDashboard> = {
  Overview: LayoutDashboard,
  Appointments: CalendarDays,
  Customers: Users,
  "Point of sale": CreditCard,
  Register: CircleDollarSign,
  Services: Sparkles,
  Inventory: Boxes,
  Team: UserRound,
  Memberships: Gift,
  Marketing: MessageCircle,
  Reviews: Star,
  Reports: BarChart3,
  Masters: ClipboardList,
  Settings,
};

const navRouteSlugs: Record<NavItem, string> = {
  Overview: "",
  Appointments: "bookings",
  Customers: "customers",
  "Point of sale": "billing",
  Register: "day-close",
  Services: "services-prices",
  Inventory: "stock",
  Masters: "masters",
  Team: "team",
  Memberships: "offers",
  Marketing: "marketing",
  Reviews: "reviews",
  Reports: "reports",
  Settings: "settings",
};

const navSlugAliases: Record<string, NavItem> = {
  home: "Overview",
  dashboard: "Overview",
  overview: "Overview",
  appointments: "Appointments",
  bookings: "Appointments",
  customers: "Customers",
  pos: "Point of sale",
  billing: "Point of sale",
  "point-of-sale": "Point of sale",
  register: "Register",
  "day-close": "Register",
  services: "Services",
  "services-prices": "Services",
  inventory: "Inventory",
  stock: "Inventory",
  masters: "Masters",
  team: "Team",
  memberships: "Memberships",
  offers: "Memberships",
  invoices: "Reports",
  marketing: "Marketing",
  reviews: "Reviews",
  reports: "Reports",
  settings: "Settings",
};

function navFromRouteSlug(value?: string | null): NavItem {
  if (!value) return "Overview";
  const slug = decodeURIComponent(value).trim().toLowerCase();
  return navSlugAliases[slug] || "Overview";
}

function navFromWorkspacePath(pathname: string): NavItem {
  const parts = pathname.split("/").filter(Boolean);
  const workspaceIndex = parts.indexOf("workspace");
  const dashboardIndex = parts.indexOf("dashboard");
  const baseIndex = workspaceIndex >= 0 ? workspaceIndex : dashboardIndex;
  return navFromRouteSlug(baseIndex >= 0 ? parts[baseIndex + 1] : null);
}

function workspacePathForNav(item: NavItem) {
  const slug = navRouteSlugs[item];
  return slug ? `/workspace/${slug}` : "/workspace/home";
}

type WorkspaceNavGroupId = "daily" | "catalogue" | "business" | "analyse";
/**
 * Three groups, named after what you are doing rather than after the data.
 *
 *   Run     - what happens today, over and over. A receptionist lives entirely here.
 *   Set up  - the things you configure once and rarely touch again.
 *   Analyse - looking backwards.
 *
 * The old grouping ("Daily / Setup / Business") put Reports next to Settings and Marketing, which
 * are three unrelated jobs, and buried Masters among the daily screens.
 */
const workspaceNavGroups: { id: WorkspaceNavGroupId; label: string; helper: string; items: NavItem[] }[] = [
  // Grouped the way a salon owner reasons: what I do all day, what I sell, how I run the business,
  // what I look back on. "Catalogue" holds the things you offer and the setup behind them;
  // "Business" holds the people and settings that keep it running.
  { id: "daily", label: "Run", helper: "Today", items: ["Overview", "Appointments", "Point of sale", "Customers", "Register"] },
  { id: "catalogue", label: "Catalogue", helper: "What you sell", items: ["Services", "Inventory", "Memberships", "Masters"] },
  { id: "business", label: "Business", helper: "How you run it", items: ["Team", "Settings"] },
  { id: "analyse", label: "Analyse", helper: "Look back", items: ["Reports", "Marketing", "Reviews"] },
];

export function SalonWorkspace({ initialData, initialDetail, initialModule }: { initialData: WorkspaceData; initialDetail?: WorkspaceDetail; initialModule?: string | null }) {
  const [data, setData] = useState(initialData);
  const [active, setActive] = useState<NavItem>(() => navFromRouteSlug(initialModule));
  const [moreOpen, setMoreOpen] = useState(false);
  const [desktopMoreOpen, setDesktopMoreOpen] = useState(false);
  const [newActionOpen, setNewActionOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileBranchSheetOpen, setMobileBranchSheetOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [modal, setModal] = useState<ModalName>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const initialSelectedBranchIds = initialData.identity.selectedBranchIds?.length
    ? initialData.identity.selectedBranchIds
    : initialData.identity.branchId
      ? [initialData.identity.branchId]
      : initialData.identity.branches.map((branch) => branch.id);
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>(initialSelectedBranchIds);
  const [branchScopeMode, setBranchScopeMode] = useState<"all" | "selection">(initialData.identity.scope === "all" ? "all" : "selection");
  const [selectedBranchId, setSelectedBranchId] = useState(initialData.identity.scope === "all" ? "all" : initialSelectedBranchIds.length === 1 ? initialSelectedBranchIds[0] : "all");
  const [branchDraftIds, setBranchDraftIds] = useState<string[]>(initialSelectedBranchIds);
  const [branchDraftScopeMode, setBranchDraftScopeMode] = useState<"all" | "selection">(initialData.identity.scope === "all" ? "all" : "selection");
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  // Kept only so the menu can clear its search when it closes; the picker owns the input itself.
  const [, setBranchSearch] = useState("");
  const branchMenuRef = useRef<HTMLDivElement>(null);
  const [bookingSeed, setBookingSeed] = useState<BookingSeed>({});
  const [detail, setDetail] = useState<WorkspaceDetail>(initialDetail || { appointmentId: null, customerId: null, serviceId: null, invoiceId: null });
  // An ?invoiceId in the URL is a shared link to one bill, so open that bill rather than the list.
  const [focusedInvoiceId, setFocusedInvoiceId] = useState<string | null>(initialDetail?.invoiceId ?? null);
  const [posSeed, setPosSeed] = useState<PosSeed | null>(null);
  const visibleNavItems = navItems.filter((item) => canOpen(data.identity.role, item));
  const visibleNavGroups = workspaceNavGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => visibleNavItems.includes(item)) }))
    .filter((group) => group.items.length);
  const mobileTabs = mobileTabsForRole(data.identity.role, visibleNavItems);
  const mobileMoreItems = visibleNavItems.filter((item) => !mobileTabs.includes(item));
  const branchOptions = useMemo<WorkspaceOption[]>(() => [
    { value: "all", label: "All branches", description: "Salon-wide view" },
    ...data.identity.branches.map((branch) => ({ value: branch.id, label: branch.name, description: branch.city })),
  ], [data.identity.branches]);
  const selectedBranch = data.identity.branches.find((branch) => branch.id === selectedBranchId);
  const allBranchIds = data.identity.branches.map((branch) => branch.id);
  const isAllBranchesSelected = branchScopeMode === "all";
  const isDraftAllBranchesSelected = branchDraftScopeMode === "all";
  // The scope's identity, in words and colour: "All FOFO", "3 FOCO branches", a single branch name.
  const appliedScope = scopeSummary(data.identity.branches, selectedBranchIds, isAllBranchesSelected);
  const draftScope = scopeSummary(data.identity.branches, branchDraftIds, isDraftAllBranchesSelected);
  const branchDraftSelectionCountLabel = draftScope.label;
  const branchDraftDirty = branchDraftScopeMode !== branchScopeMode
    || branchDraftIds.length !== selectedBranchIds.length
    || branchDraftIds.some((id) => !selectedBranchIds.includes(id));

  useEffect(() => {
    const savedTheme = localStorage.getItem("operyx-theme-mode");
    if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "system") setThemeMode(savedTheme);
    setPreferencesLoaded(true);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const resolved = themeMode === "system" ? media.matches ? "dark" : "light" : themeMode;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.dataset.themeMode = themeMode;
      document.documentElement.style.colorScheme = resolved;
      if (preferencesLoaded) localStorage.setItem("operyx-theme-mode", themeMode);
    };
    applyTheme();
    if (themeMode !== "system") return;
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [preferencesLoaded, themeMode]);

  const readDetailFromUrl = useCallback((): WorkspaceDetail => {
    const params = new URLSearchParams(window.location.search);
    return {
      appointmentId: params.get("appointmentId"),
      customerId: params.get("customerId"),
      serviceId: params.get("serviceId"),
      invoiceId: params.get("invoiceId"),
    };
  }, []);

  useEffect(() => {
    const sync = () => {
      const next = readDetailFromUrl();
      setDetail(next);
      // Keep a shared ?invoiceId link working through back/forward too, not only on first load.
      if (next.invoiceId) setFocusedInvoiceId(next.invoiceId);
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [readDetailFromUrl]);

  useEffect(() => {
    const syncModule = () => {
      const next = navFromWorkspacePath(window.location.pathname);
      if (!canOpen(data.identity.role, next)) return;
      setActive(next);
      setMoreOpen(false);
      setDesktopMoreOpen(false);
      setNewActionOpen(false);
      setProfileOpen(false);
      setMobileBranchSheetOpen(false);
      setNotice("");
      setError("");
    };
    window.addEventListener("popstate", syncModule);
    return () => window.removeEventListener("popstate", syncModule);
  }, [data.identity.role]);

  useEffect(() => {
    if (!branchMenuOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!branchMenuRef.current?.contains(event.target as Node)) {
        resetBranchDraft();
        setBranchMenuOpen(false);
        setBranchSearch("");
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      resetBranchDraft();
      setBranchMenuOpen(false);
      setBranchSearch("");
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [branchMenuOpen, branchScopeMode, selectedBranchIds]);

  async function refresh(message?: string, branchIds = selectedBranchIds, scopeMode = branchScopeMode) {
    let nextData: WorkspaceData;
    try {
      nextData = await getWorkspaceBootstrap(branchIds, scopeMode);
    } catch (requestError) {
      if (requestError instanceof WorkspaceClientError && [401, 403].includes(requestError.status)) {
        window.location.href = "/login";
        return;
      }
      throw requestError;
    }
    setData(nextData);
    const nextBranchIds = nextData.identity.selectedBranchIds?.length ? nextData.identity.selectedBranchIds : branchIds;
    setSelectedBranchIds(nextBranchIds);
    setBranchScopeMode(scopeMode);
    setSelectedBranchId(scopeMode === "all" ? "all" : nextBranchIds.length === 1 ? nextBranchIds[0] : "all");
    if (message) setNotice(message);
  }

  async function submit<T = unknown>(path: string, body: unknown, message: string, method = "POST", closeModal = true): Promise<MutationResult<T>> {
    const payload = body as Record<string, unknown>;
    const operationBranchId = typeof payload.branchId === "string" ? payload.branchId : selectedBranchId;
    if (path.startsWith("/api/v1/operations/") && operationBranchId === "all") {
      setError("Select a branch before making operational changes.");
      return { ok: false, error: "Select a branch before making operational changes." };
    }
    setBusy(true);
    setError("");
    try {
      const result = await mutateWorkspace<T>(path, method, { ...payload, branchId: operationBranchId });
      if (closeModal) setModal(null);
      await refresh(message);
      return { ok: true, data: result };
    } catch (requestError) {
      const clientError = requestError instanceof WorkspaceClientError ? requestError : null;
      const requestMessage = clientError?.message || (requestError instanceof Error ? requestError.message : "Unable to save");
      setError(requestMessage);
      return { ok: false, error: requestMessage, code: clientError?.code, details: clientError?.details };
    } finally {
      setBusy(false);
    }
  }

  function openAppointment(seed: BookingSeed | React.SyntheticEvent = {}) {
    setBookingSeed("nativeEvent" in seed ? {} : seed);
    setModal("appointment");
    setError("");
  }

  function syncWorkspaceUrl(item: NavItem) {
    if (typeof window === "undefined") return;
    const nextPath = workspacePathForNav(item);
    if (window.location.pathname === nextPath && !window.location.search && !window.location.hash) return;
    window.history.pushState({ operyxModule: item }, "", nextPath);
  }

  function navigate(item: NavItem) {
    if (detail.appointmentId || detail.customerId || detail.serviceId) closeDetail();
    if (item !== "Reports") setFocusedInvoiceId(null);
    setActive(item);
    syncWorkspaceUrl(item);
    setMoreOpen(false);
    setDesktopMoreOpen(false);
    setNewActionOpen(false);
    setProfileOpen(false);
    setMobileBranchSheetOpen(false);
    setNotice("");
    setError("");
  }

  async function changeBranchSelection(branchIds: string[], scopeMode: "all" | "selection" = "selection") {
    const normalized = branchIds.length ? [...new Set(branchIds)] : allBranchIds;
    setBranchScopeMode(scopeMode);
    setSelectedBranchIds(normalized);
    setSelectedBranchId(scopeMode === "all" ? "all" : normalized.length === 1 ? normalized[0] : "all");
    setBranchDraftScopeMode(scopeMode);
    setBranchDraftIds(normalized);
    setBusy(true);
    try {
      await refresh(undefined, normalized, scopeMode);
      setBranchMenuOpen(false);
      setBranchSearch("");
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Unable to change branch");
    } finally {
      setBusy(false);
    }
  }

  function resetBranchDraft() {
    setBranchDraftScopeMode(branchScopeMode);
    setBranchDraftIds(selectedBranchIds.length ? selectedBranchIds : allBranchIds);
  }

  function toggleTopbarBranchSelector() {
    setBranchMenuOpen((open) => {
      if (!open) {
        setBranchDraftScopeMode(branchScopeMode);
        setBranchDraftIds(selectedBranchIds.length ? selectedBranchIds : allBranchIds);
        setBranchSearch("");
      }
      return !open;
    });
  }

  // Selection, presets, grouping, and search all live in BranchScopePicker now.

  async function applyBranchDraft() {
    const nextIds = branchDraftScopeMode === "all" ? allBranchIds : branchDraftIds;
    await changeBranchSelection(nextIds.length ? nextIds : allBranchIds, branchDraftScopeMode);
  }

  async function changeBranch(branchId: string) {
    await changeBranchSelection(branchId === "all" ? allBranchIds : [branchId], branchId === "all" ? "all" : "selection");
  }

  function openInvoiceCenter(invoiceId?: string) {
    // Invoices live in Billing now, next to the till that produced them - not in Reports, next to
    // the expense charts.
    setFocusedInvoiceId(invoiceId || null);
    navigate("Point of sale");
    // Put the bill in the address bar, so the page can be refreshed, bookmarked, or shared and
    // still land on the same invoice rather than the list.
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (invoiceId) params.set("invoiceId", invoiceId);
      else params.delete("invoiceId");
      const query = params.toString();
      window.history.replaceState(null, "", `${workspacePathForNav("Point of sale")}${query ? `?${query}` : ""}`);
    }
  }

  async function openPointOfSaleSeed(seed: PosSeed) {
    const targetBranchId = seed.branchId || (selectedBranchId === "all" ? selectedBranchIds[0] || data.identity.branches[0]?.id : selectedBranchId);
    if (!targetBranchId) {
      setError("Select a branch before recording a sale.");
      return;
    }
    setPosSeed({ ...seed, branchId: targetBranchId });
    closeDetail();
    setActive("Point of sale");
    syncWorkspaceUrl("Point of sale");
    setMoreOpen(false);
    setNotice("");
    setError("");
    if (targetBranchId && targetBranchId !== selectedBranchId) {
      setBranchScopeMode("selection");
      setSelectedBranchIds([targetBranchId]);
      setSelectedBranchId(targetBranchId);
      setBusy(true);
      try {
        await refresh(undefined, [targetBranchId], "selection");
      } catch (refreshError) {
        setError(refreshError instanceof Error ? refreshError.message : "Unable to load branch for sale");
      } finally {
        setBusy(false);
      }
    }
  }

  async function openCustomerSale(customerId: string, branchId?: string) {
    await openPointOfSaleSeed({ customerId, branchId });
  }

  async function openAppointmentSale(appointment: AppointmentItem) {
    if (appointment.invoice) {
      openInvoiceCenter(appointment.invoice.id);
      return;
    }
    if (!canCheckoutAppointmentStatus(appointment.status)) {
      setError(`Checkout is unavailable for ${title(appointment.status).toLowerCase()} appointments.`);
      return;
    }
    await openPointOfSaleSeed({ branchId: appointment.branchId, customerId: appointment.customerId, appointmentId: appointment.id });
  }

  async function openAppointmentDetailSale(appointment: AppointmentDetail) {
    if (appointment.invoice) {
      openInvoiceCenter(appointment.invoice.id);
      return;
    }
    if (!canCheckoutAppointmentStatus(appointment.status)) {
      setError(`Checkout is unavailable for ${title(appointment.status).toLowerCase()} appointments.`);
      return;
    }
    await openPointOfSaleSeed({ branchId: appointment.branch.id, customerId: appointment.customer.id, appointmentId: appointment.id });
  }

  function openDetail(kind: keyof WorkspaceDetail, id: string) {
    const params = new URLSearchParams(window.location.search);
    params.delete("appointmentId");
    params.delete("customerId");
    params.delete("serviceId");
    params.set(kind, id);
    window.history.pushState(null, "", `${window.location.pathname}?${params.toString()}`);
    setDetail({
      appointmentId: kind === "appointmentId" ? id : null,
      customerId: kind === "customerId" ? id : null,
      serviceId: kind === "serviceId" ? id : null,
      invoiceId: kind === "invoiceId" ? id : null,
    });
  }

  function closeDetail() {
    const params = new URLSearchParams(window.location.search);
    params.delete("appointmentId");
    params.delete("customerId");
    params.delete("serviceId");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    setDetail({ appointmentId: null, customerId: null, serviceId: null, invoiceId: null });
  }

  const activeLabel = mobileNavLabel(active);
  const branchContextLabel = isAllBranchesSelected
    ? "All branches"
    : selectedBranchIds.length === 1
      ? selectedBranch?.name || data.identity.branchName
      : "Selected branches";
  const branchContextDetail = isAllBranchesSelected
    ? data.identity.tenantName
    : selectedBranchIds.length === 1
      ? selectedBranch?.city || data.identity.branchCity
      : data.identity.branches.filter((branch) => selectedBranchIds.includes(branch.id)).map((branch) => branch.name).join(", ");
  const branchSelectionCountLabel = isAllBranchesSelected
    ? `${data.identity.branches.length} branch${data.identity.branches.length === 1 ? "" : "es"} selected`
    : `${selectedBranchIds.length} branch${selectedBranchIds.length === 1 ? "" : "es"} selected`;
  const themeLabel = themeMode === "system" ? "System theme" : themeMode === "dark" ? "Dark mode" : "Light mode";
  const ThemeIcon = themeMode === "system" ? Monitor : themeMode === "dark" ? Moon : SunMedium;
  const cycleTheme = () => setThemeMode((current) => current === "system" ? "light" : current === "light" ? "dark" : "system");
  const topbarRegister = data.registerSessions.find((session) => session.status === "OPEN");
  const dashboardTitle = active === "Overview" ? "Dashboard" : activeLabel;
  const newActionItems = ([
    { label: "Booking", helper: "Book visit", icon: CalendarDays, onClick: () => openAppointment(), module: "Appointments", primary: true },
    { label: "Bill", helper: "Open billing", icon: CreditCard, onClick: () => navigate("Point of sale"), module: "Point of sale" },
    { label: "Customer", helper: "Quick CRM", icon: Users, onClick: () => setModal("customer"), module: "Customers" },
    { label: "Stock", helper: "Stock entry", icon: PackagePlus, onClick: () => setModal("stock"), module: "Inventory" },
    { label: "Expense", helper: "Daily spend", icon: ReceiptText, onClick: () => setModal("expense"), module: "Reports" },
  ] satisfies WorkspaceCommandItem[]).filter((item) => !item.module || canOpen(data.identity.role, item.module));

  /**
   * What "New" creates on the page you are looking at.
   *
   * A button that means the same thing everywhere is a menu; a button that means the obvious thing
   * here is an action. On Bookings it books someone. On Billing it starts a sale. Everything else
   * is still one click away under the chevron.
   */
  const primaryNewByModule: Partial<Record<NavItem, { label: string; onClick: () => void }>> = {
    Overview: { label: "New booking", onClick: () => openAppointment() },
    Appointments: { label: "New booking", onClick: () => openAppointment() },
    "Point of sale": { label: "New sale", onClick: () => navigate("Point of sale") },
    Customers: { label: "New customer", onClick: () => setModal("customer") },
    Inventory: { label: "Stock entry", onClick: () => setModal("stock") },
    Services: { label: "New service", onClick: () => setModal("service") },
    Team: { label: "New team member", onClick: () => setModal("staff") },
    Reports: { label: "New expense", onClick: () => setModal("expense") },
    Register: { label: "New expense", onClick: () => setModal("expense") },
  };
  const primaryNewAction = primaryNewByModule[active] ?? { label: "New booking", onClick: () => openAppointment() };

  /**
   * What needs attention, per module.
   *
   * A sidebar that only navigates makes you go looking for problems. One that carries counts brings
   * the problems to you: three people not checked in, two visits unbilled, a branch that cannot
   * issue a GST invoice. These are the same facts the dashboard alerts use - shown where the eye
   * already is.
   *
   * Only genuine "someone must act" counts appear. A number that is merely interesting is noise on
   * a navigation item.
   */
  const nowMs = Date.now();
  const navAttention: Partial<Record<NavItem, { count: number; urgent: boolean }>> = {
    Appointments: {
      count: data.appointments.filter((item) => item.status === "CONFIRMED" && new Date(item.startsAt).getTime() < nowMs).length,
      urgent: false,
    },
    "Point of sale": {
      count: data.appointments.filter((item) => item.status === "COMPLETED" && !item.invoice).length,
      urgent: true,
    },
    Reports: {
      count: data.recentInvoices.filter((invoice) => invoice.type === "SALE" && invoice.total - invoice.paid > 0.01).length,
      urgent: false,
    },
    Inventory: { count: data.metrics.lowStockCount, urgent: false },
    Settings: { count: data.identity.branches.filter((branch) => !branch.gstReady).length, urgent: true },
  };

  return (
    <div className="operyx-workspace-ui mobile-app-shell min-h-screen overflow-x-hidden text-[#111827]">
      <aside className={`workspace-sidebar fixed inset-y-0 left-0 z-40 hidden flex-col overflow-hidden border-r border-[#E8EAF0] bg-white text-[#171717] transition-[width] duration-300 lg:flex ${sidebarCollapsed ? "w-14" : "w-56"}`}>
        <div className="workspace-sidebar-orb workspace-sidebar-orb-one" />
        <div className="workspace-sidebar-orb workspace-sidebar-orb-two" />
        <div className={`relative flex h-[72px] shrink-0 items-center border-b border-[#E8EAF0] px-3 ${sidebarCollapsed ? "justify-center" : "justify-between"}`}>
          <Link href="/" className={`workspace-brand-link flex min-w-0 items-center gap-2.5 rounded-xl transition hover:opacity-90 ${sidebarCollapsed ? "justify-center" : "px-1"}`} title={brandName}>
            <BrandMark compact={sidebarCollapsed} />
          </Link>
          {!sidebarCollapsed && <button type="button" onClick={() => setSidebarCollapsed(true)} className="workspace-icon-button grid size-9 shrink-0 place-items-center rounded-lg border border-[#E8EAF0] bg-white text-[#6B7280] transition hover:border-[#5B2A86]/30 hover:text-[#5B2A86]" aria-label="Collapse sidebar"><PanelLeftClose size={17} /></button>}
        </div>
        {sidebarCollapsed && <div className="relative mx-2 grid shrink-0 gap-2">
          <button type="button" onClick={() => setSidebarCollapsed(false)} className="grid size-10 place-items-center rounded-lg border border-[#E8EAF0] bg-white text-[#5B2A86] transition hover:bg-[#EFE8F6]" aria-label="Expand sidebar"><PanelLeftOpen size={18} /></button>
        </div>}
        <nav className={`relative mt-4 min-h-0 flex-1 overflow-y-auto pb-4 ${sidebarCollapsed ? "space-y-2 px-2" : "space-y-3 px-3"}`}>
          {sidebarCollapsed ? visibleNavItems.map((item) => {
            const Icon = icons[item];
            const selected = active === item;
            const attention = navAttention[item];
            const needsAttention = (attention?.count ?? 0) > 0;
            return <button
              key={item}
              onClick={() => navigate(item)}
              title={needsAttention ? `${mobileNavLabel(item)} - ${attention!.count} need attention` : mobileNavLabel(item)}
              className={`workspace-nav-item group relative grid w-full place-items-center rounded-xl px-2 py-2.5 transition ${selected ? "bg-[#EFE8F6] text-[#5B2A86]" : "text-[#6B7280] hover:bg-[#F6F7FB] hover:text-[#171717]"}`}
              aria-current={selected ? "page" : undefined}
            >
              {/* The active bar, not a background swap: it survives at any width and reads as
                  "you are here" rather than "this is hovered". */}
              {selected && <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-[#5B2A86]" />}
              <span className="relative grid size-10 place-items-center">
                <Icon size={18} />
                {/* Collapsed, there is no room for a number - but a dot still says "look here". */}
                {needsAttention && <span className={`absolute right-1 top-1 size-2 rounded-full ring-2 ring-white ${attention!.urgent ? "bg-[#C4403E]" : "bg-[#B57900]"}`} />}
              </span>
            </button>;
          }) : visibleNavGroups.map((group) => {
            return <section key={group.id} className="workspace-nav-group">
              <p className="workspace-nav-section-label px-2 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">{group.label}</p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = icons[item];
                  const selected = active === item;
                  const attention = navAttention[item];
                  const count = attention?.count ?? 0;
                  return <button
                    key={item}
                    onClick={() => navigate(item)}
                    className={`workspace-nav-item group/item relative flex w-full items-center gap-2.5 rounded-lg py-2 pl-3 pr-2 text-sm transition ${selected ? "bg-[#EFE8F6] font-semibold text-[#5B2A86]" : "font-medium text-[#6B7280] hover:bg-[#F6F7FB] hover:text-[#171717]"}`}
                    aria-current={selected ? "page" : undefined}
                  >
                    {selected && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-[#5B2A86]" />}
                    <span className={`grid size-5 shrink-0 place-items-center ${selected ? "text-[#5B2A86]" : "text-[#9CA3AF] group-hover/item:text-[#6B7280]"}`}><Icon size={16} /></span>
                    <span className="min-w-0 flex-1 truncate text-left">{mobileNavLabel(item)}</span>

                    {/* The count replaces the decorative chevron. A chevron told you nothing; this
                        tells you three people are standing at the counter unbilled. */}
                    {count > 0 && <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${attention!.urgent ? "bg-[#FDECEC] text-[#94302E]" : "bg-[#FEF5E6] text-[#8A5C00]"}`}>{count}</span>}
                  </button>;
                })}
              </div>
            </section>;
          })}
        </nav>
        {!sidebarCollapsed && <div className="shrink-0 border-t border-[#E8EAF0] p-3">
          <button type="button" onClick={() => setSidebarCollapsed(true)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium text-[#6B7280] transition hover:bg-[#F6F7FB] hover:text-[#171717]">
            <PanelLeftClose size={16} />
            <span>Collapse</span>
          </button>
        </div>}
      </aside>

      <div className={`min-w-0 transition-[padding] duration-300 ${sidebarCollapsed ? "lg:pl-14" : "lg:pl-56"}`}>
        <header className="workspace-topbar workspace-topnav sticky top-0 z-30 flex min-h-[56px] items-center justify-between gap-3 border-b border-[#E8EAF0] bg-white px-3 py-2 pt-[calc(.5rem+env(safe-area-inset-top))] sm:px-6 lg:min-h-[56px] lg:px-6 lg:py-3 lg:pt-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#2563EB] text-white shadow-[0_12px_30px_rgba(37,99,235,.18)] lg:hidden">
              {icons[active] ? (() => { const Icon = icons[active]; return <Icon size={20} />; })() : <BrandMark light />}
            </div>
            <div className="min-w-0 lg:hidden"><p className="hidden truncate text-[10px] font-bold uppercase tracking-[0.14em] text-[#5B2A86] sm:block sm:text-xs">{roleExperienceLabel(data.identity.role)}</p><h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">{dashboardTitle}</h1></div>
            <div className="hidden min-w-0 items-center gap-3 lg:flex">
              <h1 className="truncate text-xl font-bold tracking-tight text-[#171717]">{dashboardTitle}</h1>
              {active === "Overview" && <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${topbarRegister ? "bg-[#D1FAE5] text-[#047857]" : "bg-[#FEF3C7] text-[#B45309]"}`}>
                <span className={`size-1.5 rounded-full ${topbarRegister ? "bg-[#10B981]" : "bg-[#F59E0B]"}`} />
                {topbarRegister ? "Day Open" : "Day Not Open"}
              </span>}
            </div>
          </div>
          <div className="flex min-w-0 items-center justify-end gap-2 max-sm:max-w-[62%]">
            {data.identity.capabilities.hasMultipleBranches && <button type="button" onClick={() => setMobileBranchSheetOpen(true)} className={`workspace-mobile-branch-trigger flex h-10 min-w-0 max-w-28 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold transition lg:hidden ${appliedScope.tone.trigger}`} aria-label={`Change branch scope. ${branchContextLabel}`}>
              <MapPin size={15} className="shrink-0" />
              <span className="truncate sm:hidden">{isAllBranchesSelected ? "All" : selectedBranchIds.length}</span>
              <span className="hidden truncate sm:block">{appliedScope.label}</span>
            </button>}
            {/* A one-branch salon has nothing to pick between. Showing a picker there is asking
                someone to make a choice that does not exist. It appears by itself when they open a
                second branch. */}
            <div ref={branchMenuRef} className={`relative shrink-0 ${data.identity.capabilities.hasMultipleBranches ? "hidden lg:block" : "hidden"}`}>
              {/* The trigger wears the colour of whatever is in scope, so an owner can tell at a
                  glance whether they are looking at the whole business, only COCO, or one branch. */}
              <button type="button" onClick={toggleTopbarBranchSelector} className={`workspace-topbar-branch-trigger flex h-11 w-[12.5rem] items-center gap-2 rounded-lg border px-3 text-left transition xl:w-[14rem] ${appliedScope.tone.trigger}`} aria-haspopup="dialog" aria-expanded={branchMenuOpen}>
                <span className={`size-2 shrink-0 rounded-full ${appliedScope.tone.dot}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold">{appliedScope.label}</span>
                  <span className="block truncate text-[10px] font-semibold opacity-75">{appliedScope.detail}</span>
                </span>
                <ChevronRight size={14} className={`shrink-0 transition ${branchMenuOpen ? "rotate-90" : ""}`} />
              </button>
              {branchMenuOpen && <div className="workspace-branch-menu absolute right-0 top-full z-50 mt-3 flex w-[23rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_24px_70px_rgba(17,24,39,.18)]" role="dialog" aria-label="Select branches">
                <div className="border-b border-[#E5E7EB] px-4 pb-3 pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-[#111827]">Choose branches</p>
                      <p className="mt-0.5 text-xs text-[#6B7280]">Select one, multiple, or every branch.</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[#F3F4F6] px-2.5 py-1 text-[10px] font-bold text-[#4B5563]">{branchDraftSelectionCountLabel}</span>
                  </div>
                </div>
                {/* Same picker as mobile. Two implementations of one control is how they drifted
                    apart in the first place. */}
                <div className="min-h-0 flex-1 overflow-y-auto p-3" style={{ maxHeight: "min(30rem, calc(100vh - 15rem))" }}>
                  <BranchScopePicker
                    branches={data.identity.branches}
                    draftIds={branchDraftIds}
                    allSelected={isDraftAllBranchesSelected}
                    setDraftIds={(ids) => { setBranchDraftIds(ids); setBranchDraftScopeMode("selection"); }}
                    setAllSelected={(all) => setBranchDraftScopeMode(all ? "all" : "selection")}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-[#E5E7EB] bg-[#F9FAFB] px-4 py-3">
                  <p className="min-w-0 truncate text-xs font-semibold text-[#6B7280]">Changes apply after confirmation</p>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => { resetBranchDraft(); setBranchMenuOpen(false); setBranchSearch(""); }} className="rounded-lg border border-[#DDE2EA] bg-white px-3 py-2 text-xs font-bold text-[#4B5563] transition hover:border-[#C7CDD8] hover:bg-[#F3F4F6]">Cancel</button>
                    {/* An empty scope would show a workspace with no data and no obvious way back. */}
                    <button type="button" disabled={busy || !branchDraftDirty || (!isDraftAllBranchesSelected && !branchDraftIds.length)} onClick={() => void applyBranchDraft()} className="rounded-lg bg-[#5B2A86] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#4B1F72] disabled:cursor-not-allowed disabled:opacity-45">{busy ? "Applying..." : "Apply"}</button>
                  </div>
                </div>
              </div>}
            </div>
            <button type="button" onClick={() => navigate("Customers")} className="workspace-search-pill hidden h-11 min-w-[12rem] shrink-0 items-center gap-2 rounded-lg border border-[#E8EAF0] bg-[#F6F7FB] px-3 text-left text-[#6B7280] transition hover:border-[#5B2A86]/30 xl:flex" aria-label="Search customers and bookings" title="Search">
              <Search size={17} />
              <span className="min-w-0 flex-1 text-sm">Search customers...</span>
              <span className="rounded bg-[#E5E7EB] px-1.5 py-0.5 text-xs font-semibold text-[#6B7280]">Ctrl K</span>
            </button>
            {/* "New" means whatever the page you are on is for. On Bookings it books someone; on
                Billing it starts a sale. The chevron still opens everything else, so nothing is
                lost - but the common case is one click, not two. */}
            <div className="relative hidden lg:block">
              <div className="workspace-new-button workspace-create-button flex h-11 items-center rounded-lg text-sm font-semibold">
                <button type="button" onClick={primaryNewAction.onClick} className="flex h-full items-center gap-2 rounded-l-lg pl-4 pr-3 transition">
                  <span className="workspace-create-plus"><Plus size={15} /></span> {primaryNewAction.label}
                </button>
                <button type="button" onClick={() => setNewActionOpen((open) => !open)} className="flex h-full items-center rounded-r-lg border-l border-white/20 pl-2 pr-3 transition" aria-label="More create options">
                  <ChevronRight size={14} className={`transition ${newActionOpen ? "rotate-90" : ""}`} />
                </button>
              </div>
              {newActionOpen && <div className="workspace-new-menu absolute right-0 top-full z-50 mt-3 w-72 overflow-hidden rounded-[1.6rem] border border-[#DDE7EF] bg-white p-2 shadow-[0_24px_70px_rgba(23,50,121,.18)]">
                {newActionItems.map((item) => {
                  const Icon = item.icon;
                  return <button key={item.label} type="button" onClick={() => { setNewActionOpen(false); item.onClick(); }} className="workspace-new-menu-item flex w-full items-center gap-3 rounded-[1.25rem] p-3 text-left transition hover:bg-[#F7FAFC]">
                    <span className="grid size-10 place-items-center rounded-2xl bg-[#EAF7F7] text-[#1789AA]"><Icon size={17} /></span>
                    <span className="min-w-0"><span className="block text-sm font-extrabold text-[#1F2937]">{item.label}</span><span className="sr-only">{item.helper}</span></span>
                  </button>;
                })}
              </div>}
            </div>
            <button onClick={() => refresh("Workspace refreshed from PostgreSQL.")} className="workspace-icon-button hidden size-10 shrink-0 place-items-center rounded-lg border border-[#E8EAF0] bg-white text-[#6B7280] transition hover:border-[#5B2A86]/30 hover:text-[#5B2A86] sm:grid" aria-label="Refresh workspace"><RefreshCw size={16} /></button>
            <button type="button" onClick={cycleTheme} className="workspace-icon-button hidden size-10 shrink-0 place-items-center rounded-lg border border-[#E8EAF0] bg-white text-[#6B7280] transition hover:border-[#5B2A86]/30 hover:text-[#5B2A86] xl:grid" aria-label={themeLabel} title={themeLabel}><ThemeIcon size={17} /></button>
            <div className="relative">
              <button type="button" onClick={() => setProfileOpen((open) => !open)} className="flex h-11 items-center gap-2 rounded-lg border-l border-[#E8EAF0] bg-white py-1 pl-3 pr-2 transition hover:bg-[#F6F7FB]" aria-expanded={profileOpen} aria-label="Open profile menu">
                <Avatar name={data.identity.userName} dark />
                <span className="hidden min-w-0 text-left sm:block">
                  <span className="block max-w-32 truncate text-sm font-semibold text-[#171717]">{data.identity.userName}</span>
                  <span className="block text-xs text-[#6B7280]">{roleExperienceLabel(data.identity.role)}</span>
                </span>
                <ChevronRight size={15} className={`hidden text-[#6B7280] transition sm:block ${profileOpen ? "rotate-90" : ""}`} />
              </button>
              {profileOpen && <div className="absolute right-0 top-full z-50 mt-3 w-72 overflow-hidden rounded-[1.5rem] border border-[#E5E7EB] bg-white shadow-[0_24px_70px_rgba(23,50,121,.18)]">
                <div className="bg-[radial-gradient(circle_at_top_right,rgba(255,209,102,.26),transparent_48%),radial-gradient(circle_at_bottom_left,rgba(255,143,112,.22),transparent_46%),linear-gradient(135deg,#25262c,#3a3540)] p-4 text-white">
                  <div className="flex items-center gap-3">
                    <Avatar name={data.identity.userName} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold">{data.identity.userName}</p>
                      <p className="text-xs text-white/58">{roleExperienceLabel(data.identity.role)}</p>
                    </div>
                  </div>
                  <p className="mt-4 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#16B994]">Current scope</p>
                  <p className="mt-1 truncate text-sm font-bold">{branchContextLabel}</p>
                  <p className="truncate text-xs text-white/55">{branchContextDetail}</p>
                </div>
                <div className="p-3">
                  <button type="button" onClick={() => { setProfileOpen(false); navigate("Settings"); }} className="flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left text-sm font-bold text-[#1F2937] transition hover:bg-[#F7FAFC]">
                    Profile and settings <ChevronRight size={15} className="text-[#1789AA]" />
                  </button>
                  <form action="/api/v1/auth/logout" method="post" className="mt-2">
                    <button className="workspace-logout flex w-full items-center justify-center gap-2 rounded-2xl bg-[#173279] px-3 py-3 text-sm font-bold text-white transition hover:bg-[#16B994] hover:text-[#082143]"><LogOut size={16} /> Log out</button>
                  </form>
                </div>
              </div>}
            </div>
          </div>
        </header>

        <main className="workspace-main min-w-0 px-3 pb-[calc(6.75rem+env(safe-area-inset-bottom))] pt-4 sm:p-6 lg:px-6 lg:py-5 lg:pb-6">
          {notice && <Banner tone="success" text={notice} onClose={() => setNotice("")} />}
          {error && <Banner tone="error" text={error} onClose={() => setError("")} />}
          {/* The command bar row is gone. Every action it offered already existed on the page, in
              the sidebar, or under "New" - it was a slower copy of things you already had, taking a
              full row on every screen. That row is worth more to the calendar and the POS. */}
          {detail.customerId ? <CustomerProfileView customerId={detail.customerId} data={data} submit={submit} close={closeDetail} openAppointment={(id) => openDetail("appointmentId", id)} bookAppointment={(customerId) => openAppointment({ customerId, branchId: selectedBranchId === "all" ? undefined : selectedBranchId })} openSale={(customerId, branchId) => void openCustomerSale(customerId, branchId)} openInvoice={openInvoiceCenter} />
            : detail.serviceId ? <ServiceProfileView serviceId={detail.serviceId} data={data} close={closeDetail} openAppointment={(id) => openDetail("appointmentId", id)} />
            : <>
          {active === "Overview" && <Overview data={data} navigate={navigate} openInvoice={openInvoiceCenter} submit={submit} />}
          {active === "Appointments" && <AppointmentsView data={data} open={openAppointment} submit={submit} openDetail={(id) => openDetail("appointmentId", id)} openSale={(item) => void openAppointmentSale(item)} openInvoice={openInvoiceCenter} />}
          {active === "Customers" && <CustomersView data={data} open={() => setModal("customer")} submit={submit} openProfile={(id) => openDetail("customerId", id)} />}
          {active === "Point of sale" && <BillingWorkspace
            data={data}
            submit={submit}
            seed={posSeed}
            clearSeed={() => setPosSeed(null)}
            focusedInvoiceId={focusedInvoiceId}
            onSelectBranch={(branchId) => void changeBranchSelection([branchId], "selection")}
          />}
          {active === "Register" && <RegisterView data={data} submit={submit} openInvoice={openInvoiceCenter} />}
          {active === "Services" && <ServicesDomain data={data} openService={() => setModal("service")} submit={submit} openProfile={(id) => openDetail("serviceId", id)} />}
          {active === "Inventory" && <ProductsDomain data={data} openStock={() => setModal("stock")} submit={submit} />}
          {active === "Team" && <TeamView data={data} openStaff={() => setModal("staff")} openLeave={() => setModal("leave")} submit={submit} />}
          {active === "Memberships" && <OffersDomain data={data} submit={submit} />}
          {active === "Marketing" && <MarketingView data={data} submit={submit} />}
          {active === "Reviews" && <ReviewsView data={data} submit={submit} />}
          {active === "Reports" && <ReportsView data={data} open={() => setModal("expense")} focusedInvoiceId={focusedInvoiceId} />}
          {active === "Masters" && <MastersView data={data} submit={submit} scope="suppliers" />}
          {active === "Settings" && <SettingsView data={data} submit={submit} />}
          </>}
        </main>
      </div>

      <MobileBottomNav
        active={active}
        tabs={mobileTabs}
        moreItems={mobileMoreItems}
        moreOpen={moreOpen}
        setMoreOpen={setMoreOpen}
        navigate={navigate}
        userName={data.identity.userName}
        role={data.identity.role}
        tenantName={data.identity.tenantName}
        branchLabel={branchContextLabel}
        branchDetail={branchContextDetail}
        openBranchSelector={() => setMobileBranchSheetOpen(true)}
      />

      {mobileBranchSheetOpen && <MobileBranchSheet
        options={branchOptions}
        branchRecords={data.identity.branches}
        selectedValues={selectedBranchIds}
        isAllScope={isAllBranchesSelected}
        close={() => setMobileBranchSheetOpen(false)}
        onChange={async (branchIds, scopeMode) => {
          await changeBranchSelection(branchIds, scopeMode);
        }}
        tenantName={data.identity.tenantName}
      />}

      {modal && <OperationModal name={modal} data={data} busy={busy} error={error} bookingSeed={bookingSeed} close={() => { setModal(null); setError(""); }} submit={submit} />}
      {detail.appointmentId && <AppointmentDrawer appointmentId={detail.appointmentId} data={data} submit={submit} close={closeDetail} openCustomer={(id) => openDetail("customerId", id)} openService={(id) => openDetail("serviceId", id)} openSale={(appointment) => void openAppointmentDetailSale(appointment)} openInvoice={openInvoiceCenter} />}
    </div>
  );
}

function MobileBottomNav({
  active,
  tabs,
  moreItems,
  moreOpen,
  setMoreOpen,
  navigate,
  userName,
  role,
  tenantName,
  branchLabel,
  branchDetail,
  openBranchSelector,
}: {
  active: NavItem;
  tabs: NavItem[];
  moreItems: NavItem[];
  moreOpen: boolean;
  setMoreOpen: (open: boolean) => void;
  navigate: (item: NavItem) => void;
  userName: string;
  role: string;
  tenantName: string;
  branchLabel: string;
  branchDetail: string;
  openBranchSelector: () => void;
}) {
  const isMoreActive = !tabs.includes(active);
  return <>
    {moreOpen && <div className="fixed inset-0 z-40 flex items-end overflow-hidden bg-black/35 backdrop-blur-sm lg:hidden" onMouseDown={(event) => event.target === event.currentTarget && setMoreOpen(false)}>
      <section className="mobile-bottom-sheet flex w-full flex-col overflow-hidden rounded-t-[2rem] border border-white/10 bg-[#173279] text-white shadow-[0_-24px_70px_rgba(23,50,121,.38)]">
        <div className="mx-auto my-4 h-1.5 w-12 shrink-0 rounded-full bg-white/20" />
        <div className="mx-4 flex shrink-0 items-center justify-between gap-3 rounded-3xl border border-white/10 bg-white/[0.07] p-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={userName} />
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold">{userName}</p>
              <p className="truncate text-xs text-white/50">{roleExperienceLabel(role)} - {tenantName}</p>
            </div>
          </div>
          <button type="button" onClick={() => setMoreOpen(false)} className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10" aria-label="Close more menu"><X size={18} /></button>
        </div>
        <div className="mobile-bottom-sheet-body min-h-0 flex-1 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4">
        <button type="button" onClick={() => { setMoreOpen(false); openBranchSelector(); }} className="mb-3 flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.07] px-3 py-3 text-left">
          <span className="min-w-0">
            <span className="block text-xs font-extrabold uppercase tracking-[0.14em] text-white/45">Branch scope</span>
            <span className="mt-1 block truncate text-sm font-extrabold text-white">{branchLabel}</span>
            <span className="mt-0.5 block truncate text-xs text-white/50">{branchDetail}</span>
          </span>
          <ChevronRight size={17} className="shrink-0 text-[#16B994]" />
        </button>
        <div className="grid grid-cols-2 gap-2">
          {moreItems.map((item) => {
            const Icon = icons[item];
            return <button key={item} type="button" onClick={() => navigate(item)} className={`flex items-center gap-3 rounded-2xl border px-3 py-3 text-left text-sm font-extrabold transition ${active === item ? "border-[#16B994] bg-[#F7FAFC] text-[#111111]" : "border-white/10 bg-white/[0.07] text-white/78 hover:bg-white/12 hover:text-white"}`}>
              <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${active === item ? "bg-[#16B994] text-[#111111]" : "bg-white/8 text-[#16B994]"}`}><Icon size={17} /></span>
              <span className="min-w-0 truncate">{mobileNavLabel(item)}</span>
            </button>;
          })}
        </div>
        </div>
      </section>
    </div>}
    <nav className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-[#16B994]/25 bg-[#173279]/96 px-2 pb-[calc(.55rem+env(safe-area-inset-bottom))] pt-2 text-white shadow-[0_-12px_40px_rgba(23,50,121,.25)] backdrop-blur-xl lg:hidden" aria-label="Mobile workspace navigation">
      <div className="mx-auto grid max-w-lg grid-cols-5 gap-1">
        {tabs.map((item) => {
          const Icon = icons[item];
          const selected = active === item;
          return <button key={item} type="button" onClick={() => navigate(item)} className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-extrabold transition ${selected ? "bg-[#F7FAFC] text-[#111111] shadow-[0_8px_22px_rgba(0,0,0,.2)]" : "text-white/62 hover:bg-white/10 hover:text-white"}`} aria-current={selected ? "page" : undefined}>
            <span className={`grid size-8 place-items-center rounded-xl ${selected ? "bg-[#16B994] text-[#111111]" : "bg-white/8 text-[#16B994]"}`}><Icon size={16} /></span>
            <span className="max-w-full truncate">{mobileNavLabel(item)}</span>
          </button>;
        })}
        <button type="button" onClick={() => setMoreOpen(!moreOpen)} className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-extrabold transition ${isMoreActive || moreOpen ? "bg-[#F7FAFC] text-[#111111] shadow-[0_8px_22px_rgba(0,0,0,.2)]" : "text-white/62 hover:bg-white/10 hover:text-white"}`} aria-expanded={moreOpen} aria-label="Open more modules">
          <span className={`grid size-8 place-items-center rounded-xl ${isMoreActive || moreOpen ? "bg-[#16B994] text-[#111111]" : "bg-white/8 text-[#16B994]"}`}><Menu size={16} /></span>
          <span>More</span>
        </button>
      </div>
    </nav>
  </>;
}

function MobileBranchSheet({
  options,
  branchRecords,
  selectedValues,
  isAllScope,
  close,
  onChange,
  tenantName,
}: {
  options: WorkspaceOption[];
  branchRecords: WorkspaceData["identity"]["branches"];
  selectedValues: string[];
  isAllScope: boolean;
  close: () => void;
  onChange: (values: string[], scopeMode: "all" | "selection") => Promise<void> | void;
  tenantName: string;
}) {
  const branches = options.filter((option) => option.value !== "all");
  const branchIds = branches.map((branch) => branch.value);
  const [draftValues, setDraftValues] = useState<string[]>(selectedValues.length ? selectedValues : branchIds);
  const [draftScope, setDraftScope] = useState<"all" | "selection">(isAllScope ? "all" : "selection");
  const allSelected = draftScope === "all";
  const draftDirty = draftScope !== (isAllScope ? "all" : "selection")
    || draftValues.length !== selectedValues.length
    || draftValues.some((id) => !selectedValues.includes(id));

  async function applySelection() {
    // A scope with no branches would show an empty workspace with no way back, so fall back to all.
    const values = draftScope === "all" || !draftValues.length ? branchIds : draftValues;
    await onChange(values, draftValues.length && draftScope !== "all" ? "selection" : "all");
  }

  return <div className="fixed inset-0 z-50 flex items-end overflow-hidden bg-black/35 backdrop-blur-sm lg:hidden" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <section className="mobile-bottom-sheet flex w-full flex-col overflow-hidden rounded-t-[2rem] border border-white/10 bg-[#fbfdff] shadow-[0_-24px_70px_rgba(23,50,121,.28)]">
      <div className="mx-auto my-4 h-1.5 w-12 shrink-0 rounded-full bg-black/15" />
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#E5E7EB] px-5 pb-4">
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#1789AA]">Branch scope</p>
          <h3 className="mt-1 text-2xl font-extrabold tracking-tight text-[#1F2937]">Select workspace</h3>
          <p className="mt-1 truncate text-sm font-semibold text-[#737174]">{tenantName}</p>
        </div>
        <button type="button" onClick={close} className="grid size-10 shrink-0 place-items-center rounded-full bg-[#F7FAFC] text-[#173279]" aria-label="Close branch selector"><X size={18} /></button>
      </div>
      <div className="mobile-bottom-sheet-body min-h-0 flex-1 space-y-3 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5">
        <BranchScopePicker
          branches={branchRecords}
          draftIds={draftValues}
          allSelected={allSelected}
          setDraftIds={(ids) => { setDraftValues(ids); setDraftScope("selection"); }}
          setAllSelected={(all) => setDraftScope(all ? "all" : "selection")}
        />
        <div className="sticky bottom-0 grid grid-cols-[1fr_1.3fr] gap-3 bg-[#fbfdff] pt-2">
          <button type="button" onClick={close} className="w-full rounded-[1.25rem] border border-[#E5E7EB] bg-white px-4 py-3 text-sm font-extrabold text-[#6B7280] shadow-sm">Cancel</button>
          <button type="button" disabled={!draftDirty || (!allSelected && !draftValues.length)} onClick={() => void applySelection()} className="w-full rounded-[1.25rem] bg-[#5B2A86] px-4 py-3 text-sm font-extrabold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-45">Apply selection</button>
        </div>
      </div>
    </section>
  </div>;
}

function WorkspaceCommandBar({
  active,
  data,
  navigate,
  openAppointment,
  openInvoice,
  openCustomer,
  openService,
  openStock,
  openExpense,
  openStaff,
  openLeave,
}: {
  active: NavItem;
  data: WorkspaceData;
  navigate: (item: NavItem) => void;
  openAppointment: (seed?: BookingSeed | React.SyntheticEvent) => void;
  openInvoice: (invoiceId?: string) => void;
  openCustomer: () => void;
  openService: () => void;
  openStock: () => void;
  openExpense: () => void;
  openStaff: () => void;
  openLeave: () => void;
}) {
  const activeRegister = data.registerSessions.find((session) => session.status === "OPEN");
  const lowStock = data.inventory.filter((item) => item.quantity <= item.reorderLevel).length;
  const dueInvoices = data.recentInvoices.filter((invoice) => invoice.total > invoice.paid).length;
  const commands = workspaceCommands(active, data, {
    navigate,
    openAppointment,
    openInvoice,
    openCustomer,
    openService,
    openStock,
    openExpense,
    openStaff,
    openLeave,
  }).filter((item) => !item.module || canOpen(data.identity.role, item.module)).slice(0, 4);
  const [dayLabel, setDayLabel] = useState("Today");
  useEffect(() => {
    setDayLabel(new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date()));
  }, []);
  const signals = active === "Overview" ? [
    { label: activeRegister ? "Day Open" : "Day Closed", value: "", tone: activeRegister ? "green" as const : "amber" as const },
    ...(dueInvoices ? [{ label: "Due Invoices", value: String(dueInvoices), tone: "amber" as const }] : []),
    ...(lowStock ? [{ label: "Low Stock", value: String(lowStock), tone: "rose" as const }] : []),
  ] : [];
  return <section className="workspace-command-bar mb-5 border-0 bg-transparent p-0 shadow-none">
    <div className="workspace-command-shell flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div className="workspace-command-heading min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#6B7280]">{active === "Overview" ? "Today" : dayLabel}</p>
        <h2 className="mt-1 truncate text-lg font-semibold tracking-tight text-[#171717]">{active === "Overview" ? "Actions" : workspaceCommandTitle(active)}</h2>
      </div>
      <div className="workspace-command-actions flex min-w-0 flex-wrap gap-2">
        {commands.map((command) => {
          const Icon = command.icon;
          return <button key={command.label} type="button" onClick={command.onClick} className={`workspace-command-action workspace-command-button group flex min-h-0 items-center gap-2 rounded-full border px-4 py-2 text-left text-sm font-semibold transition ${command.primary ? "workspace-command-action-primary border-[#5B2A86] bg-[#5B2A86] text-white" : "workspace-command-action-secondary border-[#E8EAF0] bg-white text-[#171717] hover:bg-[#F6F7FB]"}`}>
            <span className="workspace-command-icon grid size-4 shrink-0 place-items-center"><Icon size={15} /></span>
            <span className="min-w-0">
              <span className="block truncate">{command.label}</span>
              <span className="sr-only">{command.helper}</span>
            </span>
          </button>;
        })}
      </div>
      {signals.length > 0 && <div className="workspace-command-signals flex flex-wrap gap-2">
        <span className="workspace-command-group-label">Status</span>
        {signals.map((signal) => <button key={signal.label} type="button" onClick={() => signal.label === "Low Stock" ? navigate("Inventory") : signal.label === "Due Invoices" ? openInvoice() : navigate("Register")} className={`workspace-status-pill flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${signal.tone === "green" ? "border-[#10B981] bg-[#D1FAE5] text-[#10B981]" : signal.tone === "rose" ? "border-[#EF4444] bg-[#FEE2E2] text-[#EF4444]" : "border-[#F59E0B] bg-[#FEF3C7] text-[#F59E0B]"}`}><span>{signal.label}</span>{signal.value && <span>{signal.value}</span>}</button>)}
      </div>}
    </div>
  </section>;
}

function workspaceCommandTitle(active: NavItem) {
  const titles: Record<NavItem, string> = {
    Overview: "Quick actions",
    Appointments: "Bookings",
    Customers: "Customers",
    "Point of sale": "Billing",
    Register: "Day Close",
    Services: "Services",
    Inventory: "Products",
    Masters: "Suppliers",
    Team: "Team",
    Memberships: "Offers",
    Marketing: "Marketing",
    Reviews: "Reviews",
    Reports: "Reports",
    Settings: "Settings",
  };
  return titles[active];
}

function workspaceCommands(active: NavItem, data: WorkspaceData, handlers: {
  navigate: (item: NavItem) => void;
  openAppointment: (seed?: BookingSeed | React.SyntheticEvent) => void;
  openInvoice: (invoiceId?: string) => void;
  openCustomer: () => void;
  openService: () => void;
  openStock: () => void;
  openExpense: () => void;
  openStaff: () => void;
  openLeave: () => void;
}): WorkspaceCommandItem[] {
  const activeRegister = data.registerSessions.find((session) => session.status === "OPEN");
  const defaults: WorkspaceCommandItem[] = [
    { label: "New Booking", helper: "Book visit", icon: CalendarDays, onClick: () => handlers.openAppointment(), module: "Appointments", primary: true },
    { label: "New Bill", helper: "Billing checkout", icon: CreditCard, onClick: () => handlers.navigate("Point of sale"), module: "Point of sale" },
    { label: "Add Customer", helper: "Quick CRM", icon: Users, onClick: handlers.openCustomer, module: "Customers" },
    { label: activeRegister ? "Day Close" : "Open Day", helper: activeRegister ? "Counter open" : "Start counter", icon: WalletCards, onClick: () => handlers.navigate("Register"), module: "Register" },
  ];
  const map: Record<NavItem, WorkspaceCommandItem[]> = {
    Overview: defaults,
    Masters: [
      { label: "Stock", helper: "Products using these", icon: Boxes, onClick: () => handlers.navigate("Inventory"), module: "Inventory" },
      { label: "Services", helper: "Categories and prices", icon: Sparkles, onClick: () => handlers.navigate("Services"), module: "Services" },
      defaults[0],
    ],
    Appointments: [
      defaults[0],
      { label: "Add customer", helper: "Before booking", icon: Users, onClick: handlers.openCustomer, module: "Customers" },
      { label: "Billing", helper: "Checkout visit", icon: CreditCard, onClick: () => handlers.navigate("Point of sale"), module: "Point of sale" },
      { label: "Customers", helper: "Find profile", icon: Search, onClick: () => handlers.navigate("Customers"), module: "Customers" },
    ],
    Customers: [
      { label: "Add customer", helper: "Name + mobile", icon: Users, onClick: handlers.openCustomer, primary: true, module: "Customers" },
      defaults[0],
      defaults[1],
      { label: "Invoices", helper: "Customer bills", icon: ReceiptText, onClick: () => handlers.openInvoice(), module: "Reports" },
    ],
    "Point of sale": [
      { label: "Select customer", helper: "Search or add", icon: Users, onClick: handlers.openCustomer, primary: true, module: "Customers" },
      { label: "Bookings", helper: "Checkout visit", icon: CalendarDays, onClick: () => handlers.navigate("Appointments"), module: "Appointments" },
      { label: "Invoices", helper: "Open bill", icon: ReceiptText, onClick: () => handlers.openInvoice(), module: "Reports" },
      { label: "Day Close", helper: "Counter state", icon: WalletCards, onClick: () => handlers.navigate("Register"), module: "Register" },
    ],
    Register: [
      { label: "New bill", helper: "Record payment", icon: CreditCard, onClick: () => handlers.navigate("Point of sale"), primary: true, module: "Point of sale" },
      { label: "Add expense", helper: "Daily spend", icon: ReceiptText, onClick: handlers.openExpense, module: "Reports" },
      { label: "Invoices", helper: "Source rows", icon: ClipboardList, onClick: () => handlers.openInvoice(), module: "Reports" },
      { label: "Reports", helper: "Reconcile", icon: BarChart3, onClick: () => handlers.navigate("Reports"), module: "Reports" },
    ],
    Services: [
      { label: "Add service", helper: "Master item", icon: Sparkles, onClick: handlers.openService, primary: true, module: "Services" },
      { label: "Bookings", helper: "Booking use", icon: CalendarDays, onClick: () => handlers.navigate("Appointments"), module: "Appointments" },
      { label: "Billing", helper: "Sale use", icon: CreditCard, onClick: () => handlers.navigate("Point of sale"), module: "Point of sale" },
      { label: "Reports", helper: "Top services", icon: BarChart3, onClick: () => handlers.navigate("Reports"), module: "Reports" },
    ],
    Inventory: [
      { label: "Stock entry", helper: "Movement", icon: PackagePlus, onClick: handlers.openStock, primary: true, module: "Inventory" },
      { label: "Billing", helper: "Stock sale", icon: CreditCard, onClick: () => handlers.navigate("Point of sale"), module: "Point of sale" },
      { label: "Reports", helper: "Stock ledger", icon: BarChart3, onClick: () => handlers.navigate("Reports"), module: "Reports" },
      { label: "Add expense", helper: "Purchase cost", icon: ReceiptText, onClick: handlers.openExpense, module: "Reports" },
    ],
    Team: [
      { label: "Add staff", helper: "Team profile", icon: UserRound, onClick: handlers.openStaff, primary: true, module: "Team" },
      { label: "Record leave", helper: "Availability", icon: Clock, onClick: handlers.openLeave, module: "Team" },
      { label: "Bookings", helper: "Staff calendar", icon: CalendarDays, onClick: () => handlers.navigate("Appointments"), module: "Appointments" },
      { label: "Payroll", helper: "Earnings", icon: BarChart3, onClick: () => handlers.navigate("Team"), module: "Team" },
    ],
    Memberships: [
      { label: "New bill", helper: "Redeem offers", icon: CreditCard, onClick: () => handlers.navigate("Point of sale"), primary: true, module: "Point of sale" },
      { label: "Customers", helper: "Balances", icon: Users, onClick: () => handlers.navigate("Customers"), module: "Customers" },
      { label: "Reports", helper: "Benefit usage", icon: BarChart3, onClick: () => handlers.navigate("Reports"), module: "Reports" },
      defaults[0],
    ],
    Marketing: [
      { label: "Customers", helper: "Segments", icon: Users, onClick: () => handlers.navigate("Customers"), primary: true, module: "Customers" },
      { label: "Settings", helper: "Provider setup", icon: Settings, onClick: () => handlers.navigate("Settings"), module: "Settings" },
      { label: "Reports", helper: "Campaign view", icon: BarChart3, onClick: () => handlers.navigate("Reports"), module: "Reports" },
      defaults[0],
    ],
    Reviews: [
      { label: "Bookings", helper: "Verified visits", icon: CalendarDays, onClick: () => handlers.navigate("Appointments"), primary: true, module: "Appointments" },
      { label: "Customers", helper: "Guest history", icon: Users, onClick: () => handlers.navigate("Customers"), module: "Customers" },
      { label: "Reports", helper: "Rating trends", icon: BarChart3, onClick: () => handlers.navigate("Reports"), module: "Reports" },
      { label: "Settings", helper: "Review rules", icon: Settings, onClick: () => handlers.navigate("Settings"), module: "Settings" },
    ],
    Reports: [
      { label: "Invoices", helper: "Open center", icon: ReceiptText, onClick: () => handlers.openInvoice(), primary: true, module: "Reports" },
      { label: "Day Close", helper: "Day closing", icon: WalletCards, onClick: () => handlers.navigate("Register"), module: "Register" },
      { label: "Add expense", helper: "Cost entry", icon: ReceiptText, onClick: handlers.openExpense, module: "Reports" },
      { label: "Stock", helper: "Stock reports", icon: Boxes, onClick: () => handlers.navigate("Inventory"), module: "Inventory" },
    ],
    Settings: [
      { label: "Services & Prices", helper: "Catalogue rules", icon: Sparkles, onClick: () => handlers.navigate("Services"), primary: true, module: "Services" },
      { label: "Team", helper: "Access roles", icon: UserRound, onClick: () => handlers.navigate("Team"), module: "Team" },
      { label: "Day Close", helper: "Counter rules", icon: WalletCards, onClick: () => handlers.navigate("Register"), module: "Register" },
      { label: "Reports", helper: "Audit view", icon: BarChart3, onClick: () => handlers.navigate("Reports"), module: "Reports" },
    ],
  };
  return map[active];
}

function ModuleExperienceHeader({ active, data }: { active: NavItem; data: WorkspaceData }) {
  const config = moduleExperienceConfig(active, data);
  const Icon = icons[active];
  const scope = data.identity.scope === "branch" ? data.identity.branchName : data.identity.scope === "multi" ? data.identity.branchName : "All branches";
  return <section className="module-context-panel dashboard-fade-slide-up mb-4 hidden overflow-hidden rounded-[1.5rem] border border-[#E9DFD4] bg-white/88 px-4 py-3 shadow-[0_14px_38px_rgba(60,54,48,.08)] backdrop-blur md:block">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#25262c] text-[#FFD166] shadow-[0_10px_24px_rgba(37,38,44,.14)]"><Icon size={18} /></span>
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#1789AA]">{config.eyebrow}</p>
          <h2 className="truncate text-lg font-extrabold tracking-tight text-[#1F2937]">{mobileNavLabel(active)}</h2>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        <span className="rounded-full bg-[#F7FAFC] px-3 py-2 text-xs font-extrabold text-[#737174]">{scope}</span>
        {config.signals.slice(0, 3).map((signal) => <span key={signal.label} className="rounded-full border border-black/6 bg-white px-3 py-2 text-xs font-extrabold text-[#25262C] shadow-sm"><span className="text-[#737174]">{signal.label}: </span>{signal.value}</span>)}
      </div>
    </div>
  </section>;
}

function moduleExperienceConfig(active: NavItem, data: WorkspaceData): ModuleExperienceConfig {
  const lowStock = data.inventory.filter((item) => item.quantity <= item.reorderLevel).length;
  const warnings = data.customers.filter((customer) => customer.allergies || customer.notes).length;
  const activeRegister = data.registerSessions.find((session) => session.status === "OPEN");
  const onlineServices = data.services.filter((service) => service.onlineBooking && service.isActive).length;
  const activeMemberships = data.memberships.filter((item) => item.isActive).length;
  const pendingReviews = data.reviews.filter((review) => review.status === "PENDING").length;
  const avgRating = data.reviews.length ? (data.reviews.reduce((sum, review) => sum + review.rating, 0) / data.reviews.length).toFixed(1) : "0.0";
  const base: Record<NavItem, ModuleExperienceConfig> = {
    Overview: { eyebrow: "Home", title: "Daily command center", summary: "Track the most important salon activity.", focus: "Overview is optimized separately.", signals: [] },
    Masters: {
      eyebrow: "Suppliers",
      title: "Who you buy from, and the brands they bring you.",
      summary: "Vendors, the brands each supplies, and the expense heads your purchases post against. Product and service setup now live on their own screens.",
      focus: "Vendors and expense heads are archived, never deleted, because past purchases still point at them.",
      signals: [
        { label: "Vendors", value: String(data.vendors.length), tone: "blue" },
        { label: "Products", value: String(data.inventory.length), tone: "violet" },
      ],
    },
    Appointments: {
      eyebrow: "Queue and calendar",
      title: "Manage today's customer flow without losing context.",
      summary: "List-first operations help receptionists and stylists see who is coming now, what is next, and which bookings need action.",
      focus: "Best flow: search customer, book services, check in, then hand off to billing.",
      signals: [
        { label: "Today booked", value: String(data.metrics.todayAppointments), tone: "blue" },
        { label: "Completed", value: String(data.metrics.completedAppointments), tone: "green" },
        { label: "Waitlist", value: String(data.appointments.filter((item) => item.status === "WAITLISTED").length), tone: "amber" },
        { label: "No-show/cancel", value: String(data.appointments.filter((item) => ["NO_SHOW", "CANCELLED"].includes(item.status)).length), tone: "rose" },
      ],
    },
    Customers: {
      eyebrow: "CRM",
      title: "Customer memory, balances, warnings, and history.",
      summary: "Counter staff should find a profile by name or mobile, see allergy/warning context, then book or bill immediately.",
      focus: "Best flow: search mobile first, avoid duplicate profiles, then use profile quick actions.",
      signals: [
        { label: "Profiles", value: String(data.metrics.customerCount), tone: "blue" },
        { label: "Warnings", value: String(warnings), tone: warnings ? "amber" : "green" },
        { label: "With rewards", value: String(data.customers.filter((customer) => customer.loyalty > 0).length), tone: "violet" },
        { label: "Spend tracked", value: inr.format(data.customers.reduce((sum, customer) => sum + customer.spend, 0)), tone: "green" },
      ],
    },
    "Point of sale": {
      eyebrow: "Billing",
      title: "Build sale, apply benefits, record offline payment, open invoice.",
      summary: "Billing should remain branch-specific and make payment mismatch, stock limits, invoice mode, and customer balances obvious before checkout.",
      focus: "Best flow: appointment handoff or walk-in sale, confirm cart, record payment, open invoice.",
      signals: [
        { label: "Today revenue", value: inr.format(data.metrics.todayRevenue), tone: "green" },
        { label: "Avg ticket", value: inr.format(data.metrics.averageTicket), tone: "violet" },
        { label: "Recent invoices", value: String(data.recentInvoices.length), tone: "blue" },
        { label: "Pending due", value: inr.format(data.recentInvoices.reduce((sum, invoice) => sum + Math.max(0, invoice.total - invoice.paid), 0)), tone: "amber" },
      ],
    },
    Register: {
      eyebrow: "Day closing",
      title: "Open counter, track payments, close with variance.",
      summary: "Owners, managers, receptionists, and accountants need one reliable branch closing view for sales, refunds, GST, tips, expenses, and cash variance.",
      focus: "Best flow: open the day before sales, reconcile payment split, close at day end.",
      signals: [
        { label: "Day Close", value: activeRegister ? "Open" : "Not opened", tone: activeRegister ? "green" : "amber" },
        { label: "Cash sessions", value: String(data.registerSessions.length), tone: "blue" },
        { label: "Month GST", value: inr.format(data.metrics.monthTax), tone: "violet" },
        { label: "Expenses", value: inr.format(data.metrics.monthExpenses), tone: "rose" },
      ],
    },
    Services: {
      eyebrow: "Service master",
      title: "Catalogue clarity controls booking, billing, staff skills, and pricing.",
      summary: "Salon teams need category-led services with price, duration, GST, branch overrides, online visibility, and active status visible at a glance.",
      focus: "Best flow: maintain categories first, then service pricing and branch overrides.",
      signals: [
        { label: "Services", value: String(data.services.length), tone: "blue" },
        { label: "Categories", value: String(data.serviceCategories.length), tone: "violet" },
        { label: "Online booking", value: String(onlineServices), tone: "green" },
        { label: "Archived", value: String(data.services.filter((service) => !service.isActive).length), tone: "amber" },
      ],
    },
    Inventory: {
      eyebrow: "Stock control",
      title: "Products, purchases, movement history, and low-stock attention.",
      summary: "Stock should make daily counters simple: know what is low, what moved, what was purchased, and what value is sitting in branch.",
      focus: "Best flow: product master, purchase entry, stock movement, stocktake, then reports.",
      signals: [
        { label: "Products", value: String(data.inventory.length), tone: "blue" },
        { label: "Low stock", value: String(lowStock), tone: lowStock ? "amber" : "green" },
        { label: "Vendors", value: String(data.vendors.length), tone: "violet" },
        { label: "Stock value", value: inr.format(data.inventory.reduce((sum, item) => sum + item.stockValue, 0)), tone: "green" },
      ],
    },
    Team: {
      eyebrow: "Staff operations",
      title: "Attendance, shifts, leave, commissions, and payroll inputs.",
      summary: "Team screens should make owner/manager work clear while keeping stylist self-service limited and simple.",
      focus: "Best flow: confirm shift, clock-in/out, approve corrections, export payroll summary.",
      signals: [
        { label: "Present", value: String(data.metrics.staffPresent), tone: "green" },
        { label: "Absent", value: String(data.metrics.staffAbsent), tone: data.metrics.staffAbsent ? "rose" : "green" },
        { label: "Late", value: String(data.metrics.staffLate), tone: data.metrics.staffLate ? "amber" : "green" },
        { label: "Corrections", value: String(data.metrics.pendingAttendanceCorrections), tone: data.metrics.pendingAttendanceCorrections ? "violet" : "green" },
      ],
    },
    Memberships: {
      eyebrow: "Benefits",
      title: "Offers, packages, gift cards, wallet, and rewards.",
      summary: "Offers must be visible in customer profile and billing so staff can explain balances and redemption before checkout.",
      focus: "Best flow: configure master rules, assign offers, redeem in billing, verify customer history.",
      signals: [
        { label: "Offers", value: String(activeMemberships), tone: "green" },
        { label: "Packages", value: String(data.packages.filter((item) => item.isActive).length), tone: "blue" },
        { label: "Gift cards", value: String(data.giftCards.filter((item) => item.status === "ACTIVE").length), tone: "violet" },
        { label: "Reward rules", value: String(data.rewardRules.length), tone: "amber" },
      ],
    },
    Marketing: {
      eyebrow: "Setup required",
      title: "Templates and campaigns are prepared, delivery waits for providers.",
      summary: "The UI should never fake WhatsApp, SMS, or email success. Drafts are allowed; real delivery requires credentials and consent rules.",
      focus: "Best flow: build templates now, connect providers later, then enable sending.",
      signals: [
        { label: "Campaign drafts", value: String(data.campaigns.length), tone: "blue" },
        { label: "Sent", value: String(data.campaigns.reduce((sum, campaign) => sum + campaign.sent, 0)), tone: "green" },
        { label: "Failed", value: String(data.campaigns.reduce((sum, campaign) => sum + campaign.failed, 0)), tone: "rose" },
        { label: "Provider", value: "Setup required", tone: "amber" },
      ],
    },
    Reviews: {
      eyebrow: "Reputation",
      title: "Verified visit review inbox and response control.",
      summary: "Salon owners need filters, reply visibility, and moderation context before marketplace review enhancement.",
      focus: "Best flow: filter by rating/status, reply where supported, report issues to platform.",
      signals: [
        { label: "Reviews", value: String(data.reviews.length), tone: "blue" },
        { label: "Average", value: `${avgRating}/5`, tone: "green" },
        { label: "Pending", value: String(pendingReviews), tone: pendingReviews ? "amber" : "green" },
        { label: "Replied", value: String(data.reviews.filter((review) => review.salonReply).length), tone: "violet" },
      ],
    },
    Reports: {
      eyebrow: "Business analysis",
      title: "Numbers must reconcile back to actual invoices and operations.",
      summary: "Reports should prioritize sales, GST, payments, refunds, expenses, stock movement, commissions, benefits, and branch comparison.",
      focus: "Best flow: filter, inspect source rows, export CSV, then reconcile with register closing.",
      signals: [
        { label: "Month revenue", value: inr.format(data.metrics.monthRevenue), tone: "green" },
        { label: "Month GST", value: inr.format(data.metrics.monthTax), tone: "violet" },
        { label: "Expenses", value: inr.format(data.metrics.monthExpenses), tone: "rose" },
        { label: "Invoices", value: String(data.recentInvoices.length), tone: "blue" },
      ],
    },
    Settings: {
      eyebrow: "Configuration",
      title: "Business rules should be readable before they are editable.",
      summary: "Settings need clear sections for business, branch hours, policies, tax/invoices, roles, integrations, security, and audit history.",
      focus: "Best flow: show current setup, expose editable sections only where backend support exists.",
      signals: [
        { label: "Branches", value: String(data.identity.branches.length), tone: "blue" },
        { label: "Role", value: title(data.identity.role), tone: "violet" },
        { label: "Audit logs", value: String(data.auditLogs.length), tone: "green" },
        { label: "Scope", value: data.identity.scope === "branch" ? "Branch" : data.identity.scope === "multi" ? data.identity.branchName : "All branches", tone: "amber" },
      ],
    },
  };
  return base[active];
}
