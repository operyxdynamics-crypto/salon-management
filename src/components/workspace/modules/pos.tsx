"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, ChevronRight, CreditCard, Gift, Plus, ReceiptText, RefreshCw, Search, Sparkles, Star, WalletCards, X } from "lucide-react";
import { calculateTaxLine } from "@/lib/billing";
import { newId } from "@/lib/client-id";
import { initials, inr } from "@/lib/format";
import type { AppointmentDetail, CustomerProfile, WorkspaceData } from "@/lib/operations-types";

import { mutateWorkspace } from "@/components/workspace/client";
import { PosSeed, SubmitFn } from "@/components/workspace/contracts";
import { CustomerPicker } from "@/components/workspace/customer/customer-picker";
import type { CustomerChoice } from "@/components/workspace/customer/types";
import { deleteHeldSale, getBillingAppointment, getBillingCustomerProfile, getHeldSales } from "@/components/workspace/modules/billing-api";
import type { CartLine, HeldSale, SalePaymentDraft } from "@/components/workspace/modules/billing-types";
import { ProductTile, ServiceTile, cartLineSubtitle } from "@/components/workspace/modules/pos-tiles";
import { Card, Empty, SlotMessage, Status, WorkspaceSelect, canCheckoutAppointmentStatus, formatDateTime, formatTime, title, useIsMobile } from "@/components/workspace/shared-ui";

const PAYMENT_METHODS = ["CASH", "UPI", "CARD", "WALLET", "GIFT_CARD", "LOYALTY"] as const;

