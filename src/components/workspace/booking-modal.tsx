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
import { displayPrice } from "@/lib/billing";
import type { AppointmentDetail, CustomerProfile, ServiceProfile, WorkspaceData } from "@/lib/operations-types";

import { getAvailableSlots, getBookingOptions } from "@/components/workspace/booking-api";
import { CustomerPicker } from "@/components/workspace/customer/customer-picker";
import type { CustomerChoice } from "@/components/workspace/customer/types";
import { BookingSeed, SubmitFn } from "@/components/workspace/contracts";
import { SlotMessage, Step, Summary, WorkspaceDateInput, WorkspaceSelect, formatTime, title, toIndiaTimeInput } from "@/components/workspace/shared-ui";

export type BookingOptions = {
  branch: { id: string; name: string; timezone: string; operatingHours: Array<{ dayOfWeek: number; opensAt: string; closesAt: string; isClosed: boolean }> };
  categories: Array<{ id: string; name: string; color: string | null; icon: string | null; sortOrder: number }>;
  services: Array<{ id: string; name: string; category: string; categoryId: string | null; durationMinutes: number; price: number; taxRate: number; priceTaxMode: "EXCLUSIVE" | "INCLUSIVE"; isActive: boolean }>;
  staff: Array<{ id: string; name: string; role: string; serviceIds: string[] }>;
  resources: Array<{ id: string; name: string; type: string }>;
};

