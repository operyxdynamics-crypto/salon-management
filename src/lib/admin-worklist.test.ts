import { describe, expect, it } from "vitest";
import { buildWorklist, revenueAtRisk, type SubscriptionRow } from "./admin-worklist";

const now = new Date("2026-07-20T10:00:00Z");
const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000);
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

const salon = (over: Partial<SubscriptionRow> & { tenantId: string; tenantName: string }): SubscriptionRow => ({
  status: "ACTIVE", planName: "Salon", trialEndsAt: null, currentPeriodEnd: null,
  pastDueSince: null, hasActivity: true, createdAt: daysAgo(60), ...over,
});

const empty = { subscriptions: [], pendingBranches: [], leads: [], now };

describe("buildWorklist", () => {
  it("is empty when nothing needs doing", () => {
    expect(buildWorklist(empty)).toEqual([]);
  });

  it("surfaces a failed payment with how long it has been failing", () => {
    const [item] = buildWorklist({ ...empty, subscriptions: [salon({ tenantId: "t1", tenantName: "Velvet Glow", status: "PAST_DUE", pastDueSince: daysAgo(3) })] });
    expect(item.kind).toBe("PAST_DUE");
    expect(item.detail).toContain("3 days ago");
  });

  it("warns about a trial inside the horizon but not one far out", () => {
    const soon = buildWorklist({ ...empty, subscriptions: [salon({ tenantId: "t1", tenantName: "A", status: "TRIALING", trialEndsAt: inDays(2) })] });
    expect(soon[0].kind).toBe("TRIAL_ENDING");

    const later = buildWorklist({ ...empty, subscriptions: [salon({ tenantId: "t2", tenantName: "B", status: "TRIALING", trialEndsAt: inDays(20) })] });
    expect(later).toEqual([]);
  });

  it("says 'today' rather than 'in 0 days'", () => {
    const [item] = buildWorklist({ ...empty, subscriptions: [salon({ tenantId: "t1", tenantName: "A", status: "TRIALING", trialEndsAt: now })] });
    expect(item.detail).toBe("Trial ends today");
  });

  it("separates an expired trial from an expiring one", () => {
    const [item] = buildWorklist({ ...empty, subscriptions: [salon({ tenantId: "t1", tenantName: "A", status: "TRIALING", trialEndsAt: daysAgo(2) })] });
    expect(item.kind).toBe("TRIAL_EXPIRED");
    expect(item.detail).toContain("never converted");
  });

  /**
   * The ordering is the whole point: money already leaking beats money not yet won.
   */
  it("ranks by what it costs to ignore", () => {
    const items = buildWorklist({
      subscriptions: [
        salon({ tenantId: "lead-ish", tenantName: "Renewing", currentPeriodEnd: inDays(3) }),
        salon({ tenantId: "trial", tenantName: "Trialing", status: "TRIALING", trialEndsAt: inDays(2) }),
        salon({ tenantId: "late", tenantName: "Late payer", status: "PAST_DUE", pastDueSince: daysAgo(1) }),
      ],
      pendingBranches: [{ tenantId: "wait", tenantName: "Waiting", branchName: "Whitefield", submittedAt: daysAgo(2) }],
      leads: [{ id: "l1", salonName: "Prospect", contactName: "Asha", followUpAt: now, status: "NEW" }],
      now,
    });
    expect(items.map((item) => item.kind)).toEqual([
      "PAST_DUE", "BRANCH_APPROVAL", "TRIAL_ENDING", "RENEWAL_DUE", "LEAD_FOLLOW_UP",
    ]);
  });

  it("puts the longest-failing payment first", () => {
    const items = buildWorklist({
      ...empty,
      subscriptions: [
        salon({ tenantId: "a", tenantName: "One day", status: "PAST_DUE", pastDueSince: daysAgo(1) }),
        salon({ tenantId: "b", tenantName: "Ten days", status: "PAST_DUE", pastDueSince: daysAgo(10) }),
      ],
    });
    expect(items[0].title).toBe("Ten days");
  });

  /** A salon that never used the product is a refund waiting to happen. */
  it("flags a salon that signed up and never took a booking", () => {
    const [item] = buildWorklist({ ...empty, subscriptions: [salon({ tenantId: "t1", tenantName: "Quiet", hasActivity: false, createdAt: daysAgo(9) })] });
    expect(item.kind).toBe("NEVER_ACTIVATED");
  });

  it("gives a brand-new salon a few days before nagging", () => {
    expect(buildWorklist({ ...empty, subscriptions: [salon({ tenantId: "t1", tenantName: "New", hasActivity: false, createdAt: daysAgo(1) })] })).toEqual([]);
  });

  it("ignores a lead with no follow-up date", () => {
    expect(buildWorklist({ ...empty, leads: [{ id: "l1", salonName: "X", contactName: "Y", followUpAt: null, status: "NEW" }] })).toEqual([]);
  });

  it("marks an overdue follow-up as overdue", () => {
    const [item] = buildWorklist({ ...empty, leads: [{ id: "l1", salonName: "X", contactName: "Asha", followUpAt: daysAgo(4), status: "NEW" }] });
    expect(item.detail).toContain("4 days overdue");
  });
});

describe("revenueAtRisk", () => {
  const value = () => 1999;

  it("separates failing, expiring and renewing money", () => {
    const risk = revenueAtRisk([
      salon({ tenantId: "a", tenantName: "A", status: "PAST_DUE", pastDueSince: daysAgo(2) }),
      salon({ tenantId: "b", tenantName: "B", status: "TRIALING", trialEndsAt: inDays(3) }),
      salon({ tenantId: "c", tenantName: "C", currentPeriodEnd: inDays(5) }),
      salon({ tenantId: "d", tenantName: "D", currentPeriodEnd: inDays(60) }),
    ], value, now);

    expect(risk).toEqual({ pastDue: 1999, trialEnding: 1999, renewing: 1999 });
  });

  it("is all zero when nothing is at risk", () => {
    expect(revenueAtRisk([salon({ tenantId: "a", tenantName: "A", currentPeriodEnd: inDays(90) })], value, now))
      .toEqual({ pastDue: 0, trialEnding: 0, renewing: 0 });
  });
});
