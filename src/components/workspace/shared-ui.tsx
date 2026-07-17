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

import { AppointmentItem, NavItem, WorkspaceOption, navItems } from "@/components/workspace/contracts";
import { Overview } from "@/components/workspace/modules/overview";

export function Card({ title: heading, action, children, className = "" }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`surface-card module-card min-w-0 overflow-hidden rounded-lg border border-[#E8EAF0] bg-white p-4 ${className}`}>
    <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
      <h2 className="min-w-0 truncate text-base font-semibold tracking-tight text-[#171717]">{heading}</h2>
      {action && <div className="flex min-w-0 shrink-0 flex-wrap gap-2">{action}</div>}
    </div>
    {children}
  </section>;
}

export function MiniBars({ items, money }: { items: Array<{ label: string; value: number }>; money?: boolean }) {
  const maximum = Math.max(...items.map((item) => item.value), 1);
  return <div className="space-y-3">{items.length ? items.map((item) => <div key={item.label} className="grid grid-cols-[minmax(72px,96px)_minmax(0,1fr)_auto] items-center gap-3 text-xs sm:grid-cols-[100px_minmax(0,1fr)_auto]"><span className="truncate font-bold">{title(item.label)}</span><div className="h-2.5 overflow-hidden rounded-full bg-[#E5E7EB]"><div className="h-full rounded-full bg-gradient-to-r from-[#16B994] via-[#1789AA] to-[#1969A2]" style={{ width: `${Math.max(4, item.value / maximum * 100)}%` }} /></div><strong className="whitespace-nowrap">{money ? inr.format(item.value) : item.value}</strong></div>) : <Empty text="No data for this period." />}</div>;
}

/**
 * True below the lg breakpoint, where the workspace switches to its app shell.
 * Drives presentation only - the same component renders a desktop popover or a
 * native-feeling bottom sheet from one API.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1023px)");
    const sync = () => setIsMobile(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return isMobile;
}

/**
 * Option picker as a bottom sheet: thumb-reachable, 48px rows, a drag handle, and a
 * scrim - the pattern people expect from a phone app. Replaces the desktop dropdown,
 * which clipped inside scrolling filter rows and had sub-44px touch targets.
 */
export function WorkspaceSheetPicker({ title: heading, options, selectedValue, close, choose }: {
  title: string;
  options: WorkspaceOption[];
  selectedValue: string;
  close: () => void;
  choose: (value: string) => void;
}) {
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  useEffect(() => { setPortalRoot(document.body); }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [close]);

  const sheet = <div
    className="fixed inset-0 z-[80] flex items-end overflow-hidden bg-black/40 backdrop-blur-sm lg:hidden"
    onPointerDown={(event) => event.target === event.currentTarget && close()}
    role="dialog"
    aria-modal="true"
    aria-label={heading}
  >
    <section className="mobile-bottom-sheet flex w-full flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl">
      <div className="mx-auto my-3 h-1.5 w-12 shrink-0 rounded-full bg-black/15" />
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-black/6 px-5 pb-3">
        <h3 className="truncate text-base font-extrabold text-[#1F2937]">{heading}</h3>
        <button type="button" onClick={close} className="grid size-9 shrink-0 place-items-center rounded-full bg-[#F7FAFC]" aria-label="Close">
          <X size={17} />
        </button>
      </div>
      <div className="mobile-bottom-sheet-body min-h-0 flex-1 px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2" role="listbox">
        {options.map((option) => {
          const isSelected = option.value === selectedValue;
          return <button
            key={option.value || option.label}
            type="button"
            role="option"
            aria-selected={isSelected}
            disabled={option.disabled}
            onClick={() => choose(option.value)}
            className={`flex min-h-[52px] w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-45 ${isSelected ? "bg-[#5B2A86] text-white" : "text-[#1F2937] active:bg-[#F7FAFC]"}`}
          >
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-bold">{option.label}</span>
              {option.description && <span className={`mt-0.5 block truncate text-xs font-semibold ${isSelected ? "text-white/70" : "text-[#737174]"}`}>{option.description}</span>}
            </span>
            {isSelected && <CheckCircle2 size={18} className="shrink-0 text-white" />}
          </button>;
        })}
      </div>
    </section>
  </div>;

  return portalRoot ? createPortal(sheet, portalRoot) : null;
}