export function PosViewV2({ data, submit, openInvoice, seed, clearSeed }: { data: WorkspaceData; submit: SubmitFn; openInvoice: (invoiceId?: string) => void; seed?: PosSeed | null; clearSeed?: () => void }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<CustomerChoice | null>(null);
  const [appointmentId, setAppointmentId] = useState("");
  const [linkedAppointment, setLinkedAppointment] = useState<AppointmentDetail | null>(null);
  const [appointmentLoading, setAppointmentLoading] = useState(false);
  const [tab, setTab] = useState<"SERVICE" | "PRODUCT">("SERVICE");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [payments, setPayments] = useState<SalePaymentDraft[]>([{ method: "CASH", amount: 0 }]);
  const [taxMode, setTaxMode] = useState<"GST" | "NON_GST">("GST");
  const [tip, setTip] = useState(0);
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
  const [heldLoading, setHeldLoading] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState("");
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
  const [profileError, setProfileError] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [editingLine, setEditingLine] = useState<CartLine | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [discarding, setDiscarding] = useState<HeldSale | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discount: number; allocations: Record<string, number> } | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponError, setCouponError] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);
  const isMobile = useIsMobile();
  const branchId = data.identity.branchId || "";

  const totals = useMemo(() => cart.reduce((result, line) => {
    const base = line.price * line.quantity;
    // Fold the coupon's share of the bill into this line's discount, exactly as the server does,
    // so the GST shown at the counter matches the GST printed on the invoice.
    const couponShare = coupon?.allocations[`${line.type}-${line.itemId}`] ?? 0;
    const lineDiscount = line.packagePurchaseId ? base : Math.min(base, line.discount + couponShare);
    const amounts = calculateTaxLine({ quantity: line.quantity, unitPrice: line.price, discount: lineDiscount, taxRate: line.taxRate, priceTaxMode: line.priceTaxMode, invoiceTaxMode: taxMode });
    return {
      subtotal: result.subtotal + amounts.subtotal,
      discount: result.discount + amounts.discount,
      tax: result.tax + amounts.tax,
      total: result.total + amounts.total,
    };
  }, { subtotal: 0, discount: 0, tax: 0, total: 0 }), [cart, taxMode, coupon]);

  const grandTotal = Number((totals.total + tip).toFixed(2));
  const paidTotal = Number(payments.reduce((sum, item) => sum + Number(item.amount || 0), 0).toFixed(2));
  const balanceDue = Number((grandTotal - paidTotal).toFixed(2));
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  const activePackages = useMemo(() => customerProfile?.packages.filter((item) => new Date(item.expiresAt) >= new Date()) ?? [], [customerProfile]);
  const activeGiftCards = useMemo(() => customerProfile?.giftCards.filter((item) => item.status === "ACTIVE" && item.balance > 0) ?? [], [customerProfile]);
  const walletBalance = customerProfile?.summary.walletBalance ?? 0;
  const loyaltyBalance = customerProfile?.summary.loyaltyBalance ?? 0;

  // Favourites come from the branch's own top-selling services. No schema change, and the
  // grid puts the six things staff actually ring up all day within one tap.
  const favouriteNames = useMemo(() => new Set((data.trends?.topServices ?? []).slice(0, 6).map((item) => item.label)), [data.trends]);

  const categories = tab === "SERVICE"
    ? [...new Set(data.serviceCategories.filter((item) => item.isActive).map((item) => item.name))]
    : [...new Set(data.inventory.map((item) => item.category))];

  const matches = (haystack: string) => haystack.toLowerCase().includes(query.trim().toLowerCase());
  const services = data.services.filter((item) => item.isActive && (!category || item.category === category) && matches(`${item.name} ${item.category}`));
  const products = data.inventory.filter((item) => (!category || item.category === category) && matches(`${item.name} ${item.sku} ${item.category}`));


  const loadHeldSales = useCallback(async () => {
    if (!branchId) return setHeldSales([]);
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
        if (!(loadError instanceof DOMException && loadError.name === "AbortError")) {
          setProfileError(loadError instanceof Error ? loadError.message : "Unable to load customer balances");
        }
      });
    return () => controller.abort();
  }, [branchId, customer?.id]);

  // A barcode scanner is a keyboard. Keeping the search box focused on the items step means
  // a scan lands in the right place without anyone touching the screen.
  useEffect(() => {
    if (!isMobile) searchRef.current?.focus();
  }, [isMobile]);

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

  const loadLinkedAppointment = useCallback(async (id: string, replaceCart: boolean) => {
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
  }, [branchId, openInvoice]);

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
        setCheckoutError("That customer is not available in this branch. Search and select them again.");
      }
      clearSeed?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, clearSeed, data.customers, seed]);

  function clearCurrentSale() {
    setCart([]);
    setCustomer(null);
    setAppointmentId("");
    setLinkedAppointment(null);
    setTip(0);
    setTaxMode("GST");
    setPayments([{ method: "CASH", amount: 0 }]);
    setActiveDraftId("");
    setCheckoutError("");
    setCartOpen(false);
  }

  function addLine(line: CartLine) {
    setCart((current) => {
      const existing = current.find((item) => item.type === line.type && item.itemId === line.itemId);
      return existing
        ? current.map((item) => item === existing ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, line];
    });
    setCheckoutError("");
  }

  function cartQuantity(type: CartLine["type"], itemId: string) {
    return cart.find((item) => item.type === type && item.itemId === itemId)?.quantity || 0;
  }

  /** The "-" on a tile. Dropping to zero removes the line rather than leaving an empty one. */
  function decrement(type: CartLine["type"], itemId: string) {
    setCart((current) => current.flatMap((item) => {
      if (item.type !== type || item.itemId !== itemId) return [item];
      return item.quantity > 1 ? [{ ...item, quantity: item.quantity - 1 }] : [];
    }));
    setCheckoutError("");
  }

  /** "2 times · with Priya" / "2 × 200ml · L'Oreal" / "Free with their package". */
  function describeLine(line: CartLine) {
    const product = line.type === "PRODUCT" ? data.inventory.find((item) => item.id === line.itemId) : undefined;
    return cartLineSubtitle({
      type: line.type,
      quantity: line.quantity,
      packagePurchaseId: line.packagePurchaseId,
      staffName: line.staffId ? data.staff.find((member) => member.id === line.staffId)?.name ?? null : null,
      unit: product?.unit ?? null,
      brandName: product?.brandName ?? null,
    });
  }

  function addService(service: WorkspaceData["services"][number]) {
    // Attribute the line to whoever is booked for that service on the linked appointment,
    // falling back to the appointment's first assigned professional.
    const bookedStaffId = linkedAppointment?.serviceLines.find((line) => line.serviceId === service.id)?.staffId
      || linkedAppointment?.serviceLines.find((line) => line.staffId)?.staffId
      || undefined;
    addLine({ type: "SERVICE", itemId: service.id, name: service.name, price: service.price, taxRate: service.taxRate, priceTaxMode: service.priceTaxMode, quantity: 1, discount: 0, staffId: bookedStaffId });
  }

  function addProduct(product: WorkspaceData["inventory"][number]) {
    if (product.quantity <= cartQuantity("PRODUCT", product.id)) return;
    addLine({ type: "PRODUCT", itemId: product.id, name: product.name, price: product.retailPrice, taxRate: product.taxRate, priceTaxMode: product.priceTaxMode, quantity: 1, discount: 0 });
  }

  function updateLine(target: CartLine, patch: Partial<CartLine>) {
    setCart((current) => current.map((item) => item === target ? { ...item, ...patch } : item));
  }

  function removeLine(target: CartLine) {
    setCart((current) => current.filter((item) => item !== target));
  }

  function packageUses(balance: unknown, serviceId: string) {
    if (!Array.isArray(balance)) return 0;
    const matched = balance.find((item) => item && typeof item === "object" && (item as { serviceId?: unknown }).serviceId === serviceId) as { quantity?: unknown } | undefined;
    return Number(matched?.quantity || 0);
  }

  function packagesForService(serviceId: string) {
    return activePackages.filter((item) => packageUses(item.balance, serviceId) > 0);
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
    if (!cart.length) return setCheckoutError("Add at least one service or product before holding the sale.");
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
    setPayments(draft.payments.length ? draft.payments : [{ method: "CASH", amount: 0 }]);
    setTaxMode(draft.taxMode);
    setTip(draft.tip);
    setAppointmentId(draft.appointmentId || "");
    setLinkedAppointment(null);
    setCustomer(draft.customer || data.customers.find((item) => item.id === draft.customerId) || null);
    setCheckoutError("");
    setHeldOpen(false);
    if (draft.appointmentId) void loadLinkedAppointment(draft.appointmentId, false);
  }

  async function confirmDiscard() {
    if (!discarding) return;
    try {
      await deleteHeldSale(discarding.id, branchId, "discarded");
      if (activeDraftId === discarding.id) clearCurrentSale();
      await loadHeldSales();
    } catch (deleteError) {
      setCheckoutError(deleteError instanceof Error ? deleteError.message : "Unable to discard held sale");
    } finally {
      setDiscarding(null);
    }
  }

  // A coupon's discount is computed against the cart it was applied to. If the cart changes, the
  // discount is stale - drop it rather than charge a number that no longer follows from the bill.
  useEffect(() => {
    setCoupon(null);
    setCouponError("");
  }, [cart, taxMode]);

  async function applyCouponCode() {
    const code = couponInput.trim();
    if (!code || !cart.length) return;
    setCouponBusy(true);
    setCouponError("");
    try {
      const payload = await mutateWorkspace<{ result: { ok: boolean; discount?: number; reason?: string }; allocations: Array<{ key: string; amount: number }> }>(
        "/api/v1/operations/coupons",
        "PUT",
        {
          branchId,
          code,
          customerId: customer?.id ?? null,
          cart: cart.map((line) => ({
            type: line.type,
            itemId: line.itemId,
            categoryId: line.type === "SERVICE"
              ? data.services.find((service) => service.id === line.itemId)?.categoryId ?? null
              : data.inventory.find((product) => product.id === line.itemId)?.categoryId ?? null,
            netAmount: Number((line.price * line.quantity - (line.packagePurchaseId ? line.price * line.quantity : line.discount)).toFixed(2)),
          })),
        },
      );

      if (!payload.result.ok) {
        setCouponError(payload.result.reason || "That coupon cannot be used on this bill.");
        return;
      }
      setCoupon({
        code: code.toUpperCase(),
        discount: payload.result.discount ?? 0,
        allocations: Object.fromEntries(payload.allocations.map((item) => [item.key, item.amount])),
      });
      setCouponInput("");
    } catch (applyError) {
      setCouponError(applyError instanceof Error ? applyError.message : "Unable to check that coupon");
    } finally {
      setCouponBusy(false);
    }
  }

  function setPaymentMethod(index: number, method: SalePaymentDraft["method"]) {
    setPayments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, method, reference: undefined } : item));
  }

  function fillRemaining(index: number) {
    const others = payments.reduce((sum, item, itemIndex) => itemIndex === index ? sum : sum + Number(item.amount || 0), 0);
    const remaining = Number(Math.max(0, grandTotal - others).toFixed(2));
    setPayments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, amount: remaining } : item));
  }

  async function checkout() {
    setCheckoutError("");
    // The message states what happened, not what is about to happen: the invoice itself opens on
    // success, so an "Opening invoice..." commentary only ages badly on screen.
    const result = await submit<{ id: string; number: string; total: string | number }>("/api/v1/operations/checkout", {
      branchId,
      customerId: customer?.id,
      appointmentId: appointmentId || undefined,
      taxMode,
      lines: cart.map(({ type, itemId, quantity, staffId, discount, packagePurchaseId }) => ({ type, itemId, quantity, staffId, discount, packagePurchaseId })),
      payments: payments.filter((payment) => Number(payment.amount) > 0).map((payment) => ({ ...payment, amount: Number(payment.amount.toFixed(2)) })),
      tip,
      couponCode: coupon?.code,
      idempotencyKey: `checkout-${newId()}`,
    }, `Sale recorded: ${inr.format(grandTotal)}`);

    // Someone else took the last use of the coupon while this sale was being paid for. The bill
    // is now a different number, so it cannot just be retried silently.
    if (!result.ok && (result.code === "COUPON_CHANGED" || result.code === "COUPON_REJECTED")) {
      setCoupon(null);
      setCheckoutError(`${result.error} The coupon has been removed - check the new total before charging.`);
      return;
    }

    if (result.ok) {
      const invoiceId = result.data.id;
      if (activeDraftId) await deleteHeldSale(activeDraftId, branchId, "converted_to_invoice").catch(() => undefined);
      clearCurrentSale();
      await loadHeldSales();
      openInvoice(invoiceId);
      return;
    }
    if (result.code === "APPOINTMENT_ALREADY_INVOICED") {
      const invoiceId = typeof result.details === "object" && result.details && "invoiceId" in result.details
        ? String((result.details as { invoiceId?: unknown }).invoiceId || "")
        : "";
      if (invoiceId) {
        clearCurrentSale();
        openInvoice(invoiceId);
        return;
      }
    }
    setCheckoutError(result.error);
  }

  if (!branchId) return <Card title="Billing"><SlotMessage text="Select a specific branch before recording a bill." /></Card>;

  // Today's bookings that can still be billed. Ordered by time, because that is the order they
  // walk up to the counter in.
  const billableAppointments = data.appointments
    .filter((item) => !item.invoice && canCheckoutAppointmentStatus(item.status))
    .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
  const staffOptions = [{ value: "", label: "Use appointment or default staff" }, ...data.staff.map((member) => ({ value: member.id, label: member.name, description: member.role }))];

  return <div className="space-y-4 pb-28 lg:pb-0">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-[#1F2937]">New sale</h2>
        <p className="mt-0.5 text-sm font-semibold text-[#737174]">{data.identity.branchName}</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-xl bg-[#F7FAFC] p-1">
          {(["GST", "NON_GST"] as const).map((mode) => <button key={mode} type="button" onClick={() => setTaxMode(mode)} className={`rounded-lg px-3 py-1.5 text-xs font-extrabold transition ${taxMode === mode ? "bg-white text-[#173279] shadow-sm" : "text-[#737174]"}`}>{mode === "GST" ? "GST" : "Non-GST"}</button>)}
        </div>
        <button type="button" onClick={() => setHeldOpen(true)} className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-extrabold text-[#7b5514]">
          Held{heldSales.length ? ` (${heldSales.length})` : ""}
        </button>
      </div>
    </div>

    {checkoutError && <p className="flex items-start gap-2 rounded-2xl border border-[#e9c2b9] bg-[#fff0ec] p-3 text-sm font-bold text-[#984f43]"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{checkoutError}</p>}

    {/* One screen. A till is not a wizard: reception needs to see who the bill is for, what is on
        it, and what is owed, all at once - and to change any of the three without going "back". */}
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Chosen. Show who they are and what they are owed, and let reception change their mind -
          picking the wrong Sharma is the single most common mistake at a salon counter. */}
      {customer ? <section className="rounded-2xl border border-[#5B2A86]/30 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#EFE8F6] text-sm font-extrabold text-[#5B2A86]">{initials(customer.name)}</span>
            <div className="min-w-0">
              <p className="truncate text-lg font-extrabold text-[#1F2937]">{customer.name}</p>
              <p className="mt-0.5 truncate text-xs font-semibold text-[#6B7280]">{customer.phone}{customer.visits ? ` · ${customer.visits} visits` : " · New customer"}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { setCustomer(null); setAppointmentId(""); setLinkedAppointment(null); setCheckoutError(""); }}
            className="shrink-0 rounded-full border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-extrabold text-[#5B2A86] transition hover:bg-[#EFE8F6]"
          >Change</button>
        </div>

        {/* What they can pay with, before anyone gets to the payment screen and is surprised. */}
        {customerProfile && <div className="mt-4 grid grid-cols-4 gap-2">
          {[
            ["Wallet", inr.format(walletBalance)],
            ["Points", String(loyaltyBalance)],
            ["Cards", String(activeGiftCards.length)],
            ["Packages", String(activePackages.length)],
          ].map(([label, value]) => <div key={label} className="rounded-xl bg-[#F6F7FB] p-2.5 text-center">
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-[#9CA3AF]">{label}</p>
            <p className="mt-0.5 text-sm font-extrabold text-[#1F2937]">{value}</p>
          </div>)}
        </div>}

        {/* An allergy is not a footnote. */}
        {customer.allergies && <p className="mt-3 flex items-start gap-2 rounded-xl border border-[#F5D0C5] bg-[#FDECEC] p-3 text-xs font-bold text-[#94302E]">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          Allergy: {customer.allergies}
        </p>}
        {!customer.allergies && customer.notes && <p className="mt-3 rounded-xl bg-[#F6F7FB] p-3 text-xs font-semibold text-[#6B7280]">{customer.notes}</p>}
        {profileError && <p className="mt-3 text-xs font-bold text-[#995849]">{profileError}</p>}
      </section> : <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <h3 className="text-sm font-extrabold text-[#1F2937]">Who is this sale for?</h3>
        <p className="mt-1 text-xs font-semibold text-[#6B7280]">Search by name or mobile, or add someone new.</p>
        <div className="mt-4">
          <CustomerPicker
            branchId={branchId}
            value=""
            initialCustomers={data.customers}
            onChange={(choice) => { setCustomer(choice); setCheckoutError(""); }}
            submit={submit}
          />
        </div>
      </section>}

      {/* Billing someone who is booked is the common case, so it is a list you tap - not an option
          buried in a dropdown labelled "Link an appointment". */}
      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <h3 className="text-sm font-extrabold text-[#1F2937]">Billing a booking?</h3>
        <p className="mt-1 text-xs font-semibold text-[#6B7280]">Tap one to pull its services straight into the bill.</p>

        {appointmentLoading && <p className="mt-4 text-xs font-bold text-[#6B7280]"><RefreshCw size={12} className="mr-1 inline animate-spin" />Loading booking...</p>}

        {linkedAppointment ? <div className="mt-4 rounded-2xl border border-[#a8ead8] bg-[#e7f8f2] p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <strong className="block text-sm text-[#0f6f57]">{formatDateTime(linkedAppointment.startsAt)}</strong>
              <p className="mt-1 text-xs font-semibold text-[#0f6f57]/80">{linkedAppointment.serviceLines.map((line) => line.serviceName).join(", ")}</p>
            </div>
            <Status value={linkedAppointment.status} />
          </div>
          <button type="button" onClick={() => { setAppointmentId(""); setLinkedAppointment(null); }} className="mt-3 rounded-full bg-white px-3 py-1.5 text-xs font-extrabold text-[#984f43]">Unlink</button>
        </div> : <div className="mt-4 max-h-56 space-y-1.5 overflow-y-auto">
          {billableAppointments.length ? billableAppointments.map((appointment) => <button
            key={appointment.id}
            type="button"
            onClick={() => void loadLinkedAppointment(appointment.id, true)}
            className="flex w-full items-center gap-3 rounded-xl border border-[#E5E7EB] bg-white p-3 text-left transition hover:border-[#5B2A86] hover:bg-[#F9F7FC]"
          >
            <span className="w-14 shrink-0 text-sm font-extrabold tabular-nums text-[#5B2A86]">{formatTime(appointment.startsAt)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-[#1F2937]">{appointment.customer}</span>
              <span className="block truncate text-xs text-[#6B7280]">{appointment.service} · {appointment.staff || "Unassigned"}</span>
            </span>
            <Status value={appointment.status} />
          </button>) : <p className="rounded-xl bg-[#F6F7FB] p-4 text-center text-xs font-semibold text-[#9CA3AF]">
            No unbilled bookings today. This is a walk-in or counter sale.
          </p>}
        </div>}
      </section>

    </div>

    {/* Items on the left, the till on the right.
     *
     * Three columns needs about 1400px to breathe; on a tablet it squeezes the item grid to nothing.
     * So payment and bill stack in a single right-hand rail, and only a wide desktop splits them. */}
    <div className="grid gap-4 md:h-[calc(100dvh-20rem)] md:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_19rem_21rem]">
      <section className="flex min-h-0 flex-col rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
        <div className="flex gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#DDE7EF] bg-white px-3">
            <Search size={16} className="shrink-0 text-[#9a938b]" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full py-2.5 text-sm outline-none"
              placeholder="Search or scan barcode"
              aria-label="Search services and products, or scan a barcode"
            />
            {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={15} className="text-[#737174]" /></button>}
          </label>
        </div>

        <div className="mt-3 flex gap-1 rounded-xl bg-[#F7FAFC] p-1">
          {(["SERVICE", "PRODUCT"] as const).map((value) => <button key={value} type="button" onClick={() => { setTab(value); setCategory(""); }} className={`flex-1 rounded-lg px-3 py-2 text-xs font-extrabold transition ${tab === value ? "bg-white text-[#173279] shadow-sm" : "text-[#737174]"}`}>{value === "SERVICE" ? "Services" : "Products"}</button>)}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setCategory("")} className={`rounded-full px-3 py-1.5 text-xs font-extrabold transition ${!category ? "bg-[#173279] text-white" : "bg-[#F7FAFC] text-[#737174]"}`}>All</button>
          {categories.map((item) => <button key={item} type="button" onClick={() => setCategory(item)} className={`rounded-full px-3 py-1.5 text-xs font-extrabold transition ${category === item ? "bg-[#173279] text-white" : "bg-[#F7FAFC] text-[#737174]"}`}>{item}</button>)}
        </div>

        {/* Auto-fit, not a fixed column count: the tile keeps a workable minimum width and the grid
            takes as many as fit. A fixed 5-up truncated every name on a laptop. */}
        <div className="mt-3 grid min-h-0 flex-1 auto-rows-min gap-2 overflow-y-auto [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
          {tab === "SERVICE"
            ? services.map((service) => <ServiceTile
              key={service.id}
              service={{ id: service.id, name: service.name, price: service.price, durationMinutes: service.durationMinutes }}
              quantity={cartQuantity("SERVICE", service.id)}
              isFavourite={favouriteNames.has(service.name)}
              onAdd={() => addService(service)}
              onRemove={() => decrement("SERVICE", service.id)}
            />)
            : products.map((product) => <ProductTile
              key={product.id}
              product={{
                id: product.id,
                name: product.name,
                price: product.retailPrice,
                brandName: product.brandName,
                unit: product.unit,
                available: product.quantity,
              }}
              quantity={cartQuantity("PRODUCT", product.id)}
              onAdd={() => addProduct(product)}
              onRemove={() => decrement("PRODUCT", product.id)}
            />)}
        </div>
        {!(tab === "SERVICE" ? services.length : products.length) && <Empty text={query ? `Nothing matches "${query}".` : "Nothing in this category."} />}
      </section>

      {/* The rail. One scrolling column on tablet and laptop; on a very wide screen `contents`
          dissolves it and the two panels become grid columns of their own. */}
      <div className="hidden min-h-0 flex-col gap-4 overflow-y-auto md:flex 2xl:contents">
      <section className="flex min-h-0 shrink-0 flex-col rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm 2xl:overflow-y-auto">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            {/* The question reception actually asks the customer. "Tender" is a software word. */}
            <h3 className="text-sm font-extrabold text-[#1F2937]">How did they pay?</h3>
            <p className="mt-0.5 text-xs font-semibold text-[#737174]">Use more than one if they split it.</p>
          </div>
          {customerProfile && <div className="flex flex-wrap gap-1.5">
            <BalanceTile icon={<WalletCards size={12} />} label="Wallet" value={inr.format(walletBalance)} />
            <BalanceTile icon={<Sparkles size={12} />} label="Points" value={String(loyaltyBalance)} />
            <BalanceTile icon={<Gift size={12} />} label="Cards" value={String(activeGiftCards.length)} />
            <BalanceTile icon={<ReceiptText size={12} />} label="Packs" value={String(activePackages.length)} />
          </div>}
        </div>

        <div className="mt-4 space-y-3">
          {payments.map((payment, index) => <div key={index} className="rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] p-3">
            <div className="flex flex-wrap gap-1.5">
              {PAYMENT_METHODS.map((method) => <button
                key={method}
                type="button"
                onClick={() => setPaymentMethod(index, method)}
                className={`rounded-full px-3 py-1.5 text-xs font-extrabold transition ${payment.method === method ? "bg-[#173279] text-white" : "bg-white text-[#737174]"}`}
              >{title(method)}</button>)}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <label className="text-[11px] font-bold text-[#737174]">
                Amount
                <input className="field mt-1" type="number" min="0" step="0.01" value={payment.amount || ""} onChange={(event) => setPayments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, amount: Number(event.target.value) } : item))} />
              </label>
              <button type="button" onClick={() => fillRemaining(index)} className="self-end rounded-xl border border-[#E5E7EB] bg-white px-3 py-2.5 text-xs font-extrabold text-[#173279]">Fill remaining</button>
            </div>
            {/* Cash is counted in notes, not typed to the paisa. Tapping denominations is
                faster than a keyboard and it computes the change to hand back. */}
            {payment.method === "CASH" && <div className="mt-3">
              <div className="flex flex-wrap gap-1.5">
                {[100, 200, 500, 2000].map((note) => <button
                  key={note}
                  type="button"
                  onClick={() => setPayments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, amount: Number((Number(item.amount || 0) + note).toFixed(2)) } : item))}
                  className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-extrabold text-[#1F2937]"
                >+{inr.format(note)}</button>)}
                <button type="button" onClick={() => setPayments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, amount: 0 } : item))} className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-extrabold text-[#737174]">Reset</button>
              </div>
              {Number(payment.amount || 0) > grandTotal && <p className="mt-2 rounded-xl bg-[#fff7df] px-3 py-2 text-sm font-extrabold text-[#865c12]">
                Change to give back: {inr.format(Number(payment.amount) - grandTotal)}
              </p>}
            </div>}
            {payment.method === "GIFT_CARD" && <label className="mt-2 block text-[11px] font-bold text-[#737174]">
              Gift card code
              <input className="field mt-1" value={payment.reference || ""} onChange={(event) => setPayments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, reference: event.target.value } : item))} placeholder="Card code" />
            </label>}
            {payments.length > 1 && <button type="button" onClick={() => setPayments((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="mt-2 text-xs font-extrabold text-[#984f43]">Remove tender</button>}
          </div>)}
          <button type="button" onClick={() => setPayments((current) => [...current, { method: "CASH", amount: 0 }])} className="w-full rounded-2xl border border-dashed border-[#E5E7EB] py-3 text-xs font-extrabold text-[#173279]">
            <Plus size={14} className="mr-1 inline" /> Split payment
          </button>
        </div>

        <div className="mt-4">
          <p className="text-[11px] font-bold text-[#737174]">Tip</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {[0, 50, 100, 200].map((amount) => <button
              key={amount}
              type="button"
              onClick={() => setTip(amount)}
              className={`rounded-xl border px-3 py-2 text-xs font-extrabold transition ${tip === amount ? "border-[#173279] bg-[#173279] text-white" : "border-[#E5E7EB] bg-white text-[#1F2937]"}`}
            >{amount === 0 ? "No tip" : inr.format(amount)}</button>)}
            <input className="field w-28" type="number" min="0" step="0.01" value={tip || ""} onChange={(event) => setTip(Number(event.target.value))} placeholder="Custom" aria-label="Custom tip" />
          </div>
        </div>
      </section>

      <aside className="min-h-0 shrink-0 2xl:block">
        <div className="flex h-full flex-col rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
          <div className="flex shrink-0 items-center justify-between">
            <h3 className="text-sm font-extrabold text-[#1F2937]">The bill</h3>
            <span className="text-xs font-bold text-[#9CA3AF]">{cartCount} item{cartCount === 1 ? "" : "s"}</span>
          </div>

          {/* The lines, editable in place. Tapping one opens the quantity, discount, staff, and
              package options - nothing about a line is hidden behind a step. */}
          <div className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto">
            {cart.length ? cart.map((line) => {
              const base = line.price * line.quantity;
              const amounts = calculateTaxLine({ quantity: line.quantity, unitPrice: line.price, discount: line.packagePurchaseId ? base : line.discount, taxRate: line.taxRate, priceTaxMode: line.priceTaxMode, invoiceTaxMode: taxMode });
              return <button
                key={`${line.type}-${line.itemId}`}
                type="button"
                onClick={() => setEditingLine(line)}
                className="flex w-full items-start justify-between gap-2 rounded-lg p-2 text-left transition hover:bg-[#F6F7FB]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-[#1F2937]">{line.name}</span>
                  <span className={`block truncate text-xs ${line.packagePurchaseId ? "text-[#0f6f57]" : "text-[#9CA3AF]"}`}>{describeLine(line)}</span>
                </span>
                <span className={`shrink-0 text-sm font-bold tabular-nums ${line.packagePurchaseId ? "text-[#0f6f57]" : "text-[#1F2937]"}`}>
                  {line.packagePurchaseId ? "Free" : inr.format(amounts.total)}
                </span>
              </button>;
            }) : <p className="rounded-xl bg-[#F6F7FB] p-6 text-center text-xs font-semibold text-[#9CA3AF]">Tap an item to add it.</p>}
          </div>

          <div className="mt-3 shrink-0 border-t border-[#E5E7EB] pt-3">
            {coupon ? <div className="flex items-center justify-between gap-2 rounded-xl bg-[#e7f8f2] p-3">
              <span className="min-w-0">
                <strong className="block truncate text-sm text-[#0f6f57]">{coupon.code}</strong>
                <span className="text-xs font-semibold text-[#0f6f57]/75">-{inr.format(coupon.discount)} off this bill</span>
              </span>
              <button type="button" onClick={() => setCoupon(null)} className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-extrabold text-[#984f43]">Remove</button>
            </div> : <div className="flex gap-2">
              <input
                value={couponInput}
                onChange={(event) => { setCouponInput(event.target.value.toUpperCase()); setCouponError(""); }}
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void applyCouponCode(); } }}
                className="field min-w-0 flex-1"
                placeholder="Coupon code"
                aria-label="Coupon code"
              />
              <button type="button" disabled={!couponInput.trim() || couponBusy} onClick={() => void applyCouponCode()} className="shrink-0 rounded-xl border border-[#173279] bg-white px-4 text-xs font-extrabold text-[#173279] disabled:opacity-40">
                {couponBusy ? "..." : "Apply"}
              </button>
            </div>}
            {couponError && <p className="mt-2 text-xs font-bold text-[#995849]">{couponError}</p>}
          </div>

          <dl className="mt-3 shrink-0 space-y-2 border-t border-[#E5E7EB] pt-3 text-sm">
            <SummaryRow label="Subtotal" value={inr.format(totals.subtotal)} />
            {totals.discount > 0 && <SummaryRow label="Discount" value={`-${inr.format(totals.discount)}`} />}
            <SummaryRow label={taxMode === "GST" ? "GST" : "Tax"} value={inr.format(totals.tax)} />
            {tip > 0 && <SummaryRow label="Tip" value={inr.format(tip)} />}
          </dl>
          <div className="mt-3 flex shrink-0 items-baseline justify-between border-t border-[#E5E7EB] pt-3">
            <span className="text-sm font-extrabold">Total</span>
            <strong className="text-2xl font-extrabold text-[#173279]">{inr.format(grandTotal)}</strong>
          </div>
          <div className={`mt-3 flex shrink-0 items-center justify-between rounded-xl p-3 text-sm font-extrabold ${Math.abs(balanceDue) <= 0.01 ? "bg-[#e7f8f2] text-[#0f6f57]" : "bg-[#fff7df] text-[#865c12]"}`}>
            <span>{balanceDue > 0.01 ? "Still to collect" : balanceDue < -0.01 ? "Overpaid" : "Fully paid"}</span>
            <span>{inr.format(Math.abs(balanceDue))}</span>
          </div>
          <button
            type="button"
            disabled={Math.abs(balanceDue) > 0.01 || !cart.length || !customer}
            onClick={() => void checkout()}
            className="primary mt-4 w-full shrink-0 justify-center py-4 text-base disabled:cursor-not-allowed disabled:opacity-45"
          >
            <CreditCard size={18} /> Charge {inr.format(grandTotal)}
          </button>

          <div className="mt-2 grid shrink-0 grid-cols-2 gap-2">
            <button type="button" onClick={() => void holdSale()} className="rounded-xl border border-[#E5E7EB] bg-white py-2 text-xs font-extrabold text-[#6B7280] transition hover:bg-[#F6F7FB]">Hold</button>
            <button type="button" onClick={clearCurrentSale} className="rounded-xl border border-[#E5E7EB] bg-white py-2 text-xs font-extrabold text-[#6B7280] transition hover:bg-[#F6F7FB]">Clear</button>
          </div>
        </div>
      </aside>
      </div>
    </div>

    {/* Mobile has no room for three columns, so the bill lives in a sheet - but the total never
        leaves the thumb. */}
    {isMobile && <div className="fixed inset-x-0 bottom-[calc(4.6rem+env(safe-area-inset-bottom))] z-30 px-3">
      <div className="flex items-center gap-2 rounded-2xl bg-[#5B2A86] p-2 shadow-[0_18px_42px_rgba(91,42,134,.3)]">
        <button type="button" onClick={() => setCartOpen(true)} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-white">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/15 text-xs font-extrabold">{cartCount}</span>
          <span className="min-w-0">
            <span className="block truncate text-[11px] font-bold text-white/60">{cart.length ? "View bill" : "Nothing added"}</span>
            <strong className="block text-sm">{inr.format(grandTotal)}</strong>
          </span>
        </button>
        <button
          type="button"
          disabled={Math.abs(balanceDue) > 0.01 || !cart.length || !customer}
          onClick={() => void checkout()}
          className="shrink-0 rounded-xl bg-[#12916C] px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-40"
        >Charge</button>
      </div>
    </div>}

    {cartOpen && <PosSheet title="Cart" close={() => setCartOpen(false)}>
      <CartPanel
        cart={cart}
        taxMode={taxMode}
        totals={totals}
        tip={tip}
        grandTotal={grandTotal}
        describeLine={describeLine}
        onEdit={(line) => { setCartOpen(false); setEditingLine(line); }}
        onRemove={removeLine}
        onHold={() => { setCartOpen(false); void holdSale(); }}
        onClear={() => { setCartOpen(false); clearCurrentSale(); }}
        onContinue={() => { setCartOpen(false); void checkout(); }}
        canContinue={Math.abs(balanceDue) <= 0.01 && cart.length > 0 && Boolean(customer)}
        bare
      />
    </PosSheet>}

    {editingLine && <PosSheet title={editingLine.name} close={() => setEditingLine(null)}>
      <LineEditor
        line={editingLine}
        taxMode={taxMode}
        staffOptions={staffOptions}
        packages={editingLine.type === "SERVICE" ? packagesForService(editingLine.itemId) : []}
        onChange={(patch) => { updateLine(editingLine, patch); setEditingLine({ ...editingLine, ...patch }); }}
        onRemove={() => { removeLine(editingLine); setEditingLine(null); }}
        onDone={() => setEditingLine(null)}
      />
    </PosSheet>}

    {heldOpen && <PosSheet title="Held sales" close={() => setHeldOpen(false)}>
      {heldLoading ? <SlotMessage text="Loading held sales..." loading /> : heldSales.length ? <div className="space-y-3">
        {heldSales.map((draft) => <div key={draft.id} className={`rounded-2xl border p-4 ${activeDraftId === draft.id ? "border-[#16B994] bg-[#F7FAFC]" : "border-[#E5E7EB] bg-white"}`}>
          <p className="font-extrabold">{draft.title}</p>
          <p className="mt-1 text-xs text-[#737174]">{draft.customer?.phone || "No customer"} - {draft.cart.length} line(s) - {formatDateTime(draft.updatedAt)}</p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <strong>{inr.format(draft.total)}</strong>
            <div className="flex gap-2">
              <button type="button" onClick={() => restoreHeldSale(draft)} className="rounded-full bg-[#173279] px-3 py-1.5 text-xs font-extrabold text-white">Restore</button>
              <button type="button" onClick={() => setDiscarding(draft)} className="rounded-full border border-[#e9c2b9] bg-[#fff0ec] px-3 py-1.5 text-xs font-extrabold text-[#984f43]">Discard</button>
            </div>
          </div>
        </div>)}
      </div> : <Empty text="No held sales for this branch." />}
    </PosSheet>}

    {discarding && <PosSheet title="Discard held sale?" close={() => setDiscarding(null)}>
      <p className="text-sm font-semibold text-[#737174]">
        <strong className="text-[#1F2937]">{discarding.title}</strong> ({inr.format(discarding.total)}) will be removed. No invoice or stock is affected.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setDiscarding(null)} className="rounded-xl border border-[#E5E7EB] bg-white py-3 text-sm font-extrabold text-[#737174]">Keep it</button>
        <button type="button" onClick={() => void confirmDiscard()} className="rounded-xl bg-[#984f43] py-3 text-sm font-extrabold text-white">Discard</button>
      </div>
    </PosSheet>}
  </div>;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between">
    <dt className="text-[#737174]">{label}</dt>
    <dd className="font-bold">{value}</dd>
  </div>;
}

function BalanceTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F7FAFC] px-3 py-1.5 text-xs font-extrabold text-[#737174]">
    {icon}{label}
    <strong className="text-[#1F2937]">{value}</strong>
  </span>;
}

export function CartPanel({ cart, taxMode, totals, tip, grandTotal, describeLine, onEdit, onRemove, onHold, onClear, onContinue, canContinue, bare }: {
  cart: CartLine[];
  taxMode: "GST" | "NON_GST";
  totals: { subtotal: number; discount: number; tax: number; total: number };
  tip: number;
  grandTotal: number;
  /** Turns a cart line into the sentence reception would say out loud. */
  describeLine: (line: CartLine) => string;
  onEdit: (line: CartLine) => void;
  onRemove: (line: CartLine) => void;
  onHold: () => void;
  onClear: () => void;
  onContinue: () => void;
  canContinue: boolean;
  bare?: boolean;
}) {
  const body = <>
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
      {cart.map((line) => {
        const base = line.price * line.quantity;
        const lineDiscount = line.packagePurchaseId ? base : line.discount;
        const amounts = calculateTaxLine({ quantity: line.quantity, unitPrice: line.price, discount: lineDiscount, taxRate: line.taxRate, priceTaxMode: line.priceTaxMode, invoiceTaxMode: taxMode });
        return <button
          key={`${line.type}-${line.itemId}`}
          type="button"
          onClick={() => onEdit(line)}
          className="flex w-full items-start justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-card)] p-3 text-left transition hover:border-[var(--border-strong)]"
        >
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-medium text-[var(--text-primary)]">{line.name}</span>
            {/* Reads out loud: "2 times · with Priya", "2 × 200ml · L'Oreal", "Free with their
                package". Never "x2", and never a fake discount equal to the price. */}
            <span className={`mt-0.5 block truncate text-[13px] ${line.packagePurchaseId ? "text-[var(--success-text)]" : "text-[var(--text-secondary)]"}`}>
              {describeLine(line)}
              {!line.packagePurchaseId && line.discount > 0 && <span className="text-[var(--warning-text)]"> · {inr.format(line.discount)} off</span>}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <strong className={`block text-[15px] tabular-nums ${line.packagePurchaseId ? "text-[var(--success-text)]" : "text-[var(--text-primary)]"}`}>
              {line.packagePurchaseId ? "Free" : inr.format(amounts.total)}
            </strong>
            <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">Change</span>
          </span>
        </button>;
      })}
      {!cart.length && <Empty text="Tap an item to add it." />}
    </div>

    {cart.length > 0 && <div className="shrink-0">
      <dl className="mt-4 space-y-1.5 border-t border-[#E5E7EB] pt-3 text-sm">
        <SummaryRow label="Subtotal" value={inr.format(totals.subtotal)} />
        {totals.discount > 0 && <SummaryRow label="Discount" value={`-${inr.format(totals.discount)}`} />}
        <SummaryRow label={taxMode === "GST" ? "GST" : "Tax"} value={inr.format(totals.tax)} />
        {tip > 0 && <SummaryRow label="Tip" value={inr.format(tip)} />}
      </dl>
      <div className="mt-3 flex items-baseline justify-between border-t border-[#E5E7EB] pt-3">
        <span className="text-sm font-extrabold">Total</span>
        <strong className="text-2xl font-extrabold text-[#173279]">{inr.format(grandTotal)}</strong>
      </div>
    </div>}

    {/* One action, in words reception would use. Not "Continue to payment" - "Take payment". */}
    <button type="button" disabled={!canContinue} onClick={onContinue} className="primary mt-4 h-12 w-full shrink-0 justify-center text-base disabled:cursor-not-allowed disabled:opacity-45">
      Take payment <ChevronRight size={16} />
    </button>
    <div className="mt-2 grid shrink-0 grid-cols-2 gap-2">
      <button type="button" onClick={onHold} className="rounded-xl border border-[#E5E7EB] bg-white py-2.5 text-xs font-extrabold text-[#7b5514]">Hold sale</button>
      <button type="button" onClick={onClear} className="rounded-xl border border-[#E5E7EB] bg-white py-2.5 text-xs font-extrabold text-[#737174]">Clear</button>
    </div>
  </>;

  if (bare) return <div className="flex max-h-[70svh] flex-col">{body}</div>;
  return <div className="flex h-full flex-col rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
    <div className="mb-3 flex shrink-0 items-center justify-between">
      <h3 className="text-sm font-extrabold text-[#1F2937]">Cart</h3>
      <span className="text-xs font-semibold text-[#737174]">{cart.length} line{cart.length === 1 ? "" : "s"}</span>
    </div>
    {body}
  </div>;
}

