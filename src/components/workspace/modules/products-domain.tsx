"use client";

import { useState } from "react";
import { Boxes, SlidersHorizontal } from "lucide-react";
import type { WorkspaceData } from "@/lib/operations-types";

import { SubmitFn } from "@/components/workspace/contracts";
import { DomainTabs } from "@/components/workspace/modules/domain-tabs";
import { MastersView } from "@/components/workspace/modules/masters";
import { InventoryView } from "@/components/workspace/modules/stock";

/**
 * Everything about products in one place.
 *
 * A salon owner does not think "I'll set up a category master, then a brand master, then go to a
 * different screen to add the product". They think "I sell products; let me manage them". So the
 * product catalogue and the setup it depends on - categories, brands, units, tax - live on one
 * screen behind two tabs.
 */
export function ProductsDomain({ data, submit, openStock }: { data: WorkspaceData; submit: SubmitFn; openStock: () => void }) {
  const [tab, setTab] = useState<"catalogue" | "setup">("catalogue");

  return <div className="space-y-4">
    <DomainTabs
      active={tab}
      onChange={setTab}
      tabs={[
        { id: "catalogue", label: "Products", icon: <Boxes size={15} /> },
        { id: "setup", label: "Categories, brands & tax", icon: <SlidersHorizontal size={15} /> },
      ]}
    />

    {tab === "catalogue" && <InventoryView data={data} open={openStock} submit={submit} />}
    {tab === "setup" && <MastersView data={data} submit={submit} scope="products" flush />}
  </div>;
}
