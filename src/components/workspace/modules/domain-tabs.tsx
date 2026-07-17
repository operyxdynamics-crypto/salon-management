"use client";

import { ReactNode } from "react";

/**
 * The top-level switch on a domain screen (Products, Services): a few big, obvious tabs that flip
 * between the catalogue and its setup. Deliberately larger and calmer than the master sub-tabs, so
 * the primary choice reads first.
 */
export function DomainTabs<T extends string>({ active, onChange, tabs }: {
  active: T;
  onChange: (id: T) => void;
  tabs: Array<{ id: T; label: string; icon?: ReactNode }>;
}) {
  return <div className="flex flex-wrap items-center gap-1.5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-card)] p-1.5 shadow-[var(--shadow-sm)]">
    {tabs.map((tab) => <button
      key={tab.id}
      type="button"
      onClick={() => onChange(tab.id)}
      className={`inline-flex items-center gap-2 rounded-[var(--radius-md)] px-4 py-2 text-sm font-semibold transition-colors duration-[var(--dur-fast)] focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)] ${active === tab.id ? "bg-[var(--accent)] text-[var(--text-on-accent)] shadow-[var(--shadow-sm)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"}`}
    >
      {tab.icon}{tab.label}
    </button>)}
  </div>;
}