export function WorkspaceSelect({
  name,
  label,
  ariaLabel,
  value,
  defaultValue = "",
  options,
  placeholder = "Select",
  helper,
  required,
  disabled,
  compact,
  dark,
  className = "",
  onChange,
}: {
  name?: string;
  label?: string;
  ariaLabel?: string;
  value?: string;
  defaultValue?: string;
  options: WorkspaceOption[];
  placeholder?: string;
  helper?: string;
  required?: boolean;
  disabled?: boolean;
  compact?: boolean;
  dark?: boolean;
  className?: string;
  onChange?: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const selectedValue = value ?? internalValue;
  const selected = options.find((option) => option.value === selectedValue);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!open || isMobile) return;
    // pointerdown, not mousedown: it fires for touch and pen as well as mouse.
    const closeOnOutside = (event: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, [open, isMobile]);

  // Lock the page behind an open sheet so the list scrolls, not the workspace under it.
  useEffect(() => {
    if (!open || !isMobile) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open, isMobile]);

  function choose(nextValue: string) {
    if (value === undefined) setInternalValue(nextValue);
    onChange?.(nextValue);
    setOpen(false);
  }

  function keyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen((current) => !current);
    }
    if (event.key === "Escape") setOpen(false);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      const enabled = options.filter((option) => !option.disabled);
      const currentIndex = enabled.findIndex((option) => option.value === selectedValue);
      choose(enabled[Math.min(enabled.length - 1, currentIndex + 1)]?.value || enabled[0]?.value || "");
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      const enabled = options.filter((option) => !option.disabled);
      const currentIndex = enabled.findIndex((option) => option.value === selectedValue);
      choose(enabled[Math.max(0, currentIndex - 1)]?.value || enabled[0]?.value || "");
    }
  }

  const control = <div ref={wrapperRef} className={`workspace-control relative ${className}`}>
    {name && <input type="hidden" name={name} value={selectedValue} />}
    <button
      type="button"
      disabled={disabled}
      onClick={() => setOpen((current) => !current)}
      onKeyDown={keyDown}
      className={`workspace-select-button flex w-full items-center justify-between gap-3 rounded-2xl border text-left font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16B994] disabled:cursor-not-allowed disabled:opacity-55 ${compact ? "px-3 py-2.5 text-xs" : "px-4 py-3 text-sm"} ${dark ? "border-white/10 bg-white/10 text-white hover:bg-white/14" : "border-[#DDE7EF] bg-white text-[#1F2937] shadow-sm hover:border-[#16B994]/45 hover:bg-[#FBFEFF]"}`}
      aria-label={ariaLabel || label || placeholder}
      aria-expanded={open}
      aria-haspopup="listbox"
    >
      <span className="min-w-0">
        <span className={`block truncate ${selected ? "" : dark ? "text-white/55" : "text-[#737174]"}`}>{selected?.label || placeholder}{required && !selected ? " *" : ""}</span>
        {selected?.description && !compact && <span className={`mt-0.5 block truncate text-[11px] font-semibold ${dark ? "text-white/48" : "text-[#737174]"}`}>{selected.description}</span>}
      </span>
      <ChevronRight size={15} className={`shrink-0 transition ${open ? "rotate-90" : ""} ${dark ? "text-[#16B994]" : "text-[#1789AA]"}`} />
    </button>
    {open && !isMobile && <div className={`workspace-popover absolute z-[70] mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border p-1.5 shadow-[0_22px_70px_rgba(23,50,121,.18)] ${dark ? "border-white/10 bg-[#10245f] text-white" : "border-[#DDE7EF] bg-white text-[#1F2937]"}`} role="listbox">
      {options.map((option) => {
        const selectedOption = option.value === selectedValue;
        return <button key={option.value || option.label} type="button" disabled={option.disabled} onClick={() => choose(option.value)} className={`flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-45 ${selectedOption ? "workspace-selected-purple bg-[#5B2A86] text-white" : dark ? "text-white/72 hover:bg-white/10 hover:text-white" : "text-[#1F2937] hover:bg-[#F7FAFC]"}`}>
          <span className="min-w-0">
            <span className="block truncate">{option.label}</span>
            {option.description && <span className={`mt-0.5 block truncate text-[11px] font-semibold ${selectedOption ? "text-white/70" : dark ? "text-white/45" : "text-[#737174]"}`}>{option.description}</span>}
          </span>
          {selectedOption && <CheckCircle2 size={15} className="shrink-0 text-white" />}
        </button>;
      })}
    </div>}
    {open && isMobile && <WorkspaceSheetPicker
      title={label || ariaLabel || placeholder}
      options={options}
      selectedValue={selectedValue}
      close={() => setOpen(false)}
      choose={choose}
    />}
  </div>;

  if (!label) return control;
  return <label className="block text-sm font-bold text-[#1F2937]">
    <span className="mb-2 flex items-center gap-1">{label}{required === false && <span className="text-xs font-semibold text-[#737174]">Optional</span>}</span>
    {control}
    {helper && <span className="mt-1.5 block text-xs font-semibold leading-5 text-[#737174]">{helper}</span>}
  </label>;
}