export function LineEditor({ line, taxMode, staffOptions, packages, onChange, onRemove, onDone }: {
  line: CartLine;
  taxMode: "GST" | "NON_GST";
  staffOptions: Array<{ value: string; label: string; description?: string }>;
  packages: Array<{ id: string; name: string; balance: unknown; expiresAt: string }>;
  onChange: (patch: Partial<CartLine>) => void;
  onRemove: () => void;
  onDone: () => void;
}) {
  const base = line.price * line.quantity;
  const amounts = calculateTaxLine({
    quantity: line.quantity,
    unitPrice: line.price,
    discount: line.packagePurchaseId ? base : line.discount,
    taxRate: line.taxRate,
    priceTaxMode: line.priceTaxMode,
    invoiceTaxMode: taxMode,
  });

  return <div className="space-y-4">
    <div className="flex items-center justify-between rounded-2xl bg-[#F7FAFC] p-3">
      <span className="text-xs font-extrabold uppercase tracking-[.12em] text-[#737174]">Quantity</span>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => onChange({ quantity: Math.max(1, line.quantity - 1) })} className="grid size-9 place-items-center rounded-full border border-[#E5E7EB] bg-white text-lg font-extrabold" aria-label="Decrease quantity">-</button>
        <strong className="w-8 text-center text-lg">{line.quantity}</strong>
        <button type="button" onClick={() => onChange({ quantity: line.quantity + 1 })} className="grid size-9 place-items-center rounded-full border border-[#E5E7EB] bg-white text-lg font-extrabold" aria-label="Increase quantity">+</button>
      </div>
    </div>

    {packages.length > 0 && <div className="rounded-2xl border border-[#a8ead8] bg-[#e7f8f2] p-3">
      <p className="text-xs font-extrabold text-[#0f6f57]">Customer has a package covering this</p>
      <div className="mt-2 grid gap-2">
        {packages.map((item) => <button
          key={item.id}
          type="button"
          onClick={() => onChange({ packagePurchaseId: line.packagePurchaseId === item.id ? undefined : item.id, discount: 0 })}
          className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-extrabold transition ${line.packagePurchaseId === item.id ? "bg-[#0f6f57] text-white" : "bg-white text-[#0f6f57]"}`}
        >
          <span className="min-w-0 truncate">{item.name}</span>
          {line.packagePurchaseId === item.id ? <CheckCircle2 size={15} className="shrink-0" /> : <span className="shrink-0">Use</span>}
        </button>)}
      </div>
    </div>}

    {!line.packagePurchaseId && <label className="block text-xs font-bold text-[#737174]">
      Discount on this line
      <input className="field mt-1" type="number" min="0" max={base} value={line.discount || ""} onChange={(event) => onChange({ discount: Math.min(base, Math.max(0, Number(event.target.value))) })} placeholder="0" />
    </label>}

    {line.type === "SERVICE" && <WorkspaceSelect label="Performed by" value={line.staffId || ""} onChange={(value) => onChange({ staffId: value || undefined })} options={staffOptions} />}

    <div className="rounded-2xl bg-[#F7FAFC] p-3">
      <div className="flex justify-between text-sm">
        <span className="font-bold text-[#737174]">Line total</span>
        <strong className="text-[#173279]">{inr.format(amounts.total)}</strong>
      </div>
      {taxMode === "GST" && <p className="mt-1 text-[11px] font-semibold text-[#737174]">
        Includes {inr.format(amounts.tax)} GST at {line.taxRate}% ({line.priceTaxMode === "INCLUSIVE" ? "in price" : "added"})
      </p>}
    </div>

    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={onRemove} className="rounded-xl border border-[#e9c2b9] bg-[#fff0ec] py-3 text-sm font-extrabold text-[#984f43]">Remove line</button>
      <button type="button" onClick={onDone} className="primary justify-center">Done</button>
    </div>
  </div>;
}

export function PosSheet({ title: heading, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  useEffect(() => { setPortalRoot(document.body); }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("keydown", closeOnEscape);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previous;
    };
  }, [close]);

  const sheet = <div
    className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4"
    onPointerDown={(event) => event.target === event.currentTarget && close()}
    role="dialog"
    aria-modal="true"
    aria-label={heading}
  >
    <section className="mobile-bottom-sheet flex max-h-[88svh] w-full flex-col overflow-hidden rounded-t-[1.75rem] bg-white shadow-2xl sm:max-w-lg sm:rounded-[1.75rem]">
      <div className="mx-auto my-3 h-1.5 w-12 shrink-0 rounded-full bg-black/12 sm:hidden" />
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-black/6 px-5 pb-3 pt-1 sm:pt-5">
        <h3 className="truncate text-base font-extrabold text-[#1F2937]">{heading}</h3>
        <button type="button" onClick={close} className="grid size-9 shrink-0 place-items-center rounded-full bg-[#F7FAFC]" aria-label="Close"><X size={17} /></button>
      </div>
      <div className="mobile-bottom-sheet-body min-h-0 flex-1 px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 sm:pb-5">
        {children}
      </div>
    </section>
  </div>;

  return portalRoot ? createPortal(sheet, portalRoot) : null;
}
