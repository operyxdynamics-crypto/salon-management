"use client";

import { FormEvent, useState } from "react";
import { inr } from "@/lib/format";

type Plan = {
  id: string; code: string; name: string; description: string | null;
  monthlyPrice: number; annualPrice: number; setupFee: number; trialDays: number;
  maxBranches: number; maxStaff: number; maxServices: number; maxMonthlyAppointments: number; maxStorageMb: number;
  features: string[]; isPublic: boolean; isActive: boolean; sortOrder: number; subscribers: number;
};

const cap = (value: number, noun: string) => value <= 0 ? `Unlimited ${noun}` : `${value} ${noun}`;

export function PlansEditor({ plans }: { plans: Plan[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>, plan: Plan) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const number = (name: string, fallback: number) => {
      const raw = form.get(name);
      return raw === null || raw === "" ? fallback : Number(raw);
    };

    setBusy(true); setError(""); setMessage("");
    const response = await fetch("/api/v1/admin/plans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: plan.id, code: plan.code,
        name: String(form.get("name") || plan.name),
        description: String(form.get("description") || "") || undefined,
        monthlyPriceRupees: number("monthlyPrice", plan.monthlyPrice),
        annualPriceRupees: number("annualPrice", plan.annualPrice),
        setupFeeRupees: number("setupFee", plan.setupFee),
        trialDays: number("trialDays", plan.trialDays),
        maxBranches: number("maxBranches", plan.maxBranches),
        maxStaff: number("maxStaff", plan.maxStaff),
        maxServices: number("maxServices", plan.maxServices),
        maxMonthlyAppointments: plan.maxMonthlyAppointments,
        maxStorageMb: plan.maxStorageMb,
        features: plan.features,
        isPublic: form.get("isPublic") === "on",
        isActive: plan.isActive,
        sortOrder: plan.sortOrder,
      }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return setError(result.error?.message ?? "Unable to save plan");
    setMessage(`${plan.name} saved.`);
    window.setTimeout(() => window.location.reload(), 600);
  }

  return <div className="mt-6 space-y-4">
    <p className="rounded-2xl bg-[#FFF7DF] p-4 text-sm font-semibold text-[#865C12]">
      A price change here applies to new sales only. Existing customers keep what they agreed until their subscription is changed — silently re-pricing live salons would be indefensible. Set any limit to 0 for unlimited.
    </p>

    {(message || error) && <div className={`rounded-2xl p-4 text-sm font-bold ${error ? "bg-[#FDECEC] text-[#94302E]" : "bg-[#E9F7F1] text-[#0B6B4F]"}`}>{error || message}</div>}

    {plans.map((plan) => <section key={plan.id} className="rounded-2xl border border-[#EFEAF3] bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-serif text-2xl">{plan.name}</h3>
            {!plan.isPublic && <span className="rounded-full bg-[#F7F6F9] px-2 py-0.5 text-[10px] font-bold uppercase text-[#9CA3AF]">Hidden</span>}
          </div>
          <p className="mt-0.5 text-sm text-[#737174]">
            {inr.format(plan.monthlyPrice)}/mo · {inr.format(plan.annualPrice)}/yr · {plan.trialDays}-day trial
          </p>
          <p className="mt-0.5 text-xs text-[#9CA3AF]">
            {cap(plan.maxBranches, "branches")} · {cap(plan.maxStaff, "staff")} · {plan.subscribers} subscriber{plan.subscribers === 1 ? "" : "s"}
          </p>
        </div>
        <button onClick={() => setEditing(editing === plan.id ? null : plan.id)} className="rounded-full border border-[#E3D9EE] px-4 py-2 text-sm font-bold text-[#5B2A86] transition hover:bg-[#F3E8FF]">
          {editing === plan.id ? "Cancel" : "Edit"}
        </button>
      </div>

      {editing === plan.id && <form onSubmit={(event) => void save(event, plan)} className="mt-5 border-t border-[#EFEAF3] pt-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field name="name" label="Name" defaultValue={plan.name} />
          <Field name="monthlyPrice" label="Monthly ₹" type="number" defaultValue={plan.monthlyPrice} />
          <Field name="annualPrice" label="Annual ₹" type="number" defaultValue={plan.annualPrice} />
          <Field name="setupFee" label="Setup fee ₹" type="number" defaultValue={plan.setupFee} />
          <Field name="trialDays" label="Trial days" type="number" defaultValue={plan.trialDays} />
          <Field name="maxBranches" label="Branches (0 = ∞)" type="number" defaultValue={plan.maxBranches} />
          <Field name="maxStaff" label="Staff (0 = ∞)" type="number" defaultValue={plan.maxStaff} />
          <Field name="maxServices" label="Services (0 = ∞)" type="number" defaultValue={plan.maxServices} />
          <label className="text-sm font-bold lg:col-span-3">Description<input name="description" defaultValue={plan.description ?? ""} className="field mt-2" /></label>
          <label className="mt-7 flex items-center gap-2 text-sm font-bold"><input name="isPublic" type="checkbox" defaultChecked={plan.isPublic} /> Show publicly</label>
        </div>
        <button disabled={busy} className="primary mt-5">Save plan</button>
      </form>}
    </section>)}
  </div>;
}

function Field({ name, label, type = "text", defaultValue }: { name: string; label: string; type?: string; defaultValue: string | number }) {
  return <label className="text-sm font-bold">{label}<input name={name} type={type} defaultValue={defaultValue} className="field mt-2" /></label>;
}