export function WorkspaceDateInput({
  name,
  label,
  value,
  defaultValue = "",
  min,
  required,
  helper,
  className = "",
  onChange,
}: {
  name?: string;
  label?: string;
  value?: string;
  defaultValue?: string;
  min?: string;
  required?: boolean;
  helper?: string;
  className?: string;
  onChange?: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selectedValue = value ?? internalValue;
  const [viewDate, setViewDate] = useState(() => inputDateToDate(selectedValue || todayInputDate()));
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutside);
    return () => document.removeEventListener("mousedown", closeOnOutside);
  }, [open]);

  useEffect(() => {
    if (selectedValue) setViewDate(inputDateToDate(selectedValue));
  }, [selectedValue]);

  function choose(nextValue: string) {
    if (min && nextValue < min) return;
    if (value === undefined) setInternalValue(nextValue);
    onChange?.(nextValue);
    setOpen(false);
  }

  const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const days = Array.from({ length: 42 }, (_, index) => new Date(viewDate.getFullYear(), viewDate.getMonth(), index - monthStart.getDay() + 1));
  const display = selectedValue ? formatDate(inputDateToDate(selectedValue)) : "Choose date";
  const content = <div ref={wrapperRef} className={`workspace-control relative ${className}`}>
    {name && <input type="hidden" name={name} value={selectedValue} />}
    <button type="button" onClick={() => setOpen((current) => !current)} onKeyDown={(event) => event.key === "Escape" && setOpen(false)} className="workspace-date-button flex w-full items-center justify-between gap-3 rounded-2xl border border-[#DDE7EF] bg-white px-4 py-3 text-left text-sm font-bold text-[#1F2937] shadow-sm transition hover:border-[#16B994]/45 hover:bg-[#FBFEFF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16B994]">
      <span className={selectedValue ? "" : "text-[#737174]"}>{display}{required && !selectedValue ? " *" : ""}</span>
      <CalendarDays size={16} className="text-[#1789AA]" />
    </button>
    {open && <div className="workspace-popover absolute z-[70] mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-3xl border border-[#DDE7EF] bg-white p-3 shadow-[0_22px_70px_rgba(23,50,121,.18)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))} className="grid size-9 place-items-center rounded-full bg-[#F7FAFC] text-[#173279]"><ChevronRight size={15} className="rotate-180" /></button>
        <strong className="text-sm">{new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(viewDate)}</strong>
        <button type="button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))} className="grid size-9 place-items-center rounded-full bg-[#F7FAFC] text-[#173279]"><ChevronRight size={15} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-extrabold uppercase tracking-wide text-[#737174]">
        {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <span key={`${day}-${index}`} className="py-1">{day}</span>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((day) => {
          const dateValue = dateToInputValue(day);
          const outside = day.getMonth() !== viewDate.getMonth();
          const disabled = Boolean(min && dateValue < min);
          return <button key={dateValue} type="button" disabled={disabled} onClick={() => choose(dateValue)} className={`rounded-xl px-2 py-2 text-xs font-extrabold transition disabled:cursor-not-allowed disabled:opacity-30 ${selectedValue === dateValue ? "bg-[#16B994] text-[#082143]" : outside ? "text-[#B7C2CB] hover:bg-[#F7FAFC]" : "text-[#1F2937] hover:bg-[#EAF7F7]"}`}>{day.getDate()}</button>;
        })}
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => choose(todayInputDate())} className="flex-1 rounded-full bg-[#F7FAFC] px-3 py-2 text-xs font-extrabold text-[#1789AA]">Today</button>
        <button type="button" onClick={() => choose(addDaysInput(todayInputDate(), 1))} className="flex-1 rounded-full bg-[#F7FAFC] px-3 py-2 text-xs font-extrabold text-[#1789AA]">Tomorrow</button>
      </div>
    </div>}
  </div>;

  if (!label) return content;
  return <label className="block text-sm font-bold text-[#1F2937]">
    <span className="mb-2 flex items-center gap-1">{label}{required === false && <span className="text-xs font-semibold text-[#737174]">Optional</span>}</span>
    {content}
    {helper && <span className="mt-1.5 block text-xs font-semibold leading-5 text-[#737174]">{helper}</span>}
  </label>;
}

export function WorkspaceDateTimeInput(props: { name?: string; label?: string; defaultValue?: string; value?: string; required?: boolean; helper?: string; onChange?: (value: string) => void }) {
  const { name, label, defaultValue = "", value, required, helper, onChange } = props;
  const [internalValue, setInternalValue] = useState(defaultValue || (required === false ? "" : `${todayInputDate()}T10:00`));
  const selectedValue = value ?? internalValue;
  const datePart = selectedValue?.slice(0, 10) || todayInputDate();
  const timePart = selectedValue?.slice(11, 16) || "10:00";
  function update(nextDate: string, nextTime: string) {
    const nextValue = `${nextDate}T${nextTime}`;
    if (value === undefined) setInternalValue(nextValue);
    onChange?.(nextValue);
  }
  const content = <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
    {name && <input type="hidden" name={name} value={selectedValue} />}
    <WorkspaceDateInput value={datePart} onChange={(nextDate) => update(nextDate, timePart)} />
    <input value={timePart} onChange={(event) => update(datePart, normalizeTimeInput(event.target.value))} placeholder="10:00" inputMode="numeric" className="field" aria-label={label ? `${label} time` : "Time"} />
  </div>;
  if (!label) return content;
  return <label className="block text-sm font-bold text-[#1F2937]">
    <span className="mb-2 flex items-center gap-1">{label}{required === false && <span className="text-xs font-semibold text-[#737174]">Optional</span>}</span>
    {content}
    {helper && <span className="mt-1.5 block text-xs font-semibold leading-5 text-[#737174]">{helper}</span>}
  </label>;
}

