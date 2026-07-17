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
import { calculateTaxLine, displayPrice } from "@/lib/billing";
import type { AppointmentDetail, CustomerProfile, ServiceProfile, WorkspaceData } from "@/lib/operations-types";

import { PosSeed, SubmitFn } from "@/components/workspace/contracts";
import { CustomerPicker } from "@/components/workspace/customer/customer-picker";
import type { CustomerChoice } from "@/components/workspace/customer/types";
import { deleteHeldSale, getBillingAppointment, getBillingCustomerProfile, getHeldSales } from "@/components/workspace/modules/billing-api";
import type { CartLine, HeldSale, MobilePosSheetName, SalePaymentDraft } from "@/components/workspace/modules/billing-types";
import { Card, Empty, Info, SlotMessage, Status, Summary, SummaryTile, WorkspaceSelect, canCheckoutAppointmentStatus, formatDateTime, formatTime, title } from "@/components/workspace/shared-ui";

export function PosViewV2({ data, submit, openInvoice, seed, clearSeed }: { data: WorkspaceData; submit: SubmitFn; openInvoice: (invoiceId?: string) => void; seed?: PosSeed | null; clearSeed?: () => void }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<CustomerChoice | null>(null);
  const [appointmentId, setAppointmentId] = useState("");
  const [linkedAppointment, setLinkedAppointment] = useState<AppointmentDetail | null>(null);
  const [appointmentLoading, setAppointmentLoading] = useState(false);
  const [tab, setTab] = useState<"SERVICE" | "PRODUCT">("SERVICE");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [payments, setPayments] = useState<SalePaymentDraft[]>([{ method: "UPI", amount: 0 }]);
  const [taxMode, setTaxMode] = useState<"GST" | "NON_GST">("GST");
  const [tip, setTip] = useState(0);
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
  const [heldLoading, setHeldLoading] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState("");
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
  const [profileError, setProfileError] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [mobileSheet, setMobileSheet] = useState<MobilePosSheetName>(null);
  const branchId = data.identity.branchId || "";
  const totals = useMemo(() => cart.reduce((result, line) => {
    const base = line.price * line.quantity;
    const lineDiscount = line.packagePurchaseId ? base : line.discount;
    const amounts = calculateTaxLine({ quantity: line.quantity, unitPrice: line.price, discount: lineDiscount, taxRate: line.taxRate, priceTaxMode: line.priceTaxMode, invoiceTaxMode: taxMode });
    return {
      subtotal: result.subtotal + amounts.subtotal,
      discount: result.discount + amounts.discount,
      tax: result.tax + amounts.tax,
      includedTax: result.includedTax + (taxMode === "GST" && line.priceTaxMode === "INCLUSIVE" ? amounts.tax : 0),
      addedTax: result.addedTax + (taxMode === "GST" && line.priceTaxMode === "EXCLUSIVE" ? amounts.tax : 0),
      total: result.total + amounts.total,
    };
  }, { subtotal: 0, discount: 0, tax: 0, includedTax: 0, addedTax: 0, total: 0 }), [cart, taxMode]);
  const grandTotal = totals.total + tip;
  const paymentTotal = Number(payments.reduce((sum, item) => sum + Number(item.amount || 0), 0).toFixed(2));
  const balanceDue = Number((grandTotal - paymentTotal).toFixed(2));
  const categories = tab === "SERVICE" ? data.serviceCategories.map((item) => item.name) : [...new Set(data.inventory.map((item) => item.category))];
  const services = data.services.filter((item) => item.isActive && (!category || item.category === category) && `${item.name} ${item.category}`.toLowerCase().includes(query.toLowerCase()));
  const products = data.inventory.filter((item) => (!category || item.category === category) && `${item.name} ${item.sku} ${item.category}`.toLowerCase().includes(query.toLowerCase()));
  const activePackages = customerProfile?.packages.filter((item) => new Date(item.expiresAt) >= new Date()) ?? [];
  const activeGiftCards = customerProfile?.giftCards.filter((item) => item.status === "ACTIVE" && item.balance > 0) ?? [];
  const customerChoices = useMemo(() => customer ? [customer, ...data.customers.filter((item) => item.id !== customer.id)] : data.customers, [customer, data.customers]);
  const saleWarnings = [
    !customer ? "Select or add a customer before checkout." : "",
    !cart.length ? "Add at least one service or product." : "",
    Math.abs(balanceDue) > 0.01 ? `Payment mismatch: ${balanceDue > 0 ? inr.format(balanceDue) + " remaining" : inr.format(Math.abs(balanceDue)) + " overpaid"}.` : "",
  ].filter(Boolean);
  const checkoutBlocker = checkoutError || saleWarnings[0] || "";
  const appointmentOptions = [
    { value: "", label: "Walk-in or counter sale" },
    ...data.appointments
      .filter((item) => !item.invoice && canCheckoutAppointmentStatus(item.status))
      .map((item) => ({ value: item.id, label: `${formatTime(item.startsAt)} - ${item.customer}`, description: item.service })),
  ];
  const staffAttributionOptions = [{ value: "", label: "Use appointment/default staff" }, ...data.staff.map((member) => ({ value: member.id, label: member.name, description: member.role }))];
  const paymentMethodOptions = (["UPI", "CARD", "CASH", "WALLET", "LOYALTY", "GIFT_CARD"] as const).map((method) => ({ value: method, label: title(method) }));

  const loadHeldSales = useCallback(async () => {
    if (!branchId) {
      setHeldSales([]);
      return;
    }
    setHeldLoading(true);
    try {
      setHeldSales(await getHeldSales(branchId));
    } catch (draftError) {
      setCheckoutError(draftError instanceof Error ? draftError.message : "Unable to load held sales");
    } finally {
      setHeldLoading(false);
    }
  }, [branchId]);

  useEffect(() => { queueMicrotask(() => void loadHeldSales()); }, [loadHeldSales]);

  function appointmentCart(detail: AppointmentDetail): CartLine[] {
    return detail.serviceLines.map((line) => ({
      type: "SERVICE" as const,
      itemId: line.serviceId,
      name: line.serviceName,
      price: line.price,
      taxRate: line.taxRate,
      priceTaxMode: line.priceTaxMode,
      quantity: 1,
      discount: 0,
      staffId: line.staffId || undefined,
    }));
  }

  async function loadLinkedAppointment(id: string, replaceCart: boolean) {
    if (!id) {
      setAppointmentId("");
      setLinkedAppointment(null);
      return true;
    }
    setAppointmentLoading(true);
    setCheckoutError("");
    try {
      const detail = await getBillingAppointment(id);
      if (detail.branch.id !== branchId) throw new Error(`Switch to ${detail.branch.name} before checking out this appointment.`);
      if (detail.invoice) {
        openInvoice(detail.invoice.id);
        return true;
      }
      if (!canCheckoutAppointmentStatus(detail.status)) {
        throw new Error(`Checkout is unavailable for ${title(detail.status).toLowerCase()} appointments.`);
      }
      setAppointmentId(detail.id);
      setLinkedAppointment(detail);
      setCustomer({
        id: detail.customer.id,
        name: detail.customer.name,
        phone: detail.customer.phone,
        email: detail.customer.email,
        visits: detail.customer.visitCount,
        loyalty: detail.customer.loyaltyBalance,
        notes: detail.customer.notes,
        allergies: detail.customer.allergies,
      });
      const lines = appointmentCart(detail);
      setCart((current) => replaceCart ? lines : current.length ? current : lines);
      return true;
    } catch (appointmentError) {
      setCheckoutError(appointmentError instanceof Error ? appointmentError.message : "Unable to link appointment");
      return false;
    } finally {
      setAppointmentLoading(false);
    }
  }

  useEffect(() => {
    if (!seed) return;
    if (seed.branchId && branchId !== seed.branchId) return;
    if (seed.appointmentId) {
      queueMicrotask(async () => {
        await loadLinkedAppointment(seed.appointmentId!, true);
        clearSeed?.();
      });
      return;
    }
    if (seed.customerId) {
      const matched = data.customers.find((item) => item.id === seed.customerId);
      if (matched) {
        setCustomer(matched);
        setCheckoutError("");
      } else {
        setCheckoutError("Selected customer is not available in this branch context. Search and select the customer again.");
      }
      clearSeed?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, clearSeed, data.customers, seed]);

  useEffect(() => {
    if (appointmentId && linkedAppointment && linkedAppointment.id === appointmentId) {
      setCheckoutError("");
    }
  }, [appointmentId, linkedAppointment]);

  useEffect(() => {
    if (!customer?.id || !branchId) {
      setCustomerProfile(null);
      setProfileError("");
      return;
    }
    const controller = new AbortController();
    setProfileError("");
    getBillingCustomerProfile(customer.id, branchId, controller.signal)
      .then(setCustomerProfile)
      .catch((loadError) => {
        if (!(loadError instanceof DOMException && loadError.name === "AbortError")) setProfileError(loadError instanceof Error ? loadError.message : "Unable to load customer balances");
      });
    return () => controller.abort();
  }, [branchId, customer?.id]);

  function clearCurrentSale() {
    setCart([]);
    setCustomer(null);
    setAppointmentId("");
    setLinkedAppointment(null);
    setTip(0);
    setTaxMode("GST");
    setPayments([{ method: "UPI", amount: 0 }]);
    setActiveDraftId("");
    setCheckoutError("");
    setMobileSheet(null);
  }

  function saleDraftPayload() {
    return {
      branchId,
      customerId: customer?.id,
      appointmentId: appointmentId || undefined,
      title: customer?.name ? `${customer.name} sale` : "Held counter sale",
      taxMode,
      cart,
      payments,
      tip,
    };
  }

  async function holdSale() {
    if (!cart.length) {
      setCheckoutError("Add at least one service or product before holding the sale.");
      return;
    }
    setCheckoutError("");
    const result = await submit<HeldSale>(
      activeDraftId ? `/api/v1/operations/sale-drafts/${activeDraftId}` : "/api/v1/operations/sale-drafts",
      saleDraftPayload(),
      activeDraftId ? "Held sale updated." : "Sale held for later.",
      activeDraftId ? "PATCH" : "POST",
      false,
    );
    if (result.ok) {
      clearCurrentSale();
      await loadHeldSales();
    } else {
      setCheckoutError(result.error);
    }
  }

  function restoreHeldSale(draft: HeldSale) {
    setActiveDraftId(draft.id);
    setCart(draft.cart.map((line) => ({ ...line, priceTaxMode: line.priceTaxMode ?? "EXCLUSIVE" })));
    setPayments(draft.payments.length ? draft.payments : [{ method: "UPI", amount: 0 }]);
    setTaxMode(draft.taxMode);
    setTip(draft.tip);
    setAppointmentId(draft.appointmentId || "");
    setLinkedAppointment(null);
    setCustomer(draft.customer || data.customers.find((item) => item.id === draft.customerId) || null);
    setCheckoutError("");
    if (draft.appointmentId) void loadLinkedAppointment(draft.appointmentId, false);
  }

  async function discardHeldSale(draftId: string, reason = "discarded") {
    try {
      await deleteHeldSale(draftId, branchId, reason);
    } catch (deleteError) {
      setCheckoutError(deleteError instanceof Error ? deleteError.message : "Unable to discard held sale");
      return false;
    }
    if (activeDraftId === draftId) clearCurrentSale();
    await loadHeldSales();
    return true;
  }

  function packageUses(balance: unknown, serviceId: string) {
    if (!Array.isArray(balance)) return 0;
    const matched = balance.find((item) => item && typeof item === "object" && (item as { serviceId?: unknown }).serviceId === serviceId) as { quantity?: unknown } | undefined;
    return Number(matched?.quantity || 0);
  }

  function packagesForService(serviceId: string) {
    return (customerProfile?.packages || []).filter((item) => packageUses(item.balance, serviceId) > 0 && new Date(item.expiresAt) >= new Date());
  }

  function add(line: CartLine) {
    setCart((current) => {
      const existing = current.find((item) => item.type === line.type && item.itemId === line.itemId);
      return existing ? current.map((item) => item === existing ? { ...item, quantity: item.quantity + 1 } : item) : [...current, line];
    });
    setCheckoutError("");
  }

  function cartQuantity(type: CartLine["type"], itemId: string) {
    return cart.find((item) => item.type === type && item.itemId === itemId)?.quantity || 0;
  }

  function removeOneFromCart(type: CartLine["type"], itemId: string) {
    setCart((current) => current.flatMap((item) => {
      if (item.type !== type || item.itemId !== itemId) return [item];
      return item.quantity > 1 ? [{ ...item, quantity: item.quantity - 1 }] : [];
    }));
    setCheckoutError("");
  }

  function addServiceToCart(service: WorkspaceData["services"][number]) {
    add({ type: "SERVICE", itemId: service.id, name: service.name, price: service.price, taxRate: service.taxRate, priceTaxMode: service.priceTaxMode, quantity: 1, discount: 0, staffId: data.staff[0]?.id });
  }

  function addProductToCart(product: WorkspaceData["inventory"][number]) {
    if (product.quantity <= cartQuantity("PRODUCT", product.id)) return;
    add({ type: "PRODUCT", itemId: product.id, name: product.name, price: product.retailPrice, taxRate: product.taxRate, priceTaxMode: product.priceTaxMode, quantity: 1, discount: 0 });
  }

  function handleCatalogueCardKeyDown(event: React.KeyboardEvent<HTMLElement>, action: () => void) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    action();
  }

  function canIncreaseCartLine(line: CartLine) {
    if (line.type !== "PRODUCT") return true;
    const product = data.inventory.find((item) => item.id === line.itemId);
    return product ? product.quantity > line.quantity : false;
  }

  function addCartLineUnit(line: CartLine) {
    if (line.type === "PRODUCT") {
      const product = data.inventory.find((item) => item.id === line.itemId);
      if (product) addProductToCart(product);
      return;
    }
    const service = data.services.find((item) => item.id === line.itemId);
    if (service) addServiceToCart(service);
  }

  async function linkAppointment(id: string) {
    await loadLinkedAppointment(id, false);
  }

  async function checkout() {
    setCheckoutError("");
    const result = await submit<{ id: string; number: string; total: string | number }>("/api/v1/operations/checkout", {
      branchId,
      customerId: customer?.id,
      appointmentId: appointmentId || undefined,
      taxMode,
      lines: cart.map(({ type, itemId, quantity, staffId, discount, packagePurchaseId }) => ({ type, itemId, quantity, staffId, discount, packagePurchaseId })),
      payments: payments.map((payment) => ({ ...payment, amount: Number(payment.amount.toFixed(2)) })),
      tip,
      idempotencyKey: `checkout-${newId()}`,
    }, `Sale recorded: ${inr.format(grandTotal)}. Opening invoice...`);
    if (result.ok) {
      const invoiceId = result.data.id;
      if (activeDraftId) await discardHeldSale(activeDraftId, "converted_to_invoice");
      clearCurrentSale();
      setMobileSheet(null);
      openInvoice(invoiceId);
    } else {
      if (result.code === "APPOINTMENT_ALREADY_INVOICED") {
        const invoiceId = typeof result.details === "object" && result.details && "invoiceId" in result.details ? String((result.details as { invoiceId?: unknown }).invoiceId || "") : "";
        if (invoiceId) {
          clearCurrentSale();
          openInvoice(invoiceId);
          return;
        }
      }
      setCheckoutError(result.error);
    }
  }

  if (!branchId) return <Card title="Billing"><SlotMessage text="Select a specific branch before recording a bill." /></Card>;
  return <div className="space-y-5">
    <div className="mobile-pos-screen space-y-3 md:hidden">
      <section className="overflow-hidden rounded-[1.8rem] border border-[#16B994]/30 bg-[#173279] text-white shadow-[0_18px_50px_rgba(23,50,121,.18)]">
        <div className="bg-[radial-gradient(circle_at_top_right,rgba(22,185,148,.24),transparent_48%)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#16B994]">Mobile billing</p>
              <h2 className="mt-1 truncate font-serif text-2xl font-semibold">Current sale</h2>
              <p className="mt-1 text-xs font-semibold text-white/55">{customer?.name || "Select customer"} {customer?.phone ? `- ${customer.phone}` : ""}</p>
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-1 rounded-2xl bg-white/10 p-1">
              {(["GST", "NON_GST"] as const).map((mode) => <button key={mode} type="button" onClick={() => setTaxMode(mode)} className={`rounded-xl px-2.5 py-2 text-[10px] font-extrabold ${taxMode === mode ? "bg-[#16B994] text-[#111111]" : "text-white/65"}`}>{mode === "GST" ? "GST" : "Non-GST"}</button>)}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-white/10 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-white/45">Total</p><strong className="mt-1 block text-lg">{inr.format(grandTotal)}</strong></div>
            <div className="rounded-2xl bg-white/10 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-white/45">Paid</p><strong className="mt-1 block text-lg">{inr.format(paymentTotal)}</strong></div>
            <div className={`rounded-2xl p-3 ${Math.abs(balanceDue) <= 0.01 ? "bg-[#1789AA]" : "bg-[#F7FAFC] text-[#5f4310]"}`}><p className="text-[10px] font-bold uppercase tracking-wide opacity-70">Due</p><strong className="mt-1 block text-lg">{inr.format(balanceDue)}</strong></div>
          </div>
        </div>
      </section>

      <section className="rounded-[1.6rem] border border-[#E5E7EB] bg-white p-4 shadow-sm">
        <div className="grid gap-2">
          <button type="button" onClick={() => setMobileSheet("customer")} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] p-3 text-left">
            <span className="min-w-0"><span className="block text-[11px] font-extrabold uppercase tracking-[.14em] text-[#1789AA]">Customer</span><strong className="mt-1 block truncate text-sm">{customer?.name || "Select customer"}</strong>{customer?.phone && <span className="mt-1 block truncate text-xs text-[#737174]">{customer.phone}</span>}</span>
            <ChevronRight size={18} className="shrink-0 text-[#1789AA]" />
          </button>

          {customerProfile && <div className="grid grid-cols-4 gap-2">
            <button type="button" onClick={() => setMobileSheet("payment")} className="rounded-2xl bg-[#e7f8f2] p-2 text-left"><span className="block text-[10px] font-bold text-[#1789AA]">Wallet</span><strong className="text-xs">{inr.format(customerProfile.summary.walletBalance)}</strong></button>
            <button type="button" onClick={() => setMobileSheet("payment")} className="rounded-2xl bg-[#F7FAFC] p-2 text-left"><span className="block text-[10px] font-bold text-[#7b5514]">Rewards</span><strong className="text-xs">{customerProfile.summary.loyaltyBalance}</strong></button>
            <button type="button" onClick={() => setMobileSheet("payment")} className="rounded-2xl bg-[#f5effc] p-2 text-left"><span className="block text-[10px] font-bold text-[#604681]">Cards</span><strong className="text-xs">{activeGiftCards.length}</strong></button>
            <button type="button" onClick={() => setMobileSheet("items")} className="rounded-2xl bg-[#eaf3fc] p-2 text-left"><span className="block text-[10px] font-bold text-[#294f79]">Packs</span><strong className="text-xs">{activePackages.length}</strong></button>
          </div>}
          {profileError && <p className="rounded-xl bg-[#fff0ec] px-3 py-2 text-xs font-bold text-[#995849]">{profileError}</p>}
        </div>

        <div className="mt-3 rounded-2xl border border-[#E5E7EB] p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-[11px] font-extrabold uppercase tracking-[.14em] text-[#1789AA]">Appointment</p>
            {linkedAppointment && <Status value={linkedAppointment.status} />}
          </div>
          <WorkspaceSelect value={appointmentId} onChange={(value) => void linkAppointment(value)} options={appointmentOptions} compact />
          {appointmentLoading ? <p className="mt-2 text-xs font-bold text-[#737174]">Loading appointment...</p> : linkedAppointment ? <div className="mt-2 rounded-2xl bg-[#e7f8f2] p-3 text-xs text-[#1789AA]"><strong>{formatDateTime(linkedAppointment.startsAt)}</strong><span className="mt-1 block">{linkedAppointment.serviceLines.map((line) => `${line.serviceName}${line.staffName ? ` with ${line.staffName}` : ""}`).join(", ")}</span><button type="button" onClick={() => { setAppointmentId(""); setLinkedAppointment(null); }} className="mt-2 rounded-full bg-white px-3 py-1 text-[11px] font-extrabold text-[#0f6f57]">Unlink</button></div> : null}
        </div>
      </section>

      <section className="rounded-[1.6rem] border border-[#E5E7EB] bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-[11px] font-extrabold uppercase tracking-[.14em] text-[#1789AA]">Cart</p><h3 className="mt-1 font-serif text-xl font-semibold">{cart.length ? `${cart.length} line${cart.length === 1 ? "" : "s"}` : "No items yet"}</h3></div>
          <button type="button" onClick={() => setMobileSheet("items")} className="rounded-full bg-[#173279] px-4 py-2 text-xs font-extrabold text-white"><Plus size={14} className="mr-1 inline" /> Add items</button>
        </div>
        <div className="mt-3 space-y-3">
          {cart.map((line) => {
            const packageOptions = line.type === "SERVICE" ? packagesForService(line.itemId) : [];
            const lineAmounts = calculateTaxLine({ quantity: line.quantity, unitPrice: line.price, discount: line.packagePurchaseId ? line.price * line.quantity : line.discount, taxRate: line.taxRate, priceTaxMode: line.priceTaxMode, invoiceTaxMode: taxMode });
            const lineTax = lineAmounts.tax;
            const lineTotal = lineAmounts.total;
            return <div key={`${line.type}-${line.itemId}`} className="rounded-2xl bg-[#F7FAFC] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="truncate text-sm font-extrabold">{line.name}</p><p className="mt-1 text-xs text-[#737174]">{title(line.type)} - {inr.format(line.price)} each</p></div>
                <div className="shrink-0 text-right"><strong className="block text-sm text-[#047857]">{inr.format(lineTotal)}</strong><span className="block text-[10px] font-bold text-[#6B7280]">{taxMode === "GST" ? `${inr.format(lineTax)} GST ${line.priceTaxMode === "INCLUSIVE" ? "included" : "added"}` : "No GST"}</span><button type="button" onClick={() => setCart((current) => current.filter((item) => item !== line))} className="mt-1 text-xs font-extrabold text-[#995849]">Remove</button></div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="text-[11px] font-bold text-[#737174]">Qty<input className="field mt-1 p-2" type="number" min="1" value={line.quantity} onChange={(event) => setCart((current) => current.map((item) => item === line ? { ...item, quantity: Number(event.target.value) } : item))} /></label>
                <label className="text-[11px] font-bold text-[#737174]">Discount<input className="field mt-1 p-2" type="number" min="0" disabled={Boolean(line.packagePurchaseId)} value={line.packagePurchaseId ? line.price * line.quantity : line.discount} onChange={(event) => setCart((current) => current.map((item) => item === line ? { ...item, discount: Number(event.target.value) } : item))} /></label>
              </div>
              {line.type === "SERVICE" && <WorkspaceSelect className="mt-2" label="Staff" value={line.staffId || ""} onChange={(value) => setCart((current) => current.map((item) => item === line ? { ...item, staffId: value || undefined } : item))} options={staffAttributionOptions} compact />}
              {line.type === "SERVICE" && <WorkspaceSelect className="mt-2" label="Package redemption" value={line.packagePurchaseId || ""} onChange={(value) => setCart((current) => current.map((item) => item === line ? { ...item, packagePurchaseId: value || undefined, discount: value ? item.price * item.quantity : 0 } : item))} options={[{ value: "", label: "No package redemption" }, ...packageOptions.map((pack) => ({ value: pack.id, label: pack.name, description: `${packageUses(pack.balance, line.itemId)} use(s) left` }))]} compact />}
            </div>;
          })}
          {!cart.length && <Empty text="Tap Add items to add services or products." />}
        </div>
      </section>

      <section className="rounded-[1.6rem] border border-[#E5E7EB] bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-[11px] font-extrabold uppercase tracking-[.14em] text-[#1789AA]">Payment</p><p className="mt-1 text-sm font-bold">{Math.abs(balanceDue) <= 0.01 ? "Payment balanced" : balanceDue > 0 ? `${inr.format(balanceDue)} remaining` : `${inr.format(Math.abs(balanceDue))} overpaid`}</p></div>
          <button type="button" onClick={() => setMobileSheet("payment")} className="rounded-full border border-[#E5E7EB] bg-[#F7FAFC] px-4 py-2 text-xs font-extrabold text-[#7b5514]"><CreditCard size={14} className="mr-1 inline" /> Payment</button>
        </div>
        <div className="mt-3 rounded-2xl bg-[#173279] p-4 text-sm text-white">
          <Summary label="Listed price" value={inr.format(totals.subtotal)} />
          <Summary label="Discount / redemptions" value={`-${inr.format(totals.discount)}`} />
          {taxMode === "GST" && totals.includedTax > 0 && <Summary label="GST included" value={inr.format(totals.includedTax)} />}
          {taxMode === "GST" && totals.addedTax > 0 && <Summary label="GST added" value={inr.format(totals.addedTax)} />}
          {taxMode === "NON_GST" && <Summary label="GST" value={inr.format(0)} />}
          <Summary label="Tip" value={inr.format(tip)} />
          <div className="mt-3 flex justify-between border-t border-white/12 pt-3 text-lg"><span>Total</span><strong>{inr.format(grandTotal)}</strong></div>
        </div>
        {checkoutBlocker && <p className="mt-3 rounded-2xl bg-[#fff0ec] p-3 text-xs font-bold text-[#995849]">{checkoutBlocker}</p>}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" disabled={!cart.length} onClick={() => void holdSale()} className="rounded-full border border-[#E5E7EB] bg-[#F7FAFC] px-4 py-3 text-sm font-extrabold text-[#7b5514] disabled:cursor-not-allowed disabled:opacity-45">{activeDraftId ? "Update hold" : "Hold sale"}</button>
          <button type="button" onClick={() => setMobileSheet("held")} className="rounded-full border border-black/10 px-4 py-3 text-sm font-extrabold">Held ({heldSales.length})</button>
          <button type="button" disabled={!cart.length && !customer && !activeDraftId} onClick={clearCurrentSale} className="col-span-2 rounded-full border border-black/10 px-4 py-3 text-sm font-extrabold disabled:cursor-not-allowed disabled:opacity-45">Clear current sale</button>
        </div>
      </section>

      <div className="h-36" />
      <button type="button" disabled={saleWarnings.length > 0} onClick={checkout} className="primary fixed inset-x-3 bottom-[calc(5.35rem+env(safe-area-inset-bottom))] z-30 justify-center py-4 shadow-[0_18px_45px_rgba(23,50,121,.28)] disabled:cursor-not-allowed disabled:opacity-55 md:hidden"><ReceiptText size={17} /> Record payment - {inr.format(grandTotal)}</button>
    </div>

    <div className="hidden space-y-3 md:block">
      <div className="rounded-3xl border border-[#E5E7EB] bg-white p-3 shadow-sm">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold uppercase tracking-[.16em] text-[#5B2A86]">Billing counter</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-extrabold tracking-tight text-[#111827]">New bill</h2>
              <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${Math.abs(balanceDue) <= 0.01 && grandTotal > 0 ? "bg-[#D1FAE5] text-[#047857]" : "bg-[#FEF3C7] text-[#92400E]"}`}>
                {Math.abs(balanceDue) <= 0.01 && grandTotal > 0 ? "Ready" : `${inr.format(balanceDue)} due`}
              </span>
              {customer && <span className="rounded-full bg-[#F3E8FF] px-3 py-1 text-xs font-extrabold text-[#5B2A86]">{customer.name}</span>}
              {linkedAppointment && <span className="rounded-full bg-[#EEF2FF] px-3 py-1 text-xs font-extrabold text-[#4338CA]">{formatTime(linkedAppointment.startsAt)} appointment</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <button type="button" disabled={!cart.length} onClick={() => void holdSale()} className="rounded-full border border-[#E5E7EB] bg-white px-4 py-2.5 text-sm font-extrabold text-[#111827] shadow-sm transition hover:-translate-y-0.5 hover:border-[#5B2A86]/30 hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-45">{activeDraftId ? "Update hold" : "Hold sale"}</button>
            <button type="button" onClick={() => void loadHeldSales()} className="rounded-full border border-[#E5E7EB] bg-white px-4 py-2.5 text-sm font-extrabold text-[#111827] shadow-sm transition hover:-translate-y-0.5 hover:border-[#5B2A86]/30 hover:bg-[#F8FAFC]">Held {heldSales.length}</button>
            <div className="grid grid-cols-2 gap-1 rounded-full bg-[#F3F4F6] p-1">
              {(["GST", "NON_GST"] as const).map((mode) => <button key={mode} type="button" onClick={() => setTaxMode(mode)} className={`rounded-full px-4 py-2 text-xs font-extrabold transition ${taxMode === mode ? "bg-[#5B2A86] text-white shadow-sm" : "text-[#6B7280] hover:text-[#111827]"}`}>{mode === "GST" ? "GST" : "Non-GST"}</button>)}
            </div>
            <button type="button" disabled={saleWarnings.length > 0} onClick={checkout} className="primary workspace-payment-button justify-center px-5 py-3 disabled:cursor-not-allowed disabled:opacity-45"><ReceiptText size={16} /> Record payment</button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          <SummaryTile label="Cart" value={`${cart.length} line${cart.length === 1 ? "" : "s"}`} />
          <SummaryTile label="Total" value={inr.format(grandTotal)} />
          <SummaryTile label="Paid" value={inr.format(paymentTotal)} />
          <SummaryTile label="Due" value={inr.format(balanceDue)} tone={Math.abs(balanceDue) <= 0.01 ? "green" : "amber"} />
        </div>
      </div>

      <div className="space-y-3">
        <aside className="grid gap-3 xl:grid-cols-[minmax(360px,1.15fr)_minmax(300px,.9fr)_minmax(300px,.8fr)]">
          <Card title="Customer" action={<button type="button" onClick={() => setMobileSheet("customer")} className="hidden rounded-full border border-black/10 px-3 py-1.5 text-xs font-extrabold md:inline-flex">Search</button>}>
            <CustomerPicker branchId={branchId} value={customer?.id || ""} initialCustomers={customerChoices} onChange={(nextCustomer) => { setCustomer(nextCustomer); setCheckoutError(""); }} submit={submit} />
            {customerProfile && <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <Info label="Wallet" value={inr.format(customerProfile.summary.walletBalance)} tone="green" />
              <Info label="Rewards" value={`${customerProfile.summary.loyaltyBalance} pts`} tone="amber" />
              <Info label="Gift cards" value={String(activeGiftCards.length)} tone="violet" />
              <Info label="Packages" value={String(activePackages.length)} tone="blue" />
            </div>}
            {profileError && <p className="mt-2 text-xs font-bold text-[#995849]">{profileError}</p>}
          </Card>

          <Card title="Appointment">
            <WorkspaceSelect value={appointmentId} onChange={(value) => void linkAppointment(value)} options={appointmentOptions} compact />
            {appointmentLoading ? <p className="mt-3 rounded-2xl bg-[#F7FAFC] p-3 text-xs font-bold text-[#737174]">Loading linked appointment...</p> : linkedAppointment ? <div className="mt-3 rounded-2xl border border-[#a8ead8] bg-[#e7f8f2] p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-extrabold text-[#173279]">{linkedAppointment.customer.name}</p>
                  <p className="mt-1 text-xs font-semibold text-[#51645a]">{formatDateTime(linkedAppointment.startsAt)}</p>
                  <p className="mt-2 line-clamp-3 text-xs text-[#51645a]">{linkedAppointment.serviceLines.map((line) => `${line.serviceName}${line.staffName ? ` with ${line.staffName}` : ""}`).join(", ")}</p>
                </div>
                <Status value={linkedAppointment.status} />
              </div>
              <button type="button" onClick={() => { setAppointmentId(""); setLinkedAppointment(null); }} className="mt-3 rounded-full border border-[#a8ead8] bg-white px-3 py-1.5 text-xs font-extrabold text-[#0f6f57]">Unlink</button>
            </div> : <p className="mt-3 rounded-2xl bg-[#F7FAFC] p-3 text-xs font-semibold text-[#737174]">Use for walk-ins, phone bookings, or appointment checkout.</p>}
          </Card>

          <Card title="Held sales" action={<button type="button" onClick={() => void loadHeldSales()} className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-extrabold">Refresh</button>}>
            {heldLoading ? <SlotMessage text="Loading held sales..." loading /> : heldSales.length ? <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {heldSales.map((draft) => <div key={draft.id} className={`rounded-2xl border p-3 ${activeDraftId === draft.id ? "border-[#16B994] bg-[#F7FAFC]" : "border-[#E5E7EB] bg-white"}`}>
                <p className="truncate text-sm font-extrabold">{draft.title}</p>
                <p className="mt-1 text-xs text-[#737174]">{draft.cart.length} line(s) | {formatDateTime(draft.updatedAt)}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <strong className="text-sm">{inr.format(draft.total)}</strong>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => restoreHeldSale(draft)} className="rounded-full bg-[#173279] px-2.5 py-1.5 text-[11px] font-extrabold text-white">Restore</button>
                    <button type="button" onClick={() => { if (window.confirm("Discard this held sale? This does not affect invoices or stock.")) void discardHeldSale(draft.id); }} className="rounded-full border border-[#e9c2b9] bg-[#fff0ec] px-2.5 py-1.5 text-[11px] font-extrabold text-[#984f43]">Discard</button>
                  </div>
                </div>
              </div>)}
            </div> : <Empty text="No held sales for this branch." />}
          </Card>
        </aside>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_405px]">
        <main className="min-w-0">
          <Card title="Billing catalogue" action={<span className="rounded-full bg-[#F7FAFC] px-3 py-1.5 text-xs font-extrabold text-[#7b5514]">{taxMode === "GST" ? "GST mode" : "Non-GST mode"}</span>}>
            <div className="grid gap-3 xl:grid-cols-[auto_1fr] xl:items-center">
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[#F7FAFC] p-1">
                <button type="button" onClick={() => { setTab("SERVICE"); setCategory(""); }} className={`rounded-xl px-4 py-2.5 text-sm font-extrabold transition ${tab === "SERVICE" ? "bg-white text-[#5B2A86] shadow-sm" : "text-[#6B7280] hover:text-[#111827]"}`}>Services</button>
                <button type="button" onClick={() => { setTab("PRODUCT"); setCategory(""); }} className={`rounded-xl px-4 py-2.5 text-sm font-extrabold transition ${tab === "PRODUCT" ? "bg-white text-[#5B2A86] shadow-sm" : "text-[#6B7280] hover:text-[#111827]"}`}>Products</button>
              </div>
              <label className="workspace-search-field flex items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] px-4 transition focus-within:border-[#5B2A86] focus-within:bg-white">
                <Search size={17} className="text-[#6B7280]" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} className="workspace-plain-input w-full bg-transparent py-3 text-sm font-semibold outline-none placeholder:text-[#9CA3AF]" placeholder={tab === "SERVICE" ? "Search service or category" : "Search product, SKU, or scan barcode"} />
              </label>
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              <button type="button" onClick={() => setCategory("")} className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-left text-xs font-extrabold transition hover:-translate-y-0.5 hover:shadow-sm ${!category ? "border-[#16A34A]/30 bg-[#D1FAE5] text-[#047857]" : "border-[#E5E7EB] bg-white text-[#111827]"}`}>
                <span className="grid size-6 place-items-center rounded-full bg-white/70"><GripVertical size={13} /></span>
                <span>All</span>
                <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-black opacity-80">{tab === "SERVICE" ? services.length : products.length}</span>
              </button>
              {categories.slice(0, 7).map((item) => {
                const count = tab === "SERVICE" ? data.services.filter((service) => service.isActive && service.category === item).length : data.inventory.filter((product) => product.category === item).length;
                return <button type="button" key={item} onClick={() => setCategory(item)} className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-left text-xs font-extrabold transition hover:-translate-y-0.5 hover:shadow-sm ${category === item ? "border-[#16A34A]/30 bg-[#D1FAE5] text-[#047857]" : "border-[#E5E7EB] bg-white text-[#111827]"}`}>
                  <span className="grid size-6 place-items-center rounded-full bg-white/70">{tab === "SERVICE" ? <Sparkles size={13} /> : <Boxes size={13} />}</span>
                  <span className="max-w-28 truncate">{item}</span>
                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-black opacity-80">{count}</span>
                </button>;
              })}
            </div>

            <div className="mt-4 grid max-h-[calc(100dvh-380px)] min-h-[430px] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 2xl:grid-cols-3">
              {tab === "SERVICE"
                ? services.map((service) => {
                  const quantity = cartQuantity("SERVICE", service.id);
                  return <article
                    key={service.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={quantity > 0}
                    onClick={() => addServiceToCart(service)}
                    onKeyDown={(event) => handleCatalogueCardKeyDown(event, () => addServiceToCart(service))}
                    className={`cursor-pointer rounded-2xl border bg-white p-3 shadow-sm outline-none transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-[#5B2A86] ${quantity ? "border-[#16A34A] ring-2 ring-[#16A34A]/10" : "border-[#E5E7EB]"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="grid size-9 place-items-center rounded-xl bg-[#F3E8FF] text-[#5B2A86]"><Sparkles size={16} /></span>
                        <p className="mt-2 line-clamp-2 min-h-9 text-sm font-extrabold leading-snug text-[#111827]">{service.name}</p>
                        <p className="mt-1 text-xs font-semibold text-[#6B7280]">{service.category} - {service.durationMinutes} min</p>
                      </div>
                      <span className="shrink-0 text-right">
                        <strong className="block text-sm text-[#047857]">{inr.format(displayPrice(service.price, service.taxRate, service.priceTaxMode, taxMode))}</strong>
                        <span className="mt-0.5 block text-[10px] font-bold text-[#6B7280]">{taxMode === "GST" ? service.priceTaxMode === "INCLUSIVE" ? "GST included" : `${inr.format(service.price)} + GST` : "No GST"}</span>
                      </span>
                    </div>
                    <div className="mt-3">
                      {quantity ? <div className="grid grid-cols-[36px_1fr_36px] items-center overflow-hidden rounded-xl border border-[#A7F3D0] bg-[#ECFDF5]">
                        <button type="button" onKeyDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); removeOneFromCart("SERVICE", service.id); }} className="grid h-9 place-items-center bg-[#FEE2E2] text-base font-black text-[#DC2626] transition hover:bg-[#DC2626] hover:text-white">-</button>
                        <span className="text-center text-sm font-extrabold text-[#047857]">{quantity}</span>
                        <button type="button" onKeyDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); addServiceToCart(service); }} className="grid h-9 place-items-center bg-[#DCFCE7] text-base font-black text-[#16A34A] transition hover:bg-[#16A34A] hover:text-white">+</button>
                      </div> : <button type="button" onKeyDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); addServiceToCart(service); }} className="w-full rounded-xl bg-[#D1FAE5] px-3 py-2 text-xs font-extrabold text-[#047857] transition hover:bg-[#16A34A] hover:text-white">Add to bill</button>}
                    </div>
                  </article>;
                })
                : products.map((product) => {
                  const quantity = cartQuantity("PRODUCT", product.id);
                  const canAdd = product.quantity > quantity;
                  return <article
                    key={product.id}
                    role={canAdd ? "button" : undefined}
                    tabIndex={canAdd ? 0 : -1}
                    aria-pressed={quantity > 0}
                    aria-disabled={!canAdd}
                    onClick={() => canAdd && addProductToCart(product)}
                    onKeyDown={(event) => canAdd && handleCatalogueCardKeyDown(event, () => addProductToCart(product))}
                    className={`rounded-2xl border bg-white p-3 shadow-sm outline-none transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-[#5B2A86] ${quantity ? "border-[#16A34A] ring-2 ring-[#16A34A]/10" : "border-[#E5E7EB]"} ${canAdd ? "cursor-pointer" : "cursor-not-allowed opacity-55"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="grid size-9 place-items-center rounded-xl bg-[#E0F2FE] text-[#0369A1]"><Boxes size={16} /></span>
                        <p className="mt-2 line-clamp-2 min-h-9 text-sm font-extrabold leading-snug text-[#111827]">{product.name}</p>
                        <p className="mt-1 text-xs font-semibold text-[#6B7280]">{product.category} - {product.sku}</p>
                      </div>
                      <span className="shrink-0 text-right"><strong className="block text-sm text-[#047857]">{inr.format(displayPrice(product.retailPrice, product.taxRate, product.priceTaxMode, taxMode))}</strong><span className="block text-[10px] font-bold text-[#6B7280]">{taxMode === "GST" ? product.priceTaxMode === "INCLUSIVE" ? "GST included" : `${inr.format(product.retailPrice)} + GST` : "No GST"}</span><span className={product.quantity <= product.reorderLevel ? "block text-xs font-extrabold text-[#DC2626]" : "block text-xs font-bold text-[#6B7280]"}>{product.quantity <= 0 ? "Out" : `${product.quantity} left`}</span></span>
                    </div>
                    <div className="mt-3">
                      {quantity ? <div className="grid grid-cols-[36px_1fr_36px] items-center overflow-hidden rounded-xl border border-[#A7F3D0] bg-[#ECFDF5]">
                        <button type="button" onKeyDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); removeOneFromCart("PRODUCT", product.id); }} className="grid h-9 place-items-center bg-[#FEE2E2] text-base font-black text-[#DC2626] transition hover:bg-[#DC2626] hover:text-white">-</button>
                        <span className="text-center text-sm font-extrabold text-[#047857]">{quantity}</span>
                        <button type="button" disabled={!canAdd} onKeyDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); addProductToCart(product); }} className="grid h-9 place-items-center bg-[#DCFCE7] text-base font-black text-[#16A34A] transition hover:bg-[#16A34A] hover:text-white disabled:cursor-not-allowed disabled:opacity-40">+</button>
                      </div> : <button type="button" disabled={!canAdd} onKeyDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); addProductToCart(product); }} className="w-full rounded-xl bg-[#D1FAE5] px-3 py-2 text-xs font-extrabold text-[#047857] transition hover:bg-[#16A34A] hover:text-white disabled:cursor-not-allowed disabled:opacity-40">Add to bill</button>}
                    </div>
                  </article>;
                })}
            </div>
            {tab === "PRODUCT" && products.some((item) => item.quantity <= item.reorderLevel) && <p className="mt-4 rounded-2xl bg-[#FEF3C7] p-3 text-xs font-bold text-[#92400E]">Low-stock products are highlighted before checkout.</p>}
          </Card>
        </main>

        <aside className="xl:sticky xl:top-20 xl:h-fit">
          <section className="overflow-hidden rounded-[2rem] border border-[#E5E7EB] bg-white shadow-sm">
            <div className="flex items-start justify-between gap-4 border-b border-[#E5E7EB] p-5">
              <div className="min-w-0">
                <p className="text-xs font-extrabold uppercase tracking-[.14em] text-[#5B2A86]">Bill summary</p>
                <h3 className="mt-1 truncate text-xl font-extrabold text-[#111827]">{customer?.name || "Walk-in sale"}</h3>
                <p className="mt-1 truncate text-xs font-semibold text-[#6B7280]">{customer?.phone || "Select customer before checkout"}</p>
              </div>
              <button type="button" disabled={!cart.length && !customer && !activeDraftId} onClick={clearCurrentSale} className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#F7FAFC] text-[#6B7280] transition hover:bg-[#FEE2E2] hover:text-[#DC2626] disabled:opacity-40"><X size={17} /></button>
            </div>

            <div className="max-h-[calc(100dvh-500px)] min-h-44 space-y-3 overflow-y-auto p-5">
              {cart.map((line) => {
                const packageOptions = line.type === "SERVICE" ? packagesForService(line.itemId) : [];
                const lineAmounts = calculateTaxLine({ quantity: line.quantity, unitPrice: line.price, discount: line.packagePurchaseId ? line.price * line.quantity : line.discount, taxRate: line.taxRate, priceTaxMode: line.priceTaxMode, invoiceTaxMode: taxMode });
                const lineTax = lineAmounts.tax;
                const lineTotal = lineAmounts.total;
                const canIncrease = canIncreaseCartLine(line);
                return <div key={`${line.type}-${line.itemId}`} className="rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-sm">
                  <div className="grid grid-cols-[56px_1fr_auto] gap-3">
                    <span className={`grid size-14 place-items-center rounded-2xl ${line.type === "SERVICE" ? "bg-[#F3E8FF] text-[#5B2A86]" : "bg-[#E0F2FE] text-[#0369A1]"}`}>{line.type === "SERVICE" ? <Sparkles size={19} /> : <Boxes size={19} />}</span>
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-extrabold text-[#111827]">{line.name}</p>
                      <p className="mt-1 text-xs font-semibold text-[#6B7280]">{inr.format(line.price)} x {line.quantity}</p>
                    </div>
                    <div className="text-right">
                      <strong className="text-sm text-[#047857]">{inr.format(lineTotal)}</strong>
                      <span className="mt-0.5 block text-[10px] font-bold text-[#6B7280]">{taxMode === "GST" ? `${inr.format(lineTax)} GST ${line.priceTaxMode === "INCLUSIVE" ? "included" : "added"}` : "No GST"}</span>
                      <button type="button" onClick={() => setCart((current) => current.filter((item) => item !== line))} className="mt-1 block text-[11px] font-extrabold text-[#DC2626]">Remove</button>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-[94px_1fr] gap-2">
                    <div className="grid grid-cols-[30px_1fr_30px] items-center overflow-hidden rounded-xl border border-[#A7F3D0] bg-[#ECFDF5]">
                      <button type="button" onClick={() => removeOneFromCart(line.type, line.itemId)} className="grid h-9 place-items-center bg-[#FEE2E2] font-black text-[#DC2626] transition hover:bg-[#DC2626] hover:text-white">-</button>
                      <span className="text-center text-sm font-extrabold text-[#047857]">{line.quantity}</span>
                      <button type="button" disabled={!canIncrease} onClick={() => addCartLineUnit(line)} className="grid h-9 place-items-center bg-[#DCFCE7] font-black text-[#16A34A] transition hover:bg-[#16A34A] hover:text-white disabled:cursor-not-allowed disabled:opacity-40">+</button>
                    </div>
                    <label className="text-[11px] font-bold text-[#737174]"><span className="sr-only">Discount</span><input className="field p-2" type="number" min="0" disabled={Boolean(line.packagePurchaseId)} value={line.packagePurchaseId ? line.price * line.quantity : line.discount} onChange={(event) => setCart((current) => current.map((item) => item === line ? { ...item, discount: Number(event.target.value) } : item))} placeholder="Discount" /></label>
                  </div>
                  {line.type === "SERVICE" && <WorkspaceSelect className="mt-2" label="Staff" value={line.staffId || ""} onChange={(value) => setCart((current) => current.map((item) => item === line ? { ...item, staffId: value || undefined } : item))} options={staffAttributionOptions} compact />}
                  {line.type === "SERVICE" && <WorkspaceSelect className="mt-2" label="Package" value={line.packagePurchaseId || ""} onChange={(value) => setCart((current) => current.map((item) => item === line ? { ...item, packagePurchaseId: value || undefined, discount: value ? line.price * line.quantity : 0 } : item))} options={[{ value: "", label: "No package redemption" }, ...packageOptions.map((pack) => ({ value: pack.id, label: pack.name, description: `${packageUses(pack.balance, line.itemId)} use(s) left` }))]} compact />}
                </div>;
              })}
              {!cart.length && <div className="rounded-3xl border border-dashed border-[#D1D5DB] bg-[#F7FAFC] p-6 text-center"><p className="font-extrabold text-[#111827]">No items added</p><p className="mt-1 text-xs font-semibold text-[#6B7280]">Choose services or products from the catalogue.</p></div>}
            </div>

            <div className="border-t border-[#E5E7EB] p-5">
              <label className="block text-xs font-bold text-[#6B7280]">Tip<input className="field mt-1" type="number" min="0" value={tip} onChange={(event) => setTip(Number(event.target.value))} /></label>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(["CASH", "UPI", "CARD"] as const).map((method) => <button key={method} type="button" onClick={() => setPayments([{ method, amount: Number(grandTotal.toFixed(2)) }])} className={`rounded-2xl border px-3 py-3 text-center text-xs font-extrabold transition ${payments.length === 1 && payments[0]?.method === method && Math.abs((payments[0]?.amount ?? 0) - grandTotal) <= 0.01 ? "border-[#16A34A] bg-[#D1FAE5] text-[#047857]" : "border-[#E5E7EB] bg-white text-[#111827] hover:border-[#5B2A86]/30"}`}><CreditCard size={16} className="mx-auto mb-1" />{method}<span className="mt-1 block text-[10px] opacity-70">{inr.format(grandTotal)}</span></button>)}
              </div>
              <div className="mt-3 space-y-2">
                {payments.map((payment, index) => <div key={index} className="grid grid-cols-[1fr_110px_auto] gap-2">
                  <WorkspaceSelect value={payment.method} onChange={(value) => setPayments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, method: value as typeof item.method } : item))} options={paymentMethodOptions} compact />
                  <input className="field" type="number" step="0.01" value={payment.amount || ""} onChange={(event) => setPayments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, amount: Number(event.target.value) } : item))} />
                  <button type="button" onClick={() => setPayments((current) => current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-xl border border-black/10 px-2 text-xs font-bold">X</button>
                  {payment.method === "GIFT_CARD" && <input className="field col-span-3" placeholder="Gift card code" value={payment.reference || ""} onChange={(event) => setPayments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, reference: event.target.value } : item))} />}
                </div>)}
              </div>
              <button type="button" onClick={() => setPayments((current) => [...current, { method: "CASH", amount: Math.max(0, balanceDue) }])} className="mt-2 rounded-full bg-[#F7FAFC] px-3 py-1.5 text-xs font-extrabold text-[#7b5514]">Split payment</button>
            </div>

            <div className="bg-[#F7FAFC] p-5">
              <div className="rounded-3xl bg-white p-4 text-sm shadow-sm">
                <Summary label="Listed price" value={inr.format(totals.subtotal)} />
                <Summary label="Discount / redemptions" value={`-${inr.format(totals.discount)}`} />
                {taxMode === "GST" && totals.includedTax > 0 && <Summary label="GST included" value={inr.format(totals.includedTax)} />}
                {taxMode === "GST" && totals.addedTax > 0 && <Summary label="GST added" value={inr.format(totals.addedTax)} />}
                {taxMode === "NON_GST" && <Summary label="GST" value={inr.format(0)} />}
                <Summary label="Tip" value={inr.format(tip)} />
                <div className="mt-3 flex justify-between border-t border-[#E5E7EB] pt-3 text-xl"><span className="font-extrabold">Total</span><strong>{inr.format(grandTotal)}</strong></div>
                <div className={`mt-3 rounded-2xl px-3 py-2 text-xs font-extrabold ${Math.abs(balanceDue) <= 0.01 ? "bg-[#D1FAE5] text-[#047857]" : "bg-[#FEF3C7] text-[#92400E]"}`}>{Math.abs(balanceDue) <= 0.01 ? "Payment balanced" : balanceDue > 0 ? `${inr.format(balanceDue)} remaining` : `${inr.format(Math.abs(balanceDue))} overpaid`}</div>
              </div>
              {(saleWarnings.length > 0 || checkoutError) && <div className="mt-3 rounded-2xl bg-[#fff0ec] p-3 text-xs font-bold text-[#995849]">{checkoutError || saleWarnings[0]}</div>}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" disabled={!cart.length} onClick={() => void holdSale()} className="rounded-full border border-[#E5E7EB] bg-white px-4 py-3 text-sm font-extrabold text-[#7b5514] disabled:cursor-not-allowed disabled:opacity-45">{activeDraftId ? "Update hold" : "Hold sale"}</button>
                <button type="button" disabled={!cart.length && !customer && !activeDraftId} onClick={clearCurrentSale} className="rounded-full border border-[#E5E7EB] bg-white px-4 py-3 text-sm font-extrabold disabled:cursor-not-allowed disabled:opacity-45">Clear</button>
                <button type="button" disabled={saleWarnings.length > 0} onClick={checkout} className="primary justify-center py-4 disabled:cursor-not-allowed disabled:opacity-45 col-span-2">Record payment and open invoice</button>
              </div>
            </div>
          </section>
        </aside>
        </div>
      </div>
    </div>

    {mobileSheet === "customer" && <MobilePosSheet title="Customer" eyebrow="Search or quick add" close={() => setMobileSheet(null)}>
      <CustomerPicker branchId={branchId} value={customer?.id || ""} initialCustomers={customerChoices} onChange={(nextCustomer) => { setCustomer(nextCustomer); setCheckoutError(""); setMobileSheet(null); }} submit={submit} />
    </MobilePosSheet>}

    {mobileSheet === "items" && <MobilePosSheet title="Add items" eyebrow={tab === "SERVICE" ? "Services" : "Products"} close={() => setMobileSheet(null)}>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => { setTab("SERVICE"); setCategory(""); }} className={`rounded-full px-4 py-2 text-sm font-bold ${tab === "SERVICE" ? "bg-[#173279] text-white" : "bg-[#F7FAFC]"}`}>Services</button>
        <button type="button" onClick={() => { setTab("PRODUCT"); setCategory(""); }} className={`rounded-full px-4 py-2 text-sm font-bold ${tab === "PRODUCT" ? "bg-[#173279] text-white" : "bg-[#F7FAFC]"}`}>Products</button>
      </div>
      <label className="workspace-search-field mt-4 flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3">
        <Search size={16} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} className="workspace-plain-input w-full bg-transparent py-3 outline-none" placeholder={tab === "SERVICE" ? "Search service or category" : "Search product, SKU, or scan barcode"} />
      </label>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        <button type="button" onClick={() => setCategory("")} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${!category ? "bg-[#16B994] text-white" : "bg-[#F7FAFC]"}`}>All</button>
        {categories.map((item) => <button type="button" key={item} onClick={() => setCategory(item)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${category === item ? "bg-[#16B994] text-white" : "bg-[#F7FAFC]"}`}>{item}</button>)}
      </div>
      <div className="mt-4 grid gap-3">
        {tab === "SERVICE"
          ? services.map((service) => <button type="button" key={service.id} onClick={() => addServiceToCart(service)} className="rounded-2xl border border-black/8 bg-white p-4 text-left active:scale-[.99]"><div className="flex items-start justify-between gap-3"><span><Sparkles size={18} className="text-[#1969A2]" /><span className="mt-3 block font-extrabold">{service.name}</span><span className="mt-1 block text-xs text-[#737174]">{service.category} - {service.durationMinutes} min</span></span><span className="text-right"><strong className="block text-[#173279]">{inr.format(displayPrice(service.price, service.taxRate, service.priceTaxMode, taxMode))}</strong><span className="text-[10px] font-bold text-[#6B7280]">{taxMode === "GST" ? service.priceTaxMode === "INCLUSIVE" ? "GST included" : `${inr.format(service.price)} + GST` : "No GST"}</span></span></div></button>)
          : products.map((product) => {
            const quantity = cartQuantity("PRODUCT", product.id);
            const canAdd = product.quantity > quantity;
            return <button type="button" key={product.id} disabled={!canAdd} onClick={() => addProductToCart(product)} className="rounded-2xl border border-black/8 bg-white p-4 text-left active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-45"><div className="flex items-start justify-between gap-3"><span><Boxes size={18} className="text-[#1789AA]" /><span className="mt-3 block font-extrabold">{product.name}</span><span className="mt-1 block text-xs text-[#737174]">{product.category} - {product.sku}</span></span><span className="text-right"><strong className="block text-[#173279]">{inr.format(displayPrice(product.retailPrice, product.taxRate, product.priceTaxMode, taxMode))}</strong><span className="block text-[10px] font-bold text-[#6B7280]">{taxMode === "GST" ? product.priceTaxMode === "INCLUSIVE" ? "GST included" : `${inr.format(product.retailPrice)} + GST` : "No GST"}</span><span className={product.quantity <= product.reorderLevel ? "block text-xs font-extrabold text-[#995849]" : "block text-xs font-bold text-[#737174]"}>{product.quantity <= 0 ? "Out of stock" : canAdd ? `${product.quantity - quantity} left` : "All in cart"}</span></span></div></button>;
          })}
      </div>
      {tab === "PRODUCT" && products.some((item) => item.quantity <= item.reorderLevel) && <p className="mt-4 rounded-2xl bg-[#F7FAFC] p-3 text-xs font-bold text-[#7b5514]">Low-stock products are highlighted. Out-of-stock products cannot be added.</p>}
    </MobilePosSheet>}

    {mobileSheet === "payment" && <MobilePosSheet title="Payment" eyebrow="Offline collection" close={() => setMobileSheet(null)}>
      {customerProfile && <div className="grid grid-cols-2 gap-2 text-xs">
        <Info label="Wallet" value={inr.format(customerProfile.summary.walletBalance)} tone="green" />
        <Info label="Rewards" value={`${customerProfile.summary.loyaltyBalance} pts`} tone="amber" />
        <Info label="Gift cards" value={String(activeGiftCards.length)} tone="violet" />
        <Info label="Packages" value={String(activePackages.length)} tone="blue" />
      </div>}
      <label className="mt-4 block text-xs font-bold">Tip<input className="field mt-1" type="number" min="0" value={tip} onChange={(event) => setTip(Number(event.target.value))} /></label>
      <div className="mt-3 flex flex-wrap gap-2">
        {(["CASH", "UPI", "CARD"] as const).map((method) => <button key={method} type="button" onClick={() => setPayments([{ method, amount: Number(grandTotal.toFixed(2)) }])} className="rounded-full bg-[#173279] px-4 py-2 text-xs font-extrabold text-white">Full {method} - {inr.format(grandTotal)}</button>)}
        <button type="button" onClick={() => setPayments((current) => [...current, { method: "CASH", amount: Math.max(0, balanceDue) }])} className="rounded-full bg-[#F7FAFC] px-4 py-2 text-xs font-extrabold text-[#7b5514]">Split payment</button>
      </div>
      <div className="mt-4 space-y-2">
        {payments.map((payment, index) => <div key={index} className="grid grid-cols-[1fr_110px_auto] gap-2">
          <WorkspaceSelect value={payment.method} onChange={(value) => setPayments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, method: value as typeof item.method } : item))} options={paymentMethodOptions} compact />
          <input className="field" type="number" step="0.01" value={payment.amount || ""} onChange={(event) => setPayments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, amount: Number(event.target.value) } : item))} />
          <button type="button" onClick={() => setPayments((current) => current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-xl border border-black/10 px-2 text-xs font-bold">X</button>
          {payment.method === "GIFT_CARD" && <input className="field col-span-3" placeholder="Gift card code" value={payment.reference || ""} onChange={(event) => setPayments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, reference: event.target.value } : item))} />}
        </div>)}
      </div>
      <div className="mt-4 rounded-2xl bg-[#173279] p-4 text-sm text-white">
        <Summary label="Total" value={inr.format(grandTotal)} />
        <Summary label="Paid" value={inr.format(paymentTotal)} />
        <div className={`mt-3 rounded-2xl px-3 py-2 text-xs font-extrabold ${Math.abs(balanceDue) <= 0.01 ? "bg-[#16B994] text-white" : "bg-[#F7FAFC] text-[#5f4310]"}`}>{Math.abs(balanceDue) <= 0.01 ? "Payment balanced" : balanceDue > 0 ? `${inr.format(balanceDue)} remaining` : `${inr.format(Math.abs(balanceDue))} overpaid`}</div>
      </div>
    </MobilePosSheet>}

    {mobileSheet === "held" && <MobilePosSheet title="Held sales" eyebrow="Paused carts" close={() => setMobileSheet(null)}>
      <button type="button" onClick={() => void loadHeldSales()} className="mb-3 rounded-full border border-black/10 px-3 py-1.5 text-xs font-extrabold">Refresh</button>
      {heldLoading ? <SlotMessage text="Loading held sales..." loading /> : heldSales.length ? <div className="space-y-3">
        {heldSales.map((draft) => <div key={draft.id} className={`rounded-2xl border p-4 ${activeDraftId === draft.id ? "border-[#16B994] bg-[#F7FAFC]" : "border-[#E5E7EB] bg-white"}`}>
          <p className="font-extrabold">{draft.title}</p>
          <p className="mt-1 text-xs text-[#737174]">{draft.customer?.phone || "No customer selected"} - {draft.cart.length} line(s) - Held {formatDateTime(draft.updatedAt)}</p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <strong>{inr.format(draft.total)}</strong>
            <div className="flex gap-2">
              <button type="button" onClick={() => { restoreHeldSale(draft); setMobileSheet(null); }} className="rounded-full bg-[#173279] px-3 py-1.5 text-xs font-extrabold text-white">Restore</button>
              <button type="button" onClick={() => { if (window.confirm("Discard this held sale? This does not affect invoices or stock.")) void discardHeldSale(draft.id); }} className="rounded-full border border-[#e9c2b9] bg-[#fff0ec] px-3 py-1.5 text-xs font-extrabold text-[#984f43]">Discard</button>
            </div>
          </div>
        </div>)}
      </div> : <Empty text="No held sales for this branch." />}
    </MobilePosSheet>}
  </div>;
}

export function MobilePosSheet({ title: heading, eyebrow, close, children }: { title: string; eyebrow: string; close: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-end overflow-hidden bg-black/42 backdrop-blur-sm md:hidden" onMouseDown={(event) => event.target === event.currentTarget && close()} role="dialog" aria-modal="true">
    <section className="mobile-bottom-sheet mobile-pos-sheet flex w-full flex-col overflow-hidden rounded-t-[2rem] border border-white/10 bg-[#fbfdff] shadow-[0_-24px_70px_rgba(23,50,121,.28)]">
      <div className="mx-auto my-4 h-1.5 w-12 shrink-0 rounded-full bg-black/10" />
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-black/6 bg-[#fbfdff]/95 px-4 pb-4 backdrop-blur-xl">
        <div><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#1789AA]">{eyebrow}</p><h3 className="font-serif text-2xl font-semibold">{heading}</h3></div>
        <button type="button" onClick={close} className="grid size-10 place-items-center rounded-full bg-[#F7FAFC]"><X size={18} /></button>
      </div>
      <div className="mobile-bottom-sheet-body mobile-pos-sheet-body min-h-0 flex-1 px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4">
        {children}
      </div>
    </section>
  </div>;
}
