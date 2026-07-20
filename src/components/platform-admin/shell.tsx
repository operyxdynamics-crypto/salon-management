"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, CircleDollarSign, FileCheck2, LogOut, Package, ShieldCheck, Store, Target, Timer } from "lucide-react";
import { ToastProvider } from "./toast";

/**
 * The control room shell.
 *
 * Every section is a real route, so a page can be bookmarked, shared with a colleague, and reached
 * with the back button. It also means each page fetches only its own data - the old single-page
 * console loaded every salon, every plan, every audit line and every enquiry on first paint, no
 * matter which section you actually wanted.
 *
 * Dark rail on purpose: it must be obvious at a glance that this is Operyx's own tool and not a
 * salon's workspace. Acting on the wrong one is the expensive mistake here.
 */

/**
 * Pipeline, Trials and Customers are three screens because they are three different jobs, possibly
 * done by three different people on different days.
 *
 * A salon is in exactly one of them at a time. That is the whole point: a trialling salon is not a
 * customer, and listing it as one made a free salon look like revenue.
 */
export const PLATFORM_ADMIN_SECTIONS = [
  { href: "/platformadmin/dashboard", label: "Today", icon: Activity },
  { href: "/platformadmin/pipeline", label: "Pipeline", icon: Target },
  { href: "/platformadmin/trials", label: "Trials", icon: Timer },
  { href: "/platformadmin/customers", label: "Customers", icon: Store },
  { href: "/platformadmin/money", label: "Money", icon: CircleDollarSign },
  { href: "/platformadmin/packages", label: "Packages", icon: Package },
  { href: "/platformadmin/activity", label: "Activity", icon: FileCheck2 },
] as const;

export function PlatformAdminShell({ adminName, counts, children }: {
  adminName: string;
  counts: Partial<Record<string, number>>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <main className="min-h-screen bg-[#F7F6F9] text-[#1F2937] lg:grid lg:grid-cols-[212px_1fr]">
      <aside className="flex flex-col gap-5 bg-[#3D1C5A] p-4 text-white lg:min-h-screen">
        <Link href="/platformadmin/dashboard" className="flex items-center gap-2.5 px-1">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-[#5B2A86]"><ShieldCheck size={17} /></span>
          <span className="leading-none">
            <span className="block text-sm font-bold">Operyx</span>
            <span className="mt-0.5 block text-[9px] uppercase tracking-[0.14em] text-white/50">Control room</span>
          </span>
        </Link>

        <nav className="grid gap-0.5">
          {PLATFORM_ADMIN_SECTIONS.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            const count = counts[href];
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${active ? "bg-[#5B2A86] text-white" : "text-white/65 hover:bg-white/10 hover:text-white"}`}
              >
                <Icon size={15} className="shrink-0" />
                <span className="flex-1">{label}</span>
                {count ? <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${active ? "bg-white/25" : "bg-white/10"}`}>{count}</span> : null}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-white/10 pt-3">
          <p className="px-1 text-xs font-semibold">{adminName}</p>
          <p className="px-1 text-[10px] text-white/45">Platform admin</p>
          <div className="mt-3 flex gap-2">
            <Link href="/" className="flex-1 rounded-lg bg-white/10 px-2 py-2 text-center text-[11px] font-semibold text-white/70 transition hover:text-white">Website</Link>
            <form action="/api/v1/auth/logout" method="post" className="flex-1">
              <button className="w-full rounded-lg bg-white/10 px-2 py-2 text-[11px] font-semibold text-white/70 transition hover:text-white">
                <LogOut size={12} className="mr-1 inline" />Out
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="min-w-0 p-5 lg:p-8">
        <ToastProvider>{children}</ToastProvider>
      </div>
    </main>
  );
}

/** Page heading. Every section uses it, so they cannot drift apart. */
export function PageHeader({ title, blurb, action }: { title: string; blurb: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <h1 className="font-serif text-3xl tracking-tight">{title}</h1>
        <p className="mt-1.5 text-sm text-[#737174]">{blurb}</p>
      </div>
      {action}
    </div>
  );
}
