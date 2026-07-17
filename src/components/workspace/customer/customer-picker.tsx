"use client";

import { FormEvent, useEffect, useState } from "react";
import { Plus, Search, Users } from "lucide-react";
import type { SubmitFn } from "@/components/workspace/contracts";
import { searchCustomers } from "@/components/workspace/customer/api";
import type { CustomerChoice } from "@/components/workspace/customer/types";
import { Field, WorkspaceModalShell } from "@/components/workspace/shared-ui";

export function CustomerPicker({ branchId, value, initialCustomers, onChange, submit }: { branchId: string; value: string; initialCustomers: CustomerChoice[]; onChange: (customer: CustomerChoice) => void; submit: SubmitFn }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerChoice[]>(initialCustomers.slice(0, 8));
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [localError, setLocalError] = useState("");
  const selected = query.trim() ? null : [...results, ...initialCustomers].find((customer) => customer.id === value);

  useEffect(() => {
    if (query.trim().length < 2) {
      queueMicrotask(() => setResults(initialCustomers.filter((customer) => `${customer.name} ${customer.phone}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8)));
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        setResults(await searchCustomers(branchId, query.trim(), controller.signal));
      } catch (searchError) {
        if (!(searchError instanceof DOMException && searchError.name === "AbortError")) setLocalError(searchError instanceof Error ? searchError.message : "Unable to search customers");
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [branchId, initialCustomers, query]);

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await submit<CustomerChoice & { existing: boolean }>("/api/v1/operations/customers", {
      branchId,
      name: form.get("name"),
      phone: form.get("phone"),
      email: form.get("email"),
      notes: form.get("notes"),
    }, "Customer selected.", "POST", false);
    if (result.ok) {
      const customer = result.data;
      setResults((current) => [customer, ...current.filter((item) => item.id !== customer.id)]);
      onChange(customer);
      setAdding(false);
      setQuery("");
    } else {
      setLocalError(result.error);
    }
  }

  return <div className="rounded-2xl border border-black/8 bg-white p-2.5">
    <div className="flex gap-2"><label className="workspace-search-field flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-black/10 px-3"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full py-2.5 text-sm outline-none" placeholder="Name or mobile" /></label><button type="button" onClick={() => setAdding(true)} className="shrink-0 rounded-xl bg-[#173279] px-3 text-sm font-bold text-white"><Plus size={14} className="mr-1 inline" /> Add</button></div>
    {selected && <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-[#a8ead8] bg-[#e7f8f2] p-3 text-sm"><span className="min-w-0"><strong className="block truncate">{selected.name}</strong><span className="block truncate text-xs text-[#5d655f]">{selected.phone}</span></span>{Boolean(selected.allergies || selected.notes) && <span className="shrink-0 rounded-full bg-[#fff0ec] px-2 py-1 text-[10px] font-extrabold text-[#995849]">Alert</span>}</div>}
    {!selected && <div className="mt-2 max-h-52 overflow-y-auto">{searching ? <p className="p-3 text-sm text-[#737174]">Searching...</p> : results.map((customer) => <button type="button" key={customer.id} onClick={() => onChange(customer)} className="flex w-full items-center justify-between gap-3 rounded-xl p-3 text-left hover:bg-[#F7FAFC]"><span className="min-w-0"><strong className="block truncate text-sm">{customer.name}</strong><span className="block truncate text-xs text-[#737174]">{customer.phone}</span></span><span className="flex shrink-0 items-center gap-1">{Boolean(customer.allergies || customer.notes) && <span className="rounded-full bg-[#fff0ec] px-2 py-1 text-[10px] font-extrabold text-[#995849]">Alert</span>}<span className="rounded-full bg-[#F7FAFC] px-2 py-1 text-[10px] font-bold text-[#737174]">{customer.visits || 0} visits</span></span></button>)}</div>}
    {localError && <p className="mt-2 text-xs font-bold text-[#995849]">{localError}</p>}
    {adding && <WorkspaceModalShell title="Add customer" eyebrow="Quick profile" description="Name and mobile are enough to continue." icon={<Users size={22} />} close={() => setAdding(false)} onSubmit={createCustomer} busy={false} error={localError} submitLabel="Select customer">
      <div className="space-y-5">
        <div className="rounded-3xl border border-[#16B994]/20 bg-[#F7FAFC] p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="name" label="Customer name" />
            <Field name="phone" label="India mobile" defaultValue="+91" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="email" label="Email" type="email" required={false} />
          <Field name="notes" label="Notes" required={false} />
        </div>
      </div>
    </WorkspaceModalShell>}
  </div>;
}
