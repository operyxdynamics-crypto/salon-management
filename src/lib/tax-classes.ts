import type { WorkspaceData } from "@/lib/operations-types";

type TaxClass = WorkspaceData["taxClasses"][number];

/**
 * Tax dropdown options for a service or product form.
 *
 * A service is a supply of a service (SAC) and a product is a supply of goods (HSN), so we show the
 * matching kind first. But we never hand back an empty list - if the salon has only defined one
 * kind so far, showing all of them beats blocking them from creating anything.
 */
export function taxOptionsForKind(taxClasses: TaxClass[], kind: "GOODS" | "SERVICE"): Array<[string, string]> {
  const preferred = taxClasses.filter((taxClass) => taxClass.kind === kind);
  const list = preferred.length ? preferred : taxClasses;
  return list.map((taxClass) => [taxClass.id, `${taxClass.name} · ${taxClass.rate}%`]);
}

/** The percentage behind a chosen tax class, so forms can send both the link and the rate. */
export function taxRateFor(taxClasses: TaxClass[], id: FormDataEntryValue | null): number | undefined {
  const match = taxClasses.find((taxClass) => taxClass.id === String(id ?? ""));
  return match?.rate;
}