export function WorkspaceModalShell({ title: heading, eyebrow, description, icon, close, onSubmit, busy, error, submitLabel, children }: { title: string; eyebrow: string; description: string; icon: React.ReactNode; close: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; busy: boolean; error: string; submitLabel: string; children: React.ReactNode }) {
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPortalRoot(document.body);
  }, []);
  const modal = <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0b183d]/45 p-0 backdrop-blur-md sm:grid sm:place-items-center sm:p-4" onMouseDown={(event) => event.target === event.currentTarget && close()} role="dialog" aria-modal="true">
    <form onSubmit={onSubmit} className="workspace-modal-panel flex max-h-[92svh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[2rem] border border-white/80 bg-white shadow-[0_30px_90px_rgba(23,50,121,.28)] sm:max-h-[90vh] sm:rounded-[2rem]">
      <div className="relative overflow-hidden border-b border-[#E5E7EB] bg-[linear-gradient(135deg,#173279,#10245f)] p-5 text-white sm:p-6">
        <div className="pointer-events-none absolute -right-14 -top-16 size-44 rounded-full bg-[#16B994]/28 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-[#16B994] ring-1 ring-white/10">{icon}</span>
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#16B994]">{eyebrow}</p>
              <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{heading}</h2>
              <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-white/62">{description}</p>
            </div>
          </div>
          <button type="button" onClick={close} className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white hover:text-[#173279]" aria-label="Close modal"><X size={18} /></button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
        {children}
        {error && <p className="mt-5 rounded-2xl border border-[#e9c2b9] bg-[#fff0ec] p-3 text-sm font-bold text-[#984f43]">{error}</p>}
      </div>
      <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[#E5E7EB] bg-[#F7FAFC]/90 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:p-5">
        <button type="button" onClick={close} className="rounded-full border border-[#DDE7EF] bg-white px-5 py-3 text-sm font-extrabold text-[#1F2937] transition hover:border-[#16B994]/45">Cancel</button>
        <button disabled={busy} className="primary justify-center px-6 py-3 disabled:cursor-not-allowed disabled:opacity-55">{busy ? "Saving..." : submitLabel}</button>
      </div>
    </form>
  </div>;
  return portalRoot ? createPortal(modal, portalRoot) : modal;
}

export function Avatar({ name, dark }: { name: string; dark?: boolean }) { return <div className={`grid size-10 shrink-0 place-items-center rounded-full text-xs font-extrabold ring-2 ${dark ? "bg-[#173279] text-[#16B994] ring-[#16B994]/45" : "bg-gradient-to-br from-[#16B994] to-[#1969A2] text-white ring-white/50"}`}>{initials(name)}</div>; }

export function Banner({ tone, text, onClose }: { tone: "success" | "error"; text: string; onClose: () => void }) { return <div className={`mb-5 flex items-center justify-between rounded-2xl border px-5 py-3 text-sm font-bold shadow-sm ${tone === "success" ? "border-[#a8ead8] bg-[#e6f5ec] text-[#0f6f57]" : "border-[#e5b8ae] bg-[#fff0ec] text-[#995849]"}`}><span>{text}</span><button className="grid size-8 place-items-center rounded-full bg-white/55" onClick={onClose}><X size={16} /></button></div>; }

export function Status({ value }: { value: string }) {
  const styles: Record<string, string> = {
    COMPLETED: "border-[#a8ead8] bg-[#e1f2e8] text-[#0f6f57]",
    PAID: "border-[#a8ead8] bg-[#e1f2e8] text-[#0f6f57]",
    ACTIVE: "border-[#a8ead8] bg-[#e1f2e8] text-[#0f6f57]",
    APPROVED: "border-[#a8ead8] bg-[#e1f2e8] text-[#0f6f57]",
    AVAILABLE: "border-[#a8ead8] bg-[#e1f2e8] text-[#0f6f57]",
    HEALTHY: "border-[#a8ead8] bg-[#e1f2e8] text-[#0f6f57]",
    CLOSED: "border-[#a8ead8] bg-[#e1f2e8] text-[#0f6f57]",
    CONFIRMED: "border-[#bdd1e8] bg-[#e7f0fa] text-[#315d89]",
    ONLINE: "border-[#bdd1e8] bg-[#e7f0fa] text-[#315d89]",
    OPEN: "border-[#bdd1e8] bg-[#e7f0fa] text-[#315d89]",
    CHECKED_IN: "border-[#cfc4e4] bg-[#efe9f8] text-[#674d8c]",
    IN_SERVICE: "border-[#cfc4e4] bg-[#efe9f8] text-[#674d8c]",
    PENDING: "border-[#e0c26e] bg-[#fff7df] text-[#7b5514]",
    WAITLISTED: "border-[#e0c26e] bg-[#fff7df] text-[#7b5514]",
    PARTIALLY_PAID: "border-[#e0c26e] bg-[#fff7df] text-[#7b5514]",
    PARTIALLY_REFUNDED: "border-[#e0c26e] bg-[#fff7df] text-[#7b5514]",
    CANCELLED: "border-[#e5b8ae] bg-[#f9e7e3] text-[#984f43]",
    NO_SHOW: "border-[#e5b8ae] bg-[#f9e7e3] text-[#984f43]",
    REJECTED: "border-[#e5b8ae] bg-[#f9e7e3] text-[#984f43]",
    REFUNDED: "border-[#e5b8ae] bg-[#f9e7e3] text-[#984f43]",
    VOID: "border-[#e5b8ae] bg-[#f9e7e3] text-[#984f43]",
    ARCHIVED: "border-[#d4cec7] bg-[#eeeae5] text-[#6f6861]",
    INACTIVE: "border-[#d4cec7] bg-[#eeeae5] text-[#6f6861]",
    NOT_OPENED: "border-[#d4cec7] bg-[#eeeae5] text-[#6f6861]",
    LOW_STOCK: "border-[#ead39c] bg-[#fff3d5] text-[#865c12]",
    ON_LEAVE: "border-[#ead39c] bg-[#fff3d5] text-[#865c12]",
  };
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-extrabold shadow-sm ${styles[value] || "border-[#ead39c] bg-[#fff3d5] text-[#865c12]"}`}>{title(value)}</span>;
}

export function Source({ value }: { value: string }) {
  const styles: Record<string, string> = {
    MARKETPLACE: "border-[#bdd1e8] bg-[#e7f0fa] text-[#315d89]",
    SALON_WEBSITE: "border-[#cfc4e4] bg-[#efe9f8] text-[#674d8c]",
    PHONE: "border-[#ead39c] bg-[#fff3d5] text-[#865c12]",
    WALK_IN: "border-[#a8ead8] bg-[#e1f2e8] text-[#0f6f57]",
    STAFF_CREATED: "border-[#e5b8ae] bg-[#f9e7e3] text-[#984f43]",
  };
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold ${styles[value] || "border-[#d4cec7] bg-[#eeeae5] text-[#6f6861]"}`}>{title(value)}</span>;
}

