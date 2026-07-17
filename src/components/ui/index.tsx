"use client";

import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";

/**
 * Operyx UI primitives.
 *
 * Every component here is driven by the tokens in styles/tokens.css and nothing else. No literal
 * hex, no ad-hoc padding. A screen built from these cannot drift from the rest of the app, and
 * dark mode arrives by re-pointing tokens rather than by editing components.
 *
 * The states every interactive primitive must handle - because the current UI misses several of
 * them in most places: rest, hover, active, focus-visible, disabled, loading.
 */

/* ------------------------------------------------------------------ Button */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  // One accent-filled button per view. If everything shouts, nothing is heard.
  primary: "bg-[var(--accent)] text-[var(--text-on-accent)] hover:bg-[var(--accent-hover)] border border-transparent",
  secondary: "bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-strong)] hover:bg-[var(--surface-sunken)]",
  ghost: "bg-transparent text-[var(--text-secondary)] border border-transparent hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
  danger: "bg-[var(--danger)] text-[var(--text-on-accent)] border border-transparent hover:bg-[var(--danger-text)]",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-[var(--control-h-sm)] px-3 text-xs gap-1.5",
  md: "h-[var(--control-h)] px-4 text-sm gap-2",
  lg: "h-[var(--control-h-lg)] px-5 text-sm gap-2",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  icon,
  fullWidth,
  className = "",
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
}) {
  return <button
    {...props}
    disabled={disabled || loading}
    className={`inline-flex items-center justify-center rounded-[var(--radius-sm)] font-semibold transition-[background-color,border-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-out)] focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${fullWidth ? "w-full" : ""} ${className}`}
  >
    {loading ? <Loader2 size={15} className="animate-spin" /> : icon}
    {children}
  </button>;
}

export function IconButton({ label, variant = "ghost", size = "md", className = "", children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const box = size === "sm" ? "size-8" : size === "lg" ? "size-11" : "size-[var(--control-h)] min-w-[var(--control-h)]";
  return <button
    {...props}
    aria-label={label}
    title={label}
    className={`inline-grid place-items-center rounded-[var(--radius-sm)] transition-colors duration-[var(--dur-fast)] focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] active:scale-[0.96] disabled:pointer-events-none disabled:opacity-45 ${BUTTON_VARIANTS[variant]} ${box} ${className}`}
  >{children}</button>;
}

/* -------------------------------------------------------------------- Card */

export function Card({ title, description, action, padded = true, className = "", children }: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  padded?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return <section className={`rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-card)] shadow-[var(--shadow-sm)] ${className}`}>
    {(title || action) && <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
      <div className="min-w-0">
        {title && <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{title}</h2>}
        {description && <p className="mt-0.5 text-[13px] text-[var(--text-secondary)]">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>}
    <div className={padded ? "p-5" : ""}>{children}</div>
  </section>;
}

/* ------------------------------------------------------------------- Badge */

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  accent: "bg-[var(--accent-soft)] text-[var(--accent-text)]",
  success: "bg-[var(--success-soft)] text-[var(--success-text)]",
  warning: "bg-[var(--warning-soft)] text-[var(--warning-text)]",
  danger: "bg-[var(--danger-soft)] text-[var(--danger-text)]",
  info: "bg-[var(--info-soft)] text-[var(--info-text)]",
};

export function Badge({ tone = "neutral", icon, children }: { tone?: Tone; icon?: ReactNode; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-[var(--radius-full)] px-2.5 py-1 text-[11px] font-semibold ${TONES[tone]}`}>
    {icon}{children}
  </span>;
}

/** A number that means something - revenue, a count, a variance. */
export function Metric({ label, value, tone = "neutral", hint }: { label: string; value: string; tone?: Tone; hint?: string }) {
  return <div className="rounded-[var(--radius-md)] bg-[var(--surface-sunken)] p-4">
    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</p>
    <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${tone === "neutral" ? "text-[var(--text-primary)]" : `text-[var(--${tone}-text)]`}`}>{value}</p>
    {hint && <p className="mt-1 text-xs text-[var(--text-secondary)]">{hint}</p>}
  </div>;
}

/* ------------------------------------------------------------------ Fields */

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return <label className="block">
    <span className="mb-1.5 block text-[13px] font-medium text-[var(--text-primary)]">{label}</span>
    {children}
    {error
      ? <span className="mt-1 block text-xs font-medium text-[var(--danger-text)]">{error}</span>
      : hint && <span className="mt-1 block text-xs text-[var(--text-muted)]">{hint}</span>}
  </label>;
}

export function Input({ className = "", invalid, ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input
    {...props}
    aria-invalid={invalid}
    className={`h-[var(--control-h)] w-full rounded-[var(--radius-sm)] border bg-[var(--surface-card)] px-3 text-sm text-[var(--text-primary)] transition-[border-color,box-shadow] duration-[var(--dur-fast)] placeholder:text-[var(--text-muted)] focus:outline-none focus:shadow-[var(--shadow-focus)] disabled:bg-[var(--surface-sunken)] disabled:text-[var(--text-disabled)] ${invalid ? "border-[var(--danger)]" : "border-[var(--border-strong)] focus:border-[var(--border-focus)]"} ${className}`}
  />;
}

/* --------------------------------------------------------------- Feedback */

/**
 * Empty state. An invitation, not an apology - so it names the space and offers the action, and
 * never says "Nothing here yet."
 */
export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] bg-[var(--surface-sunken)] px-6 py-12 text-center">
    {icon && <span className="grid size-10 place-items-center rounded-[var(--radius-md)] bg-[var(--surface-card)] text-[var(--text-muted)]">{icon}</span>}
    <div>
      <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-sm text-[13px] text-[var(--text-secondary)]">{description}</p>}
    </div>
    {action}
  </div>;
}

