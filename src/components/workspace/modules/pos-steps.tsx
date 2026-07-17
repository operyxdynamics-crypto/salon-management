"use client";

import { CheckCircle2, ChevronRight } from "lucide-react";

export type PosStep = 1 | 2 | 3;

/**
 * The one navigation model for the POS, identical on desktop and mobile. Previously the
 * two breakpoints were effectively different products: mobile stacked five cards, desktop
 * used a split pane. Staff who learned one could not use the other.
 *
 * A completed step collapses to its answer ("Meera Sharma") and stays tappable, so nothing
 * is buried - you can always go back without losing the sale.
 */
export function PosStepRail({ step, setStep, customerLabel, itemLabel, canEnterItems, canEnterPay }: {
  step: PosStep;
  setStep: (step: PosStep) => void;
  customerLabel: string;
  itemLabel: string;
  canEnterItems: boolean;
  canEnterPay: boolean;
}) {
  const steps: Array<{ index: PosStep; title: string; value: string; enabled: boolean }> = [
    { index: 1, title: "Customer", value: customerLabel, enabled: true },
    { index: 2, title: "Items", value: itemLabel, enabled: canEnterItems },
    { index: 3, title: "Pay", value: "Take payment", enabled: canEnterPay },
  ];

  return <div className="flex overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
    {steps.map((item, index) => {
      const isActive = step === item.index;
      const isDone = step > item.index;
      return <button
        key={item.index}
        type="button"
        disabled={!item.enabled}
        onClick={() => item.enabled && setStep(item.index)}
        aria-current={isActive ? "step" : undefined}
        className={`flex min-w-0 flex-1 items-center gap-2 px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 sm:px-4 ${index > 0 ? "border-l border-[#E5E7EB]" : ""} ${isActive ? "bg-[#eef5fc]" : "bg-white hover:bg-[#F7FAFC]"}`}
      >
        <span className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-extrabold ${isDone ? "bg-[#e7f8f2] text-[#0f6f57]" : isActive ? "bg-[#173279] text-white" : "border border-[#E5E7EB] text-[#737174]"}`}>
          {isDone ? <CheckCircle2 size={14} /> : item.index}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-[10px] font-extrabold uppercase tracking-[.14em] ${isActive ? "text-[#315d89]" : "text-[#737174]"}`}>{item.title}</span>
          <span className={`block truncate text-[13px] font-bold ${isActive ? "text-[#173279]" : isDone ? "text-[#1F2937]" : "text-[#737174]"}`}>{item.value}</span>
        </span>
        {isDone && <ChevronRight size={14} className="hidden shrink-0 text-[#1789AA] sm:block" />}
      </button>;
    })}
  </div>;
}
