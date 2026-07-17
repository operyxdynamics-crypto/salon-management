"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Search, X } from "lucide-react";
import type { WorkspaceData } from "@/lib/operations-types";

type Branch = WorkspaceData["identity"]["branches"][number];
type Model = "COCO" | "FOCO" | "FOFO";

export type OwnershipFilter = "ALL" | Model;

/**
 * Each ownership model gets its own colour, and the topbar wears the colour of whatever is
 * currently in scope. It should be possible to tell at a glance - without reading - whether you
 * are looking at the whole business, only the branches you operate, or one franchise.
 *
 * Purple (the brand accent) is reserved for a single branch, because that is the most specific
 * thing you can be looking at.
 */
export const SCOPE_TONES: Record<"SINGLE" | "ALL" | Model, { chip: string; trigger: string; dot: string }> = {
  SINGLE: { chip: "bg-[#EFE8F6] text-[#5B2A86]", trigger: "border-[#D8B4FE] bg-[#F5F0FA] text-[#4B1F72]", dot: "bg-[#5B2A86]" },
  ALL: { chip: "bg-[#E8EAF0] text-[#434959]", trigger: "border-[#D2D6DF] bg-[#F6F7FA] text-[#434959]", dot: "bg-[#5C6373]" },
  COCO: { chip: "bg-[#EAF1FC] text-[#22509E]", trigger: "border-[#B9CEEE] bg-[#EAF1FC] text-[#22509E]", dot: "bg-[#2F6BD1]" },
  FOCO: { chip: "bg-[#FEF5E6] text-[#8A5C00]", trigger: "border-[#EFD9A8] bg-[#FEF5E6] text-[#8A5C00]", dot: "bg-[#B57900]" },
  FOFO: { chip: "bg-[#E9F7F1] text-[#0B6B4F]", trigger: "border-[#A9DFCB] bg-[#E9F7F1] text-[#0B6B4F]", dot: "bg-[#12916C]" },
};

const FILTERS: Array<{ id: OwnershipFilter; label: string; hint: string }> = [
  { id: "ALL", label: "All", hint: "Every branch you can see" },
  { id: "COCO", label: "COCO", hint: "Company owned, company operated" },
  { id: "FOCO", label: "FOCO", hint: "Franchise owned, company operated" },
  { id: "FOFO", label: "FOFO", hint: "Franchise owned and operated" },
];

/**
 * What the current scope is, in words and in colour.
 *
 * "3 FOFO branches" is a far more useful thing for an owner to read than "3 branches selected" -
 * it says which part of the business they are looking at.
 */
export function scopeSummary(branches: Branch[], selectedIds: string[], allSelected: boolean) {
  const total = branches.length;
  const selected = allSelected ? branches : branches.filter((branch) => selectedIds.includes(branch.id));

  if (!selected.length) return { label: "No branch selected", detail: "Pick at least one", tone: SCOPE_TONES.ALL, key: "ALL" as const };
  if (allSelected || selected.length === total) {
    return { label: "All branches", detail: `${total} branch${total === 1 ? "" : "es"}`, tone: SCOPE_TONES.ALL, key: "ALL" as const };
  }
  if (selected.length === 1) {
    const branch = selected[0];
    return { label: branch.name, detail: `${branch.ownershipModel} - ${branch.city}`, tone: SCOPE_TONES.SINGLE, key: "SINGLE" as const };
  }

  const models = new Set(selected.map((branch) => branch.ownershipModel));
  if (models.size === 1) {
    const model = [...models][0];
    const inModel = branches.filter((branch) => branch.ownershipModel === model).length;
    const isWholeGroup = selected.length === inModel;
    return {
      label: isWholeGroup ? `All ${model}` : `${selected.length} ${model} branches`,
      detail: isWholeGroup ? `${inModel} branch${inModel === 1 ? "" : "es"}` : `of ${inModel} ${model}`,
      tone: SCOPE_TONES[model],
      key: model,
    };
  }

  return { label: `${selected.length} branches`, detail: "Mixed ownership", tone: SCOPE_TONES.SINGLE, key: "SINGLE" as const };
}