export function Row({ primary, secondary, value, onClick }: { primary: string; secondary: string; value: string; onClick?: () => void }) {
  const content = <><div className="min-w-0"><p className="break-words text-sm font-extrabold text-[#1F2937]">{primary}</p><p className="mt-0.5 break-words text-xs font-medium text-[#737174]">{secondary}</p></div><strong className="shrink-0 whitespace-nowrap rounded-full bg-[#EAF7F7] px-3 py-1 text-xs text-[#1789AA]">{value}</strong></>;
  return onClick
    ? <button type="button" onClick={onClick} className="flex w-full min-w-0 items-start justify-between gap-3 rounded-2xl border-t border-[#E5E7EB] px-2 py-3 text-left transition first:border-0 hover:bg-[#F7FAFC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16B994] sm:items-center sm:gap-4">{content}</button>
    : <div className="flex min-w-0 items-start justify-between gap-3 border-t border-[#E5E7EB] py-3 first:border-0 sm:items-center sm:gap-4">{content}</div>;
}

export function Empty({ text }: { text: string }) { return <div className="rounded-3xl border border-dashed border-[#BBDAD8] bg-[linear-gradient(135deg,#F7FAFC,#EFFAFA)] px-5 py-8 text-center text-sm font-semibold text-[#667386]"><span className="mx-auto mb-3 grid size-11 place-items-center rounded-2xl bg-white text-[#1789AA] shadow-sm"><Sparkles size={18} /></span><span className="mx-auto block max-w-md leading-6">{text}</span></div>; }