export function AppointmentModalV2({ data, busy, error, bookingSeed, close, submit }: { data: WorkspaceData; busy: boolean; error: string; bookingSeed: BookingSeed; close: () => void; submit: SubmitFn }) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const [branchId, setBranchId] = useState(bookingSeed.branchId || data.identity.branchId || "");
  const [options, setOptions] = useState<BookingOptions | null>(null);
  const [customer, setCustomer] = useState<CustomerChoice | null>(data.customers.find((item) => item.id === bookingSeed.customerId) || null);
  const [lines, setLines] = useState<Array<{ serviceId: string; staffId: string }>>([]);
  const [date, setDate] = useState(bookingSeed.date || today);
  const [selectedSlot, setSelectedSlot] = useState(bookingSeed.startsAt?.includes("T") ? bookingSeed.startsAt : bookingSeed.startsAt ? new Date(`${bookingSeed.date || today}T${bookingSeed.startsAt}:00+05:30`).toISOString() : "");
  const [waitlistMode, setWaitlistMode] = useState(false);
  const [waitlistTime, setWaitlistTime] = useState(bookingSeed.startsAt?.includes("T") ? toIndiaTimeInput(bookingSeed.startsAt) : bookingSeed.startsAt || "10:00");
  const [source, setSource] = useState<"WALK_IN" | "PHONE" | "STAFF_CREATED">(bookingSeed.source || "WALK_IN");
  const [resourceId, setResourceId] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<"DAILY" | "WEEKLY" | "MONTHLY">("WEEKLY");
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [recurrenceOccurrences, setRecurrenceOccurrences] = useState(4);
  const [notes, setNotes] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotError, setSlotError] = useState("");
  const [serviceQuery, setServiceQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");

  useEffect(() => {
    if (!branchId) return;
    queueMicrotask(() => setLoadingOptions(true));
    getBookingOptions<BookingOptions>(branchId)
      .then(setOptions)
      .catch((loadError) => setSlotError(loadError instanceof Error ? loadError.message : "Unable to load booking options"))
      .finally(() => setLoadingOptions(false));
  }, [branchId]);

  useEffect(() => {
    if (!branchId || !lines.length || !date) {
      queueMicrotask(() => setSlots([]));
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({
      branchId,
      serviceId: lines[0].serviceId,
      date,
      ...(resourceId ? { resourceId } : {}),
      serviceLines: JSON.stringify(lines.map((line) => ({ serviceId: line.serviceId, staffId: line.staffId || null }))),
    });
    queueMicrotask(() => {
      setLoadingSlots(true);
      setSlotError("");
    });
    getAvailableSlots(params, controller.signal)
      .then((result) => {
        setSlots(result.slots);
        if (!waitlistMode && selectedSlot && !result.slots.includes(selectedSlot)) setSelectedSlot("");
      })
      .catch((loadError) => {
        if (!(loadError instanceof DOMException && loadError.name === "AbortError")) setSlotError(loadError instanceof Error ? loadError.message : "Unable to load available times");
      })
      .finally(() => setLoadingSlots(false));
    return () => controller.abort();
  }, [branchId, date, lines, resourceId, selectedSlot, waitlistMode]);

  function addService(serviceId: string) {
    setLines((current) => [...current, { serviceId, staffId: current.length === 0 ? bookingSeed.staffId || "" : "" }]);
    setSelectedSlot("");
    setWaitlistMode(false);
  }

  function removeOneService(serviceId: string) {
    setLines((current) => {
      let removeIndex = -1;
      for (let index = current.length - 1; index >= 0; index -= 1) {
        if (current[index]?.serviceId === serviceId) {
          removeIndex = index;
          break;
        }
      }
      if (removeIndex < 0) return current;
      return current.filter((_, index) => index !== removeIndex);
    });
    setSelectedSlot("");
    setWaitlistMode(false);
  }

  function handleServiceCardKeyDown(event: React.KeyboardEvent<HTMLDivElement>, serviceId: string) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    addService(serviceId);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const waitlistDate = waitlistMode && waitlistTime ? new Date(`${date}T${waitlistTime}:00+05:30`) : null;
    const startsAt = waitlistMode ? waitlistDate?.toISOString() : selectedSlot;
    if (waitlistMode && (!waitlistDate || Number.isNaN(waitlistDate.getTime()))) return setSlotError("Select a valid preferred waitlist time.");
    if (!customer || !lines.length || !startsAt) return setSlotError("Select a customer, at least one service, and an available time.");
    await submit("/api/v1/operations/appointments", {
      branchId,
      customerId: customer.id,
      serviceId: lines[0].serviceId,
      staffId: lines[0].staffId || undefined,
      resourceId: resourceId || undefined,
      serviceLines: lines.map((line) => ({ serviceId: line.serviceId, staffId: line.staffId || null })),
      startsAt,
      source,
      status: waitlistMode ? "WAITLISTED" : "CONFIRMED",
      notes: notes || undefined,
      recurrence: recurring ? { frequency: recurrenceFrequency, interval: recurrenceInterval, occurrences: recurrenceOccurrences } : undefined,
      idempotencyKey: `appointment-${newId()}`,
    }, recurring ? "Recurring appointments created." : waitlistMode ? "Appointment added to waitlist." : "Appointment created.");
  }

  const selectedServices = lines.map((line) => ({ ...line, service: options?.services.find((service) => service.id === line.serviceId) })).filter((line) => line.service);
  const totalDuration = selectedServices.reduce((sum, line) => sum + (line.service?.durationMinutes || 0), 0);
  const totalPrice = selectedServices.reduce((sum, line) => sum + (line.service ? displayPrice(line.service.price, line.service.taxRate, line.service.priceTaxMode) : 0), 0);
  const filteredServices = options?.services.filter((service) => (!categoryId || service.categoryId === categoryId) && `${service.name} ${service.category}`.toLowerCase().includes(serviceQuery.toLowerCase())) || [];
  const serviceQuantities = selectedServices.reduce<Record<string, number>>((counts, line) => {
    counts[line.serviceId] = (counts[line.serviceId] || 0) + 1;
    return counts;
  }, {});
  const requiresBranchSelection = data.identity.scope !== "branch";
  const appointmentBranchOptions = data.identity.branches
    .filter((branch) => !data.identity.selectedBranchIds.length || data.identity.selectedBranchIds.includes(branch.id))
    .map((branch) => ({ value: branch.id, label: branch.name, description: branch.city }));

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-0 backdrop-blur-sm sm:grid sm:place-items-center sm:p-5"><form onSubmit={save} className="max-h-[92svh] w-full max-w-6xl overflow-y-auto rounded-t-[2rem] bg-[#fbfdff] pb-[env(safe-area-inset-bottom)] shadow-2xl sm:max-h-[94vh] sm:rounded-[2rem] sm:pb-0">
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/6 bg-white/95 px-5 py-4 backdrop-blur-xl sm:px-7"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#1969A2]">{options?.branch.name || "Reception booking"}</p><h2 className="font-serif text-2xl font-semibold">Create appointment</h2></div><button type="button" onClick={close} className="grid size-10 place-items-center rounded-full bg-[#F7FAFC]"><X size={18} /></button></div>
    <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_320px]"><div className="space-y-7">
      {requiresBranchSelection && <section><Step number="1" title="Choose branch" /><WorkspaceSelect className="mt-4" required value={branchId} onChange={(value) => { setBranchId(value); setLines([]); setSelectedSlot(""); }} placeholder="Select branch" options={appointmentBranchOptions} /></section>}
      {!branchId ? <SlotMessage text="Choose a branch to load customers, services, professionals, and available times." /> : loadingOptions ? <SlotMessage text="Loading branch catalogue..." loading /> : options && <>
        <section><Step number={requiresBranchSelection ? "2" : "1"} title="Customer and source" /><div className="mt-4 grid gap-4 md:grid-cols-[1fr_300px]"><CustomerPicker branchId={branchId} value={customer?.id || ""} initialCustomers={data.customers} onChange={setCustomer} submit={submit} /><div className="grid grid-cols-3 gap-2">{(["WALK_IN", "PHONE", "STAFF_CREATED"] as const).map((value) => <button type="button" key={value} onClick={() => setSource(value)} className={`rounded-xl border px-2 text-xs font-bold ${source === value ? "border-[#173279] bg-[#173279] text-white" : "border-black/10 bg-white"}`}>{title(value)}</button>)}</div></div></section>
        <section>
          <Step number={requiresBranchSelection ? "3" : "2"} title="Services and professionals" />
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => setCategoryId("")} className={`rounded-full px-3 py-1.5 text-xs font-bold ${!categoryId ? "bg-[#173279] text-white" : "bg-white"}`}>All</button>
            {options.categories.map((category) => <button type="button" key={category.id} onClick={() => setCategoryId(category.id)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${categoryId === category.id ? "bg-[#173279] text-white" : "bg-white"}`}>{category.name}</button>)}
          </div>
          <input className="field mt-3" value={serviceQuery} onChange={(event) => setServiceQuery(event.target.value)} placeholder="Search services" />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {filteredServices.map((service) => {
              const quantity = serviceQuantities[service.id] || 0;
              return <div
                key={service.id}
                role="button"
                tabIndex={0}
                aria-pressed={quantity > 0}
                onClick={() => addService(service.id)}
                onKeyDown={(event) => handleServiceCardKeyDown(event, service.id)}
                className={`cursor-pointer rounded-2xl border bg-white p-4 shadow-sm outline-none transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-[#6D28D9] ${quantity ? "border-[#6D28D9] ring-2 ring-[#EDE9FE]" : "border-black/8 hover:border-[#1969A2]"}`}
              >
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="font-bold">{service.name}</p>
                    <p className="mt-1 text-xs text-[#737174]">{service.category} - {service.durationMinutes} minutes</p>
                  </div>
                  <span className="text-right"><strong className="block">{inr.format(displayPrice(service.price, service.taxRate, service.priceTaxMode))}</strong><small className="text-[10px] font-bold text-[#737174]">{service.taxRate ? `GST ${service.priceTaxMode === "INCLUSIVE" ? "included" : "extra"}` : "No GST"}</small></span>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-black/6 pt-3">
                  <span className={`rounded-full px-3 py-1 text-[11px] font-extrabold ${quantity ? "bg-[#F3E8FF] text-[#6D28D9]" : "bg-[#F7FAFC] text-[#737174]"}`}>
                    {quantity ? `${quantity} selected` : "Not selected"}
                  </span>
                  <div className="flex items-center gap-2" aria-label={`${service.name} quantity`}>
                    {quantity > 0 && <button type="button" onKeyDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); removeOneService(service.id); }} aria-label={`Remove one ${service.name}`} className="grid size-8 place-items-center rounded-full bg-[#FEE2E2] text-base font-black text-[#DC2626] shadow-sm transition hover:bg-[#FCA5A5] hover:text-white">-</button>}
                    {quantity > 0 && <span className="min-w-7 text-center text-sm font-black text-[#111827]">{quantity}</span>}
                    <button type="button" onKeyDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); addService(service.id); }} aria-label={`Add one ${service.name}`} className="grid size-8 place-items-center rounded-full bg-[#DCFCE7] text-base font-black text-[#16A34A] shadow-sm transition hover:bg-[#16A34A] hover:text-white">+</button>
                  </div>
                </div>
              </div>;
            })}
          </div>
          {selectedServices.length > 0 && <div className="mt-4 rounded-2xl border border-black/8 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between gap-3 px-1">
              <p className="text-xs font-extrabold uppercase tracking-[.14em] text-[#6D28D9]">Selected services</p>
              <span className="rounded-full bg-[#F3E8FF] px-3 py-1 text-xs font-black text-[#6D28D9]">{selectedServices.length} total</span>
            </div>
            <div className="mt-3 space-y-2">
              {selectedServices.map((line, index) => <div key={`${line.serviceId}-${index}`} className="grid gap-2 rounded-2xl bg-[#F7FAFC] p-3 sm:grid-cols-[1fr_240px_auto] sm:items-center">
                <div>
                  <strong className="text-sm">{index + 1}. {line.service!.name}</strong>
                  <p className="text-xs text-[#737174]">{line.service!.durationMinutes} min - {inr.format(line.service!.price)}</p>
                </div>
                <WorkspaceSelect value={line.staffId} onChange={(staffValue) => { setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, staffId: staffValue } : item)); setSelectedSlot(""); }} options={[{ value: "", label: "Any qualified professional" }, ...options.staff.filter((member) => member.serviceIds.includes(line.serviceId)).map((member) => ({ value: member.id, label: member.name, description: member.role }))]} compact />
                <button type="button" onClick={() => setLines((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-full px-3 py-2 text-xs font-bold text-[#995849] transition hover:bg-[#FEE2E2] hover:text-[#DC2626]">Remove</button>
              </div>)}
            </div>
          </div>}
        </section>
        <section><Step number={requiresBranchSelection ? "4" : "3"} title="Date, resource and available time" /><div className="mt-4 grid gap-3 sm:grid-cols-2"><WorkspaceDateInput min={today} value={date} onChange={(value) => { setDate(value); setSelectedSlot(""); setWaitlistMode(false); }} /><WorkspaceSelect value={resourceId} onChange={(value) => { setResourceId(value); setSelectedSlot(""); }} options={[{ value: "", label: "No room/resource required" }, ...options.resources.map((resource) => ({ value: resource.id, label: resource.name, description: title(resource.type) }))]} /></div><div className="mt-4">{!lines.length ? <SlotMessage text="Add at least one service to see available times." /> : loadingSlots ? <SlotMessage text="Checking every selected professional and resource..." loading /> : slotError ? <SlotMessage text={slotError} error /> : slots.length ? <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{slots.map((slot) => <button type="button" key={slot} onClick={() => { setWaitlistMode(false); setSelectedSlot(slot); }} className={`rounded-xl border px-3 py-3 text-sm font-bold ${selectedSlot === slot && !waitlistMode ? "border-[#1969A2] bg-[#1969A2] text-white" : "border-black/10 bg-white"}`}>{formatTime(slot)}</button>)}</div> : <SlotMessage text="No sequential slot is available for all selected services and selected resource." />}</div><div className="mt-4 grid gap-3 rounded-2xl border border-[#ead39c] bg-[#F7FAFC] p-4"><label className="flex items-start gap-3 text-sm font-bold text-[#725316]"><input type="checkbox" className="mt-1" checked={waitlistMode} onChange={(event) => { setWaitlistMode(event.target.checked); if (event.target.checked) setSelectedSlot(""); }} />Add to waitlist instead of confirmed calendar booking</label>{waitlistMode && <div className="grid gap-2 sm:grid-cols-[180px_1fr] sm:items-center"><input className="field" type="time" required value={waitlistTime} onChange={(event) => setWaitlistTime(event.target.value)} /><p className="text-xs font-semibold text-[#7c5a1e]">This saves a preferred time without blocking staff or resource capacity. Confirming later will recheck availability.</p></div>}<label className="flex items-start gap-3 text-sm font-bold text-[#725316]"><input type="checkbox" className="mt-1" checked={recurring} onChange={(event) => setRecurring(event.target.checked)} />Repeat this appointment</label>{recurring && <div className="grid gap-2 sm:grid-cols-3"><WorkspaceSelect value={recurrenceFrequency} onChange={(value) => setRecurrenceFrequency(value as typeof recurrenceFrequency)} options={[{ value: "DAILY", label: "Daily" }, { value: "WEEKLY", label: "Weekly" }, { value: "MONTHLY", label: "Monthly" }]} /><input className="field" type="number" min="1" max="12" value={recurrenceInterval} onChange={(event) => setRecurrenceInterval(Number(event.target.value))} /><input className="field" type="number" min="2" max="30" value={recurrenceOccurrences} onChange={(event) => setRecurrenceOccurrences(Number(event.target.value))} /></div>}</div></section>
        <section><Step number={requiresBranchSelection ? "5" : "4"} title="Notes" /><textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="field mt-4 min-h-24" placeholder="Preferences, allergies, or internal notes" maxLength={500} /></section>
      </>}
    </div><aside className="h-fit rounded-3xl bg-[#173279] p-6 text-white lg:sticky lg:top-24"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#16B994]">Appointment summary</p><h3 className="mt-4 font-serif text-2xl">{selectedServices.length ? `${selectedServices.length} service${selectedServices.length === 1 ? "" : "s"}` : "Choose services"}</h3><div className="mt-5 space-y-4 border-y border-white/10 py-5 text-sm"><Summary label="Customer" value={customer?.name || "Not selected"} /><Summary label="Date" value={date} /><Summary label="Time" value={waitlistMode ? `${waitlistTime} waitlist` : selectedSlot ? formatTime(selectedSlot) : "Not selected"} /><Summary label="Resource" value={options?.resources.find((resource) => resource.id === resourceId)?.name || "Not required"} /><Summary label="Repeat" value={recurring ? `${recurrenceOccurrences} ${recurrenceFrequency.toLowerCase()} bookings` : "No"} /><Summary label="Duration" value={totalDuration ? `${totalDuration} minutes` : " - "} /></div><div className="mt-5 flex items-end justify-between"><span className="text-sm text-white/55">Estimated price</span><strong className="text-2xl">{inr.format(totalPrice)}</strong></div>{error && <p className="mt-4 rounded-xl bg-[#f2ded8] p-3 text-sm font-bold text-[#995849]">{error}</p>}<button disabled={busy || !branchId || !customer || !lines.length || (!selectedSlot && !waitlistMode)} className="mt-6 w-full rounded-full bg-[#1789AA] py-3.5 text-sm font-bold disabled:opacity-40">{busy ? "Saving..." : recurring ? "Create recurring appointments" : waitlistMode ? "Add to waitlist" : "Confirm appointment"}</button><p className="mt-3 text-center text-xs text-white/45">{waitlistMode ? "Waitlisted bookings do not block capacity until confirmed." : "Availability is rechecked transactionally before saving."}</p></aside></div>
  </form></div>;
}
