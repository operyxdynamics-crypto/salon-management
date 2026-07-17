"use client";

import { useState } from "react";
import { AlertTriangle, Gift, MessageCircle, Phone, Plus, Search } from "lucide-react";
import { inr, initials } from "@/lib/format";
import type { WorkspaceData } from "@/lib/operations-types";

import { SubmitFn } from "@/components/workspace/contracts";
import { Card, Empty, Info } from "@/components/workspace/shared-ui";

export function CustomersView({ data, open, openProfile }: { data: WorkspaceData; open: () => void; submit: SubmitFn; openProfile: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "warnings" | "loyalty" | "birthdays">("all");
  const currentMonth = new Date().getMonth();
  const hasBirthdayThisMonth = (customer: WorkspaceData["customers"][number]) => Boolean(customer.birthday && new Date(customer.birthday).getMonth() === currentMonth);

  const searchMatches = data.customers.filter((customer) => `${customer.name} ${customer.phone} ${customer.email || ""} ${customer.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  const customers = searchMatches.filter((customer) => {
    if (filter === "warnings") return Boolean(customer.allergies || customer.notes);
    if (filter === "loyalty") return customer.loyalty > 0;
    if (filter === "birthdays") return hasBirthdayThisMonth(customer);
    return true;
  });

  const totalSpend = data.customers.reduce((sum, customer) => sum + customer.spend, 0);
  const warningCount = data.customers.filter((customer) => customer.allergies || customer.notes).length;
  const loyaltyCount = data.customers.filter((customer) => customer.loyalty > 0).length;
  const birthdayCount = data.customers.filter(hasBirthdayThisMonth).length;

  // Saved views: the four questions reception asks of the customer list. Same pattern as Bookings
  // and Billing. A count turns amber only when it is something to act on.
  const views = [
    { id: "all" as const, label: "All", count: data.customers.length, warn: false },
    { id: "warnings" as const, label: "Has alerts", count: warningCount, warn: warningCount > 0 },
    { id: "loyalty" as const, label: "With rewards", count: loyaltyCount, warn: false },
    { id: "birthdays" as const, label: "Birthday month", count: birthdayCount, warn: birthdayCount > 0 },
  ];

  const metrics = [
    { label: "Customers", value: String(data.customers.length), tone: "blue" as const },
    { label: "Lifetime spend", value: inr.format(totalSpend), tone: "green" as const },
    { label: "With alerts", value: String(warningCount), tone: warningCount ? "amber" as const : "neutral" as const },
    { label: "Birthdays this month", value: String(birthdayCount), tone: "violet" as const },
  ];

  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => <Info key={metric.label} label={metric.label} value={metric.value} tone={metric.tone} />)}
    </div>

    <Card title="Customers" action={<button onClick={open} className="primary"><Plus size={15} /> Add customer</button>}>
      <div className="flex flex-wrap items-center gap-2">
        {views.map((view) => <button
          key={view.id}
          type="button"
          onClick={() => setFilter(view.id)}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-extrabold transition ${filter === view.id ? "bg-[#5B2A86] text-white shadow-sm" : "bg-[#F6F7FB] text-[#6B7280] hover:bg-[#EFE8F6] hover:text-[#5B2A86]"}`}
        >
          {view.label}
          <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${filter === view.id ? "bg-white/20" : view.warn ? "bg-[#F5D0C5] text-[#984f43]" : "bg-white text-[#9CA3AF]"}`}>{view.count}</span>
        </button>)}

        <div className="relative ml-auto w-64">
          <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-[#9a938b]" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="field pl-10" placeholder="Search name, mobile, or tag" />
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-[#9CA3AF]">
            <tr>
              <th className="pb-3">Customer</th>
              <th className="pb-3">Phone</th>
              <th className="pb-3 text-right">Visits</th>
              <th className="pb-3 text-right">Spend</th>
              <th className="pb-3 text-right">Rewards</th>
              <th className="pb-3"></th>
            </tr>
          </thead>
          <tbody>{customers.map((customer) => {
            const hasWarning = Boolean(customer.allergies || customer.notes);
            const dial = customer.phone.replace(/[^\d+]/g, "");
            return <tr key={customer.id} onClick={() => openProfile(customer.id)} className="group cursor-pointer border-t border-black/5 transition hover:bg-[#F9F7FC]">
              <td className="py-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#EFE8F6] text-xs font-extrabold text-[#5B2A86]">{initials(customer.name)}</span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 font-bold text-[#1F2937]">
                      <span className="truncate">{customer.name}</span>
                      {hasWarning && <AlertTriangle size={12} className="shrink-0 text-[#C4403E]" />}
                      {hasBirthdayThisMonth(customer) && <Gift size={12} className="shrink-0 text-[#B57900]" />}
                    </p>
                    {customer.tags.length > 0 && <div className="mt-0.5 flex flex-wrap gap-1">{customer.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded-full bg-[#EFE8F6] px-1.5 py-0.5 text-[10px] font-bold text-[#5B2A86]">{tag}</span>)}</div>}
                  </div>
                </div>
              </td>
              <td className="py-3 text-[#6B7280]">{customer.phone}</td>
              <td className="py-3 text-right font-bold tabular-nums">{customer.visits}</td>
              <td className="py-3 text-right font-bold tabular-nums text-[#1F2937]">{inr.format(customer.spend)}</td>
              <td className="py-3 text-right tabular-nums text-[#6B7280]">{customer.loyalty} pts</td>
              <td className="py-3" onClick={(event) => event.stopPropagation()}>
                {/* Reach the customer straight from the list - the most common reason to look one up. */}
                <div className="flex justify-end gap-1 opacity-0 transition group-hover:opacity-100">
                  <a href={`tel:${dial}`} aria-label="Call" className="grid size-8 place-items-center rounded-lg border border-[#E5E7EB] bg-white text-[#5B2A86] transition hover:bg-[#EFE8F6]"><Phone size={14} /></a>
                  <a href={`https://wa.me/${dial.replace(/^\+/, "")}`} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="grid size-8 place-items-center rounded-lg border border-[#A9DFCB] bg-[#E9F7F1] text-[#0B6B4F] transition hover:bg-[#D6F0E5]"><MessageCircle size={14} /></a>
                </div>
              </td>
            </tr>;
          })}</tbody>
        </table>
        {!customers.length && <Empty text={query || filter !== "all" ? "No customers match this view." : "No customers yet. Add your first one."} />}
      </div>
    </Card>
  </div>;
}