/**
 * Branch scope picker.
 *
 * Tabs FILTER; they do not select. Clicking a tab used to replace the selection, which meant
 * clicking a group with no branches in it silently emptied the scope. Selecting is now an
 * explicit "Select all N" button inside each tab.
 */
export function BranchScopePicker({ branches, draftIds, allSelected, setDraftIds, setAllSelected }: {
  branches: Branch[];
  draftIds: string[];
  allSelected: boolean;
  setDraftIds: (ids: string[]) => void;
  setAllSelected: (all: boolean) => void;
}) {
  const [filter, setFilter] = useState<OwnershipFilter>("ALL");
  const [search, setSearch] = useState("");

  const counts = useMemo(() => ({
    ALL: branches.length,
    COCO: branches.filter((branch) => branch.ownershipModel === "COCO").length,
    FOCO: branches.filter((branch) => branch.ownershipModel === "FOCO").length,
    FOFO: branches.filter((branch) => branch.ownershipModel === "FOFO").length,
  }), [branches]);

  const inFilter = useMemo(
    () => filter === "ALL" ? branches : branches.filter((branch) => branch.ownershipModel === filter),
    [branches, filter],
  );

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return inFilter;
    return inFilter.filter((branch) => `${branch.name} ${branch.city} ${branch.state} ${branch.operatorName ?? ""}`.toLowerCase().includes(query));
  }, [inFilter, search]);

  const groups = useMemo(() => {
    const map = new Map<string, { operator: string; branches: Branch[] }>();
    for (const branch of visible) {
      const key = branch.operatorEntityId ?? "unassigned";
      const operator = branch.operatorName ?? "No business assigned";
      if (!map.has(key)) map.set(key, { operator, branches: [] });
      map.get(key)!.branches.push(branch);
    }
    return [...map.values()].sort((left, right) => left.operator.localeCompare(right.operator));
  }, [visible]);

  const isSelected = (branchId: string) => allSelected || draftIds.includes(branchId);
  const filterIds = inFilter.map((branch) => branch.id);
  const allInFilterSelected = filterIds.length > 0 && filterIds.every((id) => isSelected(id));

  function toggle(branchId: string) {
    // "All" is a shorthand for every id. The moment one is removed it must become an explicit
    // list, or unticking a branch would do nothing.
    const current = allSelected ? branches.map((branch) => branch.id) : draftIds;
    const next = current.includes(branchId) ? current.filter((id) => id !== branchId) : [...current, branchId];
    setAllSelected(next.length === branches.length);
    setDraftIds(next);
  }

  function selectAllInFilter() {
    if (filter === "ALL") {
      setAllSelected(true);
      setDraftIds(branches.map((branch) => branch.id));
      return;
    }
    setAllSelected(false);
    setDraftIds(filterIds);
  }

  function clearFilterSelection() {
    const current = allSelected ? branches.map((branch) => branch.id) : draftIds;
    const next = current.filter((id) => !filterIds.includes(id));
    setAllSelected(false);
    setDraftIds(next);
  }

  const summary = scopeSummary(branches, allSelected ? branches.map((branch) => branch.id) : draftIds, allSelected);

  return <div className="space-y-3">
    <div className="grid grid-cols-4 gap-1 rounded-xl bg-[#F6F7FA] p-1">
      {FILTERS.map((item) => {
        const active = filter === item.id;
        const tone = item.id === "ALL" ? SCOPE_TONES.ALL : SCOPE_TONES[item.id];
        return <button
          key={item.id}
          type="button"
          onClick={() => setFilter(item.id)}
          title={item.hint}
          className={`rounded-lg px-2 py-1.5 text-xs font-extrabold transition ${active ? `${tone.chip} shadow-sm` : "text-[#7C8494] hover:text-[#2C3140]"}`}
        >
          {item.label}
          <span className="mt-0.5 block text-[10px] font-bold opacity-70">{counts[item.id]}</span>
        </button>;
      })}
    </div>

    <div className="flex items-center gap-2">
      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#E3E6EC] bg-white px-3">
        <Search size={15} className="shrink-0 text-[#A8AEBC]" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full py-2 text-sm outline-none" placeholder="Search branch, city, or business" />
        {search && <button type="button" onClick={() => setSearch("")} aria-label="Clear"><X size={14} className="text-[#7C8494]" /></button>}
      </label>

      {/* Select-all lives inside the filter, so it always means "all of THESE" - all COCO, all
          FOFO - never "all branches" by accident. */}
      {filterIds.length > 0 && <button
        type="button"
        onClick={allInFilterSelected ? clearFilterSelection : selectAllInFilter}
        className="shrink-0 rounded-xl border border-[#D2D6DF] bg-white px-3 py-2 text-xs font-extrabold text-[#434959] transition hover:bg-[#F6F7FA]"
      >
        {allInFilterSelected ? "Clear" : `Select all ${filterIds.length}`}
      </button>}
    </div>

    <div className="max-h-72 space-y-3 overflow-y-auto">
      {groups.map((group) => <div key={group.operator}>
        <p className="px-1 pb-1.5 text-[10px] font-extrabold uppercase tracking-[.14em] text-[#A8AEBC]">{group.operator}</p>
        <div className="space-y-1.5">
          {group.branches.map((branch) => {
            const selected = isSelected(branch.id);
            const tone = SCOPE_TONES[branch.ownershipModel];
            return <button
              key={branch.id}
              type="button"
              onClick={() => toggle(branch.id)}
              className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[.99] ${selected ? "border-[#5B2A86] bg-[#F6F2FB]" : "border-[#E3E6EC] bg-white hover:border-[#D2D6DF]"}`}
            >
              <span className={`grid size-5 shrink-0 place-items-center rounded-md border ${selected ? "border-[#5B2A86] bg-[#5B2A86] text-white" : "border-[#D2D6DF] bg-white"}`}>
                {selected && <CheckCircle2 size={13} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-extrabold text-[#1A1D28]">{branch.name}</span>
                  {/* The ownership model is on the branch itself, not only in the tabs - once a
                      mixed selection is applied you still need to know what each one is. */}
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-extrabold ${tone.chip}`}>{branch.ownershipModel}</span>
                </span>
                <span className={`mt-0.5 flex items-center gap-1 truncate text-xs font-semibold ${branch.gstReady ? "text-[#7C8494]" : "text-[#94302E]"}`}>
                  {!branch.gstReady && <AlertTriangle size={11} className="shrink-0" />}
                  {branch.gstReady
                    ? `${branch.state || branch.city} - ${branch.gstin?.slice(0, 8)}...`
                    : `${branch.state || branch.city} - no GSTIN, GST billing blocked`}
                </span>
              </span>
            </button>;
          })}
        </div>
      </div>)}

      {!visible.length && <div className="rounded-2xl border border-dashed border-[#D2D6DF] bg-[#F6F7FA] px-4 py-10 text-center">
        <p className="text-sm font-bold text-[#434959]">
          {counts[filter] === 0 ? `No ${filter === "ALL" ? "" : filter} branches` : "No branch found"}
        </p>
        <p className="mt-1 text-xs text-[#7C8494]">
          {counts[filter] === 0
            ? `You have no ${filter} branches. Set a branch's ownership in Settings > This branch.`
            : "Try another name, city, or business."}
        </p>
      </div>}
    </div>

    <div className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 ${summary.tone.chip}`}>
      <span className="flex min-w-0 items-center gap-2">
        <span className={`size-1.5 shrink-0 rounded-full ${summary.tone.dot}`} />
        <span className="truncate text-xs font-extrabold">{summary.label}</span>
      </span>
      <span className="shrink-0 text-[11px] font-bold opacity-75">{summary.detail}</span>
    </div>
  </div>;
}