export function SetupRequiredCard({ icon, title: heading, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="rounded-3xl border border-[#16B994]/25 bg-[#F7FAFC] p-5 shadow-sm">
    <div className="flex items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#E8FBFB] text-[#1789AA]">{icon}</span>
      <div>
        <p className="text-sm font-extrabold text-[#173279]">{heading}</p>
        <p className="mt-1 text-xs font-semibold leading-5 text-[#667386]">{text}</p>
      </div>
    </div>
  </div>;
}

export function Info({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "green" | "blue" | "amber" | "rose" | "violet" }) {
  const styles = {
    neutral: "border-[#e7e0d8] bg-[#f7f4ef] text-[#1F2937]",
    green: "border-[#a8ead8] bg-[#e7f8f2] text-[#0f6f57]",
    blue: "border-[#cadced] bg-[#eef5fc] text-[#315d89]",
    amber: "border-[#ecd7a7] bg-[#fff7df] text-[#865c12]",
    rose: "border-[#e9c2b9] bg-[#fff0ec] text-[#984f43]",
    violet: "border-[#d8cdea] bg-[#f5effc] text-[#674d8c]",
  };
  return <div className={`rounded-2xl border p-4 shadow-sm ${styles[tone]}`}><p className="text-xs font-bold uppercase tracking-[0.12em] opacity-70">{label}</p><p className="mt-2 text-lg font-extrabold">{value}</p></div>;
}

export function metricTone(tone: string) {
  return ({
    money: "bg-[#F7FAFC] text-[#8a6214]",
    info: "bg-[#e7f0fa] text-[#255985]",
    rose: "bg-[#fff0ec] text-[#984f43]",
    gold: "bg-[#F7FAFC] text-[#735017]",
  } as Record<string, string>)[tone] || "bg-[#e7f8f2] text-[#0f6f57]";
}

export function varianceTone(value: number): "green" | "amber" | "rose" {
  const absolute = Math.abs(value);
  return absolute <= 1 ? "green" : absolute <= 100 ? "amber" : "rose";
}

export function varianceToneClass(value: number) {
  return ({
    green: "border-[#a8ead8] bg-[#e7f8f2] text-[#0f6f57]",
    amber: "border-[#ecd7a7] bg-[#fff7df] text-[#865c12]",
    rose: "border-[#e9c2b9] bg-[#fff0ec] text-[#984f43]",
  } as const)[varianceTone(value)];
}

export function Step({ number, title: text }: { number: string; title: string }) { return <div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full bg-[#F7FAFC] text-xs font-extrabold text-[#7b5514]">{number}</span><h3 className="font-serif text-xl font-semibold">{text}</h3></div>; }

export function SlotMessage({ text, loading, error }: { text: string; loading?: boolean; error?: boolean }) { return <div className={`flex min-h-24 items-center justify-center rounded-2xl border border-dashed p-5 text-center text-sm font-semibold ${error ? "border-[#c98274] bg-[#fff4f1] text-[#995849]" : "border-[#E5E7EB] bg-[#F7FAFC] text-[#737174]"}`}>{loading && <RefreshCw size={16} className="mr-2 animate-spin" />}{text}</div>; }

export function Summary({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4"><span className="text-white/50">{label}</span><strong className="text-right">{value}</strong></div>; }

export function SummaryTile({ label, value, tone = "gold" }: { label: string; value: string; tone?: "gold" | "green" | "amber" }) {
  const styles = {
    gold: "border-[#E5E7EB] bg-[#F8FAFC] text-[#111827]",
    green: "border-[#A7F3D0] bg-[#D1FAE5] text-[#047857]",
    amber: "border-[#FDE68A] bg-[#FEF3C7] text-[#92400E]",
  };
  return <div className={`rounded-2xl border p-3 ${styles[tone]}`}><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] opacity-75">{label}</p><p className="mt-1 text-base font-extrabold">{value}</p></div>;
}

export function Field(props: { name: string; label: string; type?: string; defaultValue?: string; required?: boolean; helper?: string; placeholder?: string }) {
  if (props.type === "date") return <WorkspaceDateInput name={props.name} label={props.label} defaultValue={props.defaultValue} required={props.required} helper={props.helper} />;
  if (props.type === "datetime-local") return <WorkspaceDateTimeInput name={props.name} label={props.label} defaultValue={props.defaultValue} required={props.required} helper={props.helper} />;
  return <label className="block text-sm font-bold text-[#1F2937]"><span className="mb-2 flex items-center gap-1">{props.label}{props.required === false && <span className="text-xs font-semibold text-[#737174]">Optional</span>}</span><input name={props.name} type={props.type || "text"} defaultValue={props.defaultValue} required={props.required !== false} step={props.type === "number" ? "0.01" : undefined} placeholder={props.placeholder} className="field" />{props.helper && <span className="mt-1.5 block text-xs font-semibold leading-5 text-[#737174]">{props.helper}</span>}</label>;
}

export function Select({ name, label, options, required = true, defaultValue = "" }: { name: string; label: string; options: string[][]; required?: boolean; defaultValue?: string }) { return <WorkspaceSelect name={name} label={label} required={required} defaultValue={defaultValue} options={options.map(([value, text]) => ({ value, label: text }))} placeholder="Select" />; }

export function title(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }

export function todayInputDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()); }

export function inputDateToDate(value: string) { return new Date(`${value || todayInputDate()}T12:00:00+05:30`); }

export function dateToInputValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDaysInput(value: string, days: number) {
  const date = inputDateToDate(value);
  date.setDate(date.getDate() + days);
  return dateToInputValue(date);
}

export function normalizeTimeInput(value: string) {
  const cleaned = value.replace(/[^\d:]/g, "").slice(0, 5);
  if (/^\d{2}:\d{2}$/.test(cleaned)) return cleaned;
  if (/^\d{1,2}$/.test(cleaned)) return cleaned.padStart(2, "0") + ":00";
  return cleaned;
}

export function formatDate(date: Date) { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(date); }

export function formatTime(value: string) { return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(value)); }

export function formatDateTime(value: string) { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value)); }