/**
 * Skeleton, not a spinner.
 *
 * A spinner says "something is happening"; a skeleton says "a table is coming, and it will be
 * about this big" - so the layout does not jump when data lands, which is the single most jarring
 * thing in the current app.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`op-pulse rounded-[var(--radius-sm)] bg-[var(--surface-sunken)] ${className}`} />;
}

export function SkeletonTable({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return <div className="space-y-2">
    {Array.from({ length: rows }).map((_, rowIndex) => <div key={rowIndex} className="flex gap-3">
      {Array.from({ length: columns }).map((_, columnIndex) => <Skeleton key={columnIndex} className={`h-9 ${columnIndex === 0 ? "flex-[2]" : "flex-1"}`} />)}
    </div>)}
  </div>;
}

export function Banner({ tone = "info", icon, title, children, onDismiss }: {
  tone?: Tone;
  icon?: ReactNode;
  title?: string;
  children?: ReactNode;
  onDismiss?: () => void;
}) {
  return <div className={`flex items-start gap-3 rounded-[var(--radius-md)] p-3.5 text-[13px] ${TONES[tone]}`} role="status">
    {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
    <div className="min-w-0 flex-1">
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-0.5 opacity-90" : ""}>{children}</div>}
    </div>
    {onDismiss && <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 opacity-60 transition-opacity hover:opacity-100"><X size={15} /></button>}
  </div>;
}

/* ----------------------------------------------------------------- Overlay */

/**
 * One overlay component, two presentations: a centred dialog on desktop, a bottom sheet on
 * mobile. The current app has five different modal implementations that behave differently.
 */
export function Overlay({ title, description, onClose, footer, size = "md", children }: {
  title: string;
  description?: string;
  onClose: () => void;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useEffect(() => { setRoot(document.body); }, []);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onEscape);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onEscape);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const width = size === "sm" ? "sm:max-w-md" : size === "lg" ? "sm:max-w-3xl" : "sm:max-w-xl";

  const node = <div
    className="op-fade-in fixed inset-0 z-[100] flex items-end justify-center bg-[var(--surface-overlay)] backdrop-blur-[2px] sm:items-center sm:p-4"
    onPointerDown={(event) => event.target === event.currentTarget && onClose()}
    role="dialog"
    aria-modal="true"
    aria-label={title}
  >
    <div className={`op-sheet-in flex max-h-[92svh] w-full flex-col overflow-hidden rounded-t-[var(--radius-xl)] bg-[var(--surface-card)] shadow-[var(--shadow-lg)] sm:rounded-[var(--radius-lg)] ${width}`}>
      <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-[var(--border-strong)] sm:hidden" />
      <header className="flex shrink-0 items-start justify-between gap-3 px-5 pb-4 pt-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-[var(--text-secondary)]">{description}</p>}
        </div>
        <IconButton label="Close" size="sm" onClick={onClose}><X size={16} /></IconButton>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
      {footer && <footer className="flex shrink-0 justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface-sunken)] px-5 py-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:pb-3.5">{footer}</footer>}
    </div>
  </div>;

  return root ? createPortal(node, root) : null;
}

/** Destructive confirmation. Always names the thing and states the consequence. */
export function ConfirmDialog({ title, consequence, confirmLabel = "Confirm", tone = "danger", busy, onConfirm, onCancel }: {
  title: string;
  consequence: string;
  confirmLabel?: string;
  tone?: "danger" | "accent";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return <Overlay
    title={title}
    onClose={onCancel}
    size="sm"
    footer={<>
      <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      <Button variant={tone === "danger" ? "danger" : "primary"} loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
    </>}
  >
    <p className="text-[13px] leading-6 text-[var(--text-secondary)]">{consequence}</p>
  </Overlay>;
}

/* -------------------------------------------------------------------- Tabs */

export function Tabs<T extends string>({ tabs, value, onChange }: {
  tabs: Array<{ id: T; label: string; count?: number }>;
  value: T;
  onChange: (id: T) => void;
}) {
  return <div className="inline-flex gap-1 rounded-[var(--radius-sm)] bg-[var(--surface-sunken)] p-1" role="tablist">
    {tabs.map((tab) => <button
      key={tab.id}
      type="button"
      role="tab"
      aria-selected={value === tab.id}
      onClick={() => onChange(tab.id)}
      className={`inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-1.5 text-[13px] font-medium transition-colors duration-[var(--dur-fast)] focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] ${value === tab.id ? "bg-[var(--surface-card)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
    >
      {tab.label}
      {tab.count !== undefined && <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{tab.count}</span>}
    </button>)}
  </div>;
}

/* ------------------------------------------------------------------- Table */

export function Table({ headers, children, minWidth = 720 }: { headers: string[]; children: ReactNode; minWidth?: number }) {
  return <div className="overflow-x-auto">
    <table className="w-full text-left text-[13px]" style={{ minWidth }}>
      <thead>
        <tr className="border-b border-[var(--border)]">
          {headers.map((header) => <th key={header} className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">{header}</th>)}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  </div>;
}

export function Row({ onClick, children }: { onClick?: () => void; children: ReactNode }) {
  return <tr
    onClick={onClick}
    className={`border-b border-[var(--border)] text-[var(--text-primary)] transition-colors duration-[var(--dur-instant)] last:border-0 ${onClick ? "cursor-pointer hover:bg-[var(--surface-sunken)]" : ""}`}
  >{children}</tr>;
}

export function Cell({ align = "left", muted, children }: { align?: "left" | "right"; muted?: boolean; children: ReactNode }) {
  return <td className={`px-4 py-3 ${align === "right" ? "text-right tabular-nums" : ""} ${muted ? "text-[var(--text-secondary)]" : ""}`}>{children}</td>;
}
