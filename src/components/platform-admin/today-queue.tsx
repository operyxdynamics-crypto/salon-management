"use client";

import { useRouter } from "next/navigation";
import { Check, ChevronRight } from "lucide-react";
import { inr } from "@/lib/format";

type Item = { kind: string; id: string; title: string; detail: string };

/**
 * Severity is carried by colour and a left accent bar, so the shape of the day reads before a
 * single word does: red is money leaking now, amber is a customer blocked or about to leave,
 * purple is upcoming, grey is pipeline.
 */
const TONE: Record<string, { wrap: string; chip: string; bar: string }> = {
  PAST_DUE: { wrap: "border-[#F0C4C2] bg-[#FDECEC]", chip: "bg-white/70 text-[#94302E]", bar: "bg-[#C4403E]" },
  TRIAL_EXPIRED: { wrap: "border-[#F0C4C2] bg-[#FDECEC]", chip: "bg-white/70 text-[#94302E]", bar: "bg-[#C4403E]" },
  BRANCH_APPROVAL: { wrap: "border-[#ECD7A7] bg-[#FFF7DF]", chip: "bg-white/70 text-[#865C12]", bar: "bg-[#B57900]" },
  // A customer who cannot take a booking is blocked by us, so it reads as red, not as a sales tip.
  AT_LIMIT: { wrap: "border-[#F0C4C2] bg-[#FDECEC]", chip: "bg-white/70 text-[#94302E]", bar: "bg-[#C4403E]" },
  TRIAL_ENDING: { wrap: "border-[#ECD7A7] bg-[#FFF7DF]", chip: "bg-white/70 text-[#865C12]", bar: "bg-[#B57900]" },
  RENEWAL_DUE: { wrap: "border-[#E3D9EE] bg-white", chip: "bg-[#F3E8FF] text-[#5B2A86]", bar: "bg-[#5B2A86]" },
  NEVER_ACTIVATED: { wrap: "border-[#E3D9EE] bg-white", chip: "bg-[#F3E8FF] text-[#5B2A86]", bar: "bg-[#5B2A86]" },
  // Nothing is wrong yet - this one is an opportunity, and looks like one.
  NEAR_LIMIT: { wrap: "border-[#D9C7EA] bg-[#FAF7FD]", chip: "bg-white/70 text-[#5B2A86]", bar: "bg-[#8B5FBF]" },
  LEAD_FOLLOW_UP: { wrap: "border-[#E5E7EB] bg-white", chip: "bg-[#F7F6F9] text-[#6B7280]", bar: "bg-[#9CA3AF]" },
};

const readable = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

export function TodayQueue({ items, metrics }: {
  items: Item[];
  metrics: { mrr: number; paying: number; trialing: number; pastDue: number };
}) {
  const router = useRouter();

  return <div className="mt-6 space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl bg-[#5B2A86] p-4 text-white">
        <p className="text-xs text-white/70">Monthly recurring revenue</p>
        <strong className="mt-1 block text-3xl">{inr.format(metrics.mrr)}</strong>
      </div>
      {([["Paying", metrics.paying, ""], ["In trial", metrics.trialing, ""], ["Past due", metrics.pastDue, metrics.pastDue ? "text-[#C4403E]" : ""]] as const).map(([text, value, cls]) => (
        <div key={text} className="rounded-2xl border border-[#EFEAF3] bg-white p-4">
          <p className="text-xs text-[#737174]">{text}</p>
          <strong className={`mt-1 block text-3xl ${cls}`}>{value}</strong>
        </div>
      ))}
    </div>

    {items.length === 0 ? (
      // An empty queue is the goal, not an absence of data - so it says so rather than apologising.
      <div className="rounded-2xl border border-[#EFEAF3] bg-white p-12 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-[#E9F7F1] text-[#0B6B4F]"><Check size={22} /></span>
        <h3 className="mt-4 font-serif text-2xl">Nothing needs you right now</h3>
        <p className="mt-2 text-sm text-[#737174]">No failed payments, expiring trials, or branches waiting. This is what done looks like.</p>
      </div>
    ) : (
      <div className="space-y-2">
        {items.map((item) => {
          const style = TONE[item.kind] ?? TONE.LEAD_FOLLOW_UP;
          const isLead = item.kind === "LEAD_FOLLOW_UP";
          return (
            <button
              key={`${item.kind}-${item.id}`}
              onClick={() => router.push(isLead ? "/platformadmin/pipeline" : `/platformadmin/customers/${item.id}`)}
              className={`flex w-full items-stretch overflow-hidden rounded-xl border text-left transition hover:shadow-[0_2px_12px_rgba(91,42,134,0.08)] ${style.wrap}`}
            >
              <span className={`w-1 shrink-0 ${style.bar}`} />
              <span className="flex flex-1 items-center gap-3 p-3.5">
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.08em] ${style.chip}`}>{readable(item.kind)}</span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm text-[#1F2937]">{item.title}</strong>
                  <span className="mt-0.5 block truncate text-xs text-[#6B7280]">{item.detail}</span>
                </span>
                <ChevronRight size={15} className="shrink-0 text-[#9CA3AF]" />
              </span>
            </button>
          );
        })}
      </div>
    )}
  </div>;
}