export function toIndiaDateTimeInput(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const record = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${record.year}-${record.month}-${record.day}T${record.hour}:${record.minute}`;
}

export function toIndiaTimeInput(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const record = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${record.hour}:${record.minute}`;
}

export function timeToMinutes(value: string) { const [hours, minutes] = value.split(":").map(Number); return hours * 60 + minutes; }

export function minutesToTime(value: number) { return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`; }

export function minutesInIndia(value: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(value));
  const record = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(record.hour) * 60 + Number(record.minute);
}

export function formatClockMinute(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

export function nextStatuses(status: string) { return ({ WAITLISTED: ["CONFIRMED", "CANCELLED"], CONFIRMED: ["CHECKED_IN", "CANCELLED", "NO_SHOW", "WAITLISTED"], CHECKED_IN: ["IN_SERVICE", "CANCELLED"], IN_SERVICE: ["COMPLETED", "CANCELLED"] } as Record<string, string[]>)[status] || []; }

export function canCheckoutAppointmentStatus(status: string) { return !["WAITLISTED", "CANCELLED", "NO_SHOW"].includes(status); }

export function appointmentCardStyle(status: string) {
  return ({
    WAITLISTED: "border-l-[#b47a18] bg-[#fff4d9] text-[#7b5514]",
    CONFIRMED: "border-l-[#4c7cab] bg-[#eaf3fc] text-[#294f79]",
    CHECKED_IN: "border-l-[#8264aa] bg-[#f2ecfa] text-[#604681]",
    IN_SERVICE: "border-l-[#8264aa] bg-[#eee6f8] text-[#604681]",
    COMPLETED: "border-l-[#3f7c5d] bg-[#e8f5ed] text-[#0f6f57]",
    CANCELLED: "border-l-[#bd6758] bg-[#fbece8] text-[#8f493e]",
    NO_SHOW: "border-l-[#b47a18] bg-[#fff4d9] text-[#7b5514]",
  } as Record<string, string>)[status] || "border-l-[#9b9187] bg-[#f3f0ec] text-[#625b54]";
}

export function isAppointmentTerminal(status: string) {
  return ["COMPLETED", "CANCELLED", "NO_SHOW"].includes(status);
}

export function appointmentQueueRank(item: AppointmentItem, now: number) {
  const starts = new Date(item.startsAt).getTime();
  if (item.status === "IN_SERVICE") return 0;
  if (item.status === "CHECKED_IN") return 1;
  if (item.status === "CONFIRMED" && starts <= now) return 2;
  if (item.status === "CONFIRMED" && starts > now) return 3;
  if (item.status === "WAITLISTED") return 4;
  return isAppointmentTerminal(item.status) ? 6 : 5;
}

export function appointmentQueuePriorityStyle(priority: string) {
  if (priority === "Overdue") return { card: "border-[#F59E0B]/45 bg-[#FFFBEB] hover:bg-[#FFFBEB]", badge: "bg-[#FEF3C7] text-[#B45309]" };
  if (priority === "In service") return { card: "border-[#A78BFA]/40 bg-[#F5F3FF] hover:bg-[#F5F3FF]", badge: "bg-[#EDE9FE] text-[#6D28D9]" };
  if (priority === "Checked in") return { card: "border-[#60A5FA]/35 bg-[#EFF6FF] hover:bg-[#EFF6FF]", badge: "bg-[#DBEAFE] text-[#1D4ED8]" };
  if (priority === "Next") return { card: "border-[#10B981]/40 bg-[#ECFDF5] hover:bg-[#ECFDF5]", badge: "bg-[#D1FAE5] text-[#047857]" };
  if (priority === "Upcoming") return { card: "border-[#BFDBFE] bg-[#F8FAFC] hover:bg-white", badge: "bg-[#EFF6FF] text-[#2563EB]" };
  if (priority === "Payment due") return { card: "border-[#F59E0B]/35 bg-[#FFFBEB] hover:bg-[#FFFBEB]", badge: "bg-[#FEF3C7] text-[#B45309]" };
  return { card: "border-[#E8EAF0] bg-[#F6F7FB] hover:bg-white", badge: "bg-[#F3F4F6] text-[#6B7280]" };
}

export function appointmentMobileCardStyle(item: AppointmentItem, isNext: boolean, now: number) {
  if (item.status === "CANCELLED" || item.status === "NO_SHOW") return "border-[#e9c2b9] bg-[#fff0ec] opacity-85";
  if (item.status === "COMPLETED") return "border-[#a8ead8] bg-[#f2faf5]";
  if (item.status === "IN_SERVICE") return "border-[#cfc4e4] bg-[#f5effc] ring-2 ring-[#8264aa]/25";
  if (item.status === "CHECKED_IN") return "border-[#bdd1e8] bg-[#eef5fc] ring-2 ring-[#4c7cab]/20";
  if (appointmentPriorityLabel(item, isNext, now) === "Overdue") return "border-[#F59E0B]/50 bg-[#FFFBEB] ring-2 ring-[#F59E0B]/15";
  if (isNext) return "border-[#16B994] bg-[#F7FAFC] ring-2 ring-[#16B994]/25";
  if (item.invoice?.outstanding && item.invoice.outstanding > 0) return "border-[#ead39c] bg-[#F7FAFC]";
  return "border-black/8 bg-white";
}

export function appointmentPriorityLabel(item: AppointmentItem, isNext: boolean, now: number) {
  const starts = new Date(item.startsAt).getTime();
  if (item.status === "COMPLETED") return item.invoice?.outstanding && item.invoice.outstanding > 0 ? "Payment due" : "";
  if (item.status === "CANCELLED" || item.status === "NO_SHOW" || item.status === "WAITLISTED") return "";
  if (item.status === "IN_SERVICE") return "In service";
  if (item.status === "CHECKED_IN") return "Checked in";
  if (item.status === "CONFIRMED" && starts <= now) return "Overdue";
  if (isNext) return "Next";
  if (item.status === "CONFIRMED" && starts > now) return "Upcoming";
  if (item.invoice?.outstanding && item.invoice.outstanding > 0) return "Payment due";
  return "";
}

export function statusActionStyle(status: string) {
  return ["CANCELLED", "NO_SHOW"].includes(status)
    ? "border-[#e5b8ae] bg-[#fff0ec] text-[#984f43]"
    : status === "COMPLETED"
    ? "border-[#a8ead8] bg-[#e7f8f2] text-[#0f6f57]"
      : "border-[#cfc4e4] bg-[#f5effc] text-[#674d8c]";
}

export function appointmentServiceLabel(item: AppointmentItem) {
  if (item.serviceLines.length > 1) return `${item.serviceLines.length} services: ${item.serviceLines.map((line) => line.service).slice(0, 2).join(", ")}${item.serviceLines.length > 2 ? "..." : ""}`;
  return item.serviceLines[0]?.service || item.service;
}

export function appointmentDisplayTotal(item: AppointmentItem) {
  return item.invoice?.total ?? (item.serviceLines.length ? item.serviceLines.reduce((sum, line) => sum + line.price, 0) : item.price);
}

export function appointmentDuration(item: AppointmentItem) {
  return Math.max(1, Math.round((new Date(item.endsAt).getTime() - new Date(item.startsAt).getTime()) / 60_000));
}

export function packageBalanceLabel(balance: unknown) {
  if (!Array.isArray(balance)) return "Balance saved";
  const uses = balance.reduce((sum, item) => {
    if (!item || typeof item !== "object") return sum;
    return sum + Number((item as { quantity?: unknown }).quantity || 0);
  }, 0);
  return `${uses} use${uses === 1 ? "" : "s"} left`;
}

export function mobileNavLabel(item: NavItem) {
  const labels: Record<NavItem, string> = {
    Overview: "Home",
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
  return labels[item];
}

export function roleExperienceLabel(role: string) {
  const labels: Record<string, string> = {
    OWNER: "Owner cockpit",
    MANAGER: "Floor manager",
    RECEPTIONIST: "Front desk",
    STYLIST: "Artist mode",
    ACCOUNTANT: "Accounts desk",
  };
  return labels[role] || title(role);
}

export function mobileTabsForRole(role: string, availableItems: NavItem[]) {
  const defaults: Record<string, NavItem[]> = {
    OWNER: ["Overview", "Appointments", "Point of sale", "Customers"],
    MANAGER: ["Overview", "Appointments", "Point of sale", "Customers"],
    RECEPTIONIST: ["Overview", "Appointments", "Point of sale", "Customers"],
    STYLIST: ["Overview", "Appointments", "Customers"],
    ACCOUNTANT: ["Overview", "Point of sale", "Register", "Reports"],
  };
  const preferred = defaults[role] || ["Overview", "Appointments", "Customers"];
  const tabs = preferred.filter((item) => availableItems.includes(item)).slice(0, 4);
  return tabs.length >= 3 ? tabs : availableItems.slice(0, 4);
}

export function canOpen(role: string, item: NavItem) {
  const access: Record<string, NavItem[]> = {
    OWNER: [...navItems],
    MANAGER: [...navItems],
    RECEPTIONIST: ["Overview", "Appointments", "Customers", "Point of sale", "Register"],
    STYLIST: ["Overview", "Appointments", "Customers"],
    ACCOUNTANT: ["Overview", "Point of sale", "Register", "Inventory", "Team", "Reports"],
  };
  return (access[role] || ["Overview"]).includes(item);
}
