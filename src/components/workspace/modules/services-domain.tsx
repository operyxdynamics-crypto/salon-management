"use client";

import { useState } from "react";
import { Scissors, SlidersHorizontal } from "lucide-react";
import type { WorkspaceData } from "@/lib/operations-types";

import { SubmitFn } from "@/components/workspace/contracts";
import { DomainTabs } from "@/components/workspace/modules/domain-tabs";
import { MastersView } from "@/components/workspace/modules/masters";
import { ServicesViewV2 } from "@/components/workspace/modules/services";

/**
 * Everything about services in one place: the menu the salon offers, and the categories and tax
 * that shape it. Same idea as Products - the owner manages a domain, not a scattered set of masters.
 */
export function ServicesDomain({ data, submit, openService, openProfile }: {
  data: WorkspaceData;
  submit: SubmitFn;
  openService: () => void;
  openProfile: (id: string) => void;
}) {
  const [tab, setTab] = useState<"catalogue" | "setup">("catalogue");

  return <div className="space-y-4">
    <DomainTabs
      active={tab}
      onChange={setTab}
      tabs={[
        { id: "catalogue", label: "Services", icon: <Scissors size={15} /> },
        { id: "setup", label: "Categories & tax", icon: <SlidersHorizontal size={15} /> },
      ]}
    />

    {tab === "catalogue" && <ServicesViewV2 data={data} open={openService} submit={submit} openProfile={openProfile} />}
    {tab === "setup" && <MastersView data={data} submit={submit} scope="services" flush />}
  </div>;
}
