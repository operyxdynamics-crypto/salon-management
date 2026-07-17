"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { WorkspaceData } from "@/lib/operations-types";

import { Banner, SkeletonTable } from "@/components/ui";
import { queryWorkspace } from "@/components/workspace/client";
import { NavItem } from "@/components/workspace/contracts";
import { TodayView } from "@/components/workspace/modules/today";

/**
 * A side-by-side preview route.
 *
 * The action queue lives here rather than on Home so it can be judged against the existing
 * dashboard without replacing it. Nothing in the product links to this page.
 */

const ROUTES: Partial<Record<NavItem, string>> = {
  Overview: "/workspace/home",
  Appointments: "/workspace/bookings",
  "Point of sale": "/workspace/billing",
  Customers: "/workspace/customers",
  Register: "/workspace/day-close",
  Inventory: "/workspace/stock",
  Reports: "/workspace/reports",
  Settings: "/workspace/settings",
  Masters: "/workspace/masters",
};

export function TodayPreview() {
  const router = useRouter();
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await queryWorkspace<WorkspaceData>("/api/v1/operations/bootstrap"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load");
    }
  }, []);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  if (error) return <Banner tone="danger">{error}</Banner>;
  if (!data) return <SkeletonTable rows={5} columns={3} />;

  return <div className="space-y-4">
    <Banner tone="info">
      This is a preview of the action queue. Your existing Home is untouched at{" "}
      <a href="/workspace/home" className="underline">/workspace/home</a> - compare the two, then tell me which parts you want kept.
    </Banner>

    <TodayView
      data={data}
      navigate={(item) => router.push(ROUTES[item] ?? "/workspace/home")}
      openAppointment={() => router.push("/workspace/bookings")}
    />
  </div>;
}
