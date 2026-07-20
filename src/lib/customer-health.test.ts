import { describe, expect, it } from "vitest";
import { assessHealth, computeChurn } from "./customer-health";

const settled = { ageDays: 120, billsThisWeek: 40, billsLastWeek: 40, daysSinceLastBill: 0 };

describe("assessHealth", () => {
  it("is healthy when billing steadily", () => {
    const health = assessHealth(settled);
    expect(health.band).toBe("HEALTHY");
    expect(health.evidence[0]).toBe("40 bills this week");
  });

  /** A new salon is still setting up; judging it by a settled salon's volume flags every signup. */
  it("does not judge a salon in its first fortnight", () => {
    expect(assessHealth({ ...settled, ageDays: 3, billsThisWeek: 0, daysSinceLastBill: null }).band).toBe("NEW");
  });

  it("calls a salon dormant once billing stops", () => {
    const health = assessHealth({ ...settled, daysSinceLastBill: 21 });
    expect(health.band).toBe("DORMANT");
    expect(health.evidence[0]).toBe("No bills for 21 days");
  });

  it("treats a settled salon that never billed as dormant", () => {
    expect(assessHealth({ ...settled, billsThisWeek: 0, billsLastWeek: 0, daysSinceLastBill: null }).band).toBe("DORMANT");
  });

  /** The one that becomes a cancellation next month if nobody rings. */
  it("flags a halving as at risk, with the numbers", () => {
    const health = assessHealth({ ...settled, billsThisWeek: 9, billsLastWeek: 40 });
    expect(health.band).toBe("AT_RISK");
    expect(health.evidence[0]).toBe("Bills down from 40 to 9 this week");
  });

  it("flags a quieter slide as worth watching", () => {
    const health = assessHealth({ ...settled, billsThisWeek: 28, billsLastWeek: 40 });
    expect(health.band).toBe("WATCH");
    expect(health.evidence[0]).toContain("30%");
  });

  /**
   * A salon that went 2 → 1 has "halved", and it means nothing. Percentages on tiny numbers are
   * noise, and chasing them trains everyone to ignore the warnings that matter.
   */
  it("ignores percentage swings on tiny volumes", () => {
    expect(assessHealth({ ...settled, billsThisWeek: 1, billsLastWeek: 2 }).band).toBe("HEALTHY");
  });

  it("notices a week of silence even without a drop", () => {
    expect(assessHealth({ ...settled, billsThisWeek: 0, billsLastWeek: 0, daysSinceLastBill: 9 }).band).toBe("AT_RISK");
  });

  it("says so when a salon is growing", () => {
    const health = assessHealth({ ...settled, billsThisWeek: 55, billsLastWeek: 40 });
    expect(health.band).toBe("HEALTHY");
    expect(health.evidence).toContain("Up from 40");
  });

  it("sorts the worst first", () => {
    const bands = [
      assessHealth(settled),
      assessHealth({ ...settled, daysSinceLastBill: 30 }),
      assessHealth({ ...settled, billsThisWeek: 9, billsLastWeek: 40 }),
    ].sort((left, right) => left.rank - right.rank).map((health) => health.band);
    expect(bands).toEqual(["DORMANT", "AT_RISK", "HEALTHY"]);
  });
});

describe("computeChurn", () => {
  it("reports both customer and revenue churn", () => {
    const churn = computeChurn({ startingCustomers: 20, cancelled: 2, cancelledMrr: 4000, startingMrr: 40000, newMrr: 6000 });
    expect(churn.customerChurnPercent).toBe(10);
    expect(churn.revenueChurnPercent).toBe(10);
    expect(churn.netMrrChange).toBe(2000);
    expect(churn.growing).toBe(true);
  });

  /**
   * The case that makes reporting customer count alone dishonest: two small wins against one big
   * loss looks like growth by headcount and is a serious loss by revenue.
   */
  it("shows a revenue loss that a customer count would hide", () => {
    const churn = computeChurn({ startingCustomers: 20, cancelled: 1, cancelledMrr: 11999, startingMrr: 60000, newMrr: 3998 });
    expect(churn.customerChurnPercent).toBe(5);
    expect(churn.revenueChurnPercent).toBe(20);
    expect(churn.growing).toBe(false);
    expect(churn.netMrrChange).toBeLessThan(0);
  });

  it("is all zero for a month with no customers", () => {
    const churn = computeChurn({ startingCustomers: 0, cancelled: 0, cancelledMrr: 0, startingMrr: 0, newMrr: 0 });
    expect(churn.customerChurnPercent).toBe(0);
    expect(churn.revenueChurnPercent).toBe(0);
  });

  it("keeps one decimal rather than rounding a real number to zero", () => {
    expect(computeChurn({ startingCustomers: 300, cancelled: 1, cancelledMrr: 0, startingMrr: 0, newMrr: 0 }).customerChurnPercent).toBe(0.3);
  });
});
