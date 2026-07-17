"use client";

import { useState } from "react";
import { Gift, Ticket } from "lucide-react";
import type { WorkspaceData } from "@/lib/operations-types";

import { SubmitFn } from "@/components/workspace/contracts";
import { DomainTabs } from "@/components/workspace/modules/domain-tabs";
import { BenefitsView } from "@/components/workspace/modules/offers";
import { CouponsPanel } from "@/components/workspace/modules/masters-coupons";

/**
 * Everything a salon uses to bring people back and reward them, in one place: memberships,
 * packages, gift cards and reward rules on one tab, discount coupons on the other. Coupons used to
 * sit under the generic "masters" list; an owner thinks of them as an offer, so that is where they
 * belong.
 */
export function OffersDomain({ data, submit }: { data: WorkspaceData; submit: SubmitFn }) {
  const [tab, setTab] = useState<"benefits" | "coupons">("benefits");

  return <div className="space-y-4">
    <DomainTabs
      active={tab}
      onChange={setTab}
      tabs={[
        { id: "benefits", label: "Memberships & rewards", icon: <Gift size={15} /> },
        { id: "coupons", label: "Coupons", icon: <Ticket size={15} /> },
      ]}
    />

    {tab === "benefits" && <BenefitsView data={data} submit={submit} />}
    {tab === "coupons" && <CouponsPanel data={data} submit={submit} />}
  </div>;
}
