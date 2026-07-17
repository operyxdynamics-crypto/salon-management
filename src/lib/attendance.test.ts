import { describe, expect, it } from "vitest";
import { assessCheckIn, computePayslip, distanceMeters, lateMinutes } from "./attendance";

/** Velvet Glow, Whitefield. A real pair of coordinates so the distances mean something. */
const BRANCH = { latitude: 12.9698, longitude: 77.7500, geofenceRadiusMeters: 150, lateGraceMinutes: 0 };
const AT_THE_DESK = { latitude: 12.9698, longitude: 77.7500 };
/** ~600m away - a client's home down the road. */
const DOWN_THE_ROAD = { latitude: 12.9750, longitude: 77.7500 };

const shiftStart = new Date("2026-07-17T04:00:00Z"); // 09:30 IST
const onTime = new Date("2026-07-17T03:58:00Z");
const tenLate = new Date("2026-07-17T04:10:00Z");

describe("distanceMeters", () => {
  it("is zero at the same point", () => {
    expect(distanceMeters(AT_THE_DESK, AT_THE_DESK)).toBe(0);
  });

  it("measures a known north-south hop", () => {
    // 0.0052 degrees of latitude is ~578m anywhere on earth.
    expect(distanceMeters(AT_THE_DESK, DOWN_THE_ROAD)).toBeGreaterThan(500);
    expect(distanceMeters(AT_THE_DESK, DOWN_THE_ROAD)).toBeLessThan(650);
  });

  it("is symmetric", () => {
    expect(distanceMeters(AT_THE_DESK, DOWN_THE_ROAD)).toBe(distanceMeters(DOWN_THE_ROAD, AT_THE_DESK));
  });

  it("handles the equator and the date line without blowing up", () => {
    expect(distanceMeters({ latitude: 0, longitude: 179.999 }, { latitude: 0, longitude: -179.999 })).toBeLessThan(300);
  });
});

describe("lateMinutes", () => {
  it("is zero when early or exactly on time", () => {
    expect(lateMinutes(onTime, shiftStart)).toBe(0);
    expect(lateMinutes(shiftStart, shiftStart)).toBe(0);
  });

  it("counts whole minutes past the start", () => {
    expect(lateMinutes(tenLate, shiftStart)).toBe(10);
  });

  it("honours a grace period", () => {
    expect(lateMinutes(tenLate, shiftStart, 10)).toBe(0);
    expect(lateMinutes(tenLate, shiftStart, 5)).toBe(5);
  });

  /** Nobody is late for a shift that was never rostered. */
  it("is never late without a shift", () => {
    expect(lateMinutes(tenLate, null)).toBe(0);
  });
});

describe("assessCheckIn", () => {
  it("approves on time and at the desk, with no reasons", () => {
    const result = assessCheckIn({ clockIn: onTime, shiftStart, branch: BRANCH, location: { ...AT_THE_DESK, accuracyMeters: 20 } });
    expect(result).toMatchObject({ kind: "ON_SITE", status: "APPROVED", lateMinutes: 0 });
    expect(result.reasons).toEqual([]);
  });

  it("sends a late arrival for approval, and says how late", () => {
    const result = assessCheckIn({ clockIn: tenLate, shiftStart, branch: BRANCH, location: { ...AT_THE_DESK, accuracyMeters: 20 } });
    expect(result.status).toBe("PENDING");
    expect(result.kind).toBe("ON_SITE");
    expect(result.lateMinutes).toBe(10);
    expect(result.reasons).toContain("10 minutes after shift start");
  });

  it("treats a distant check-in as off-site field work, pending approval", () => {
    const result = assessCheckIn({ clockIn: onTime, shiftStart, branch: BRANCH, location: { ...DOWN_THE_ROAD, accuracyMeters: 15 } });
    expect(result.kind).toBe("OFF_SITE");
    expect(result.status).toBe("PENDING");
    expect(result.distanceMeters).toBeGreaterThan(500);
  });

  /** Both problems at once. A reviewer should see both, not whichever we happened to check first. */
  it("reports being late AND off-site together", () => {
    const result = assessCheckIn({ clockIn: tenLate, shiftStart, branch: BRANCH, location: { ...DOWN_THE_ROAD, accuracyMeters: 15 } });
    expect(result.reasons).toHaveLength(2);
    expect(result.reasons.some((r) => r.includes("after shift start"))).toBe(true);
    expect(result.reasons.some((r) => r.includes("from the branch"))).toBe(true);
  });

  it("never blocks: a refused location still records, pending review", () => {
    const result = assessCheckIn({ clockIn: onTime, shiftStart, branch: BRANCH, location: null });
    expect(result.status).toBe("PENDING");
    expect(result.distanceMeters).toBeNull();
    expect(result.reasons).toContain("No location from the device");
  });

  it("does not punish someone when the branch has no coordinates", () => {
    const noCoords = { ...BRANCH, latitude: null, longitude: null };
    const result = assessCheckIn({ clockIn: onTime, shiftStart, branch: noCoords, location: { ...AT_THE_DESK, accuracyMeters: 10 } });
    expect(result.status).toBe("PENDING");
    expect(result.reasons).toContain("Branch has no location set");
  });

  /** A fix accurate to 2km cannot prove anything. Say so rather than quote a confident distance. */
  it("distrusts a wildly inaccurate fix", () => {
    const result = assessCheckIn({ clockIn: onTime, shiftStart, branch: BRANCH, location: { ...AT_THE_DESK, accuracyMeters: 2000 } });
    expect(result.status).toBe("PENDING");
    expect(result.reasons).toContain("Location accurate only to 2000m");
  });

  /** Indoors, GPS drifts. Someone at the desk with a sloppy fix should not be marked off-site. */
  it("gives the device the benefit of its own error margin", () => {
    const justOutside = { latitude: 12.9713, longitude: 77.7500 }; // ~167m
    const strict = assessCheckIn({ clockIn: onTime, shiftStart, branch: BRANCH, location: { ...justOutside, accuracyMeters: 5 } });
    expect(strict.kind).toBe("OFF_SITE");

    const sloppy = assessCheckIn({ clockIn: onTime, shiftStart, branch: BRANCH, location: { ...justOutside, accuracyMeters: 60 } });
    expect(sloppy.kind).toBe("ON_SITE");
    expect(sloppy.status).toBe("APPROVED");
  });

  it("is on time without a shift, and still checks location", () => {
    const result = assessCheckIn({ clockIn: tenLate, shiftStart: null, branch: BRANCH, location: { ...AT_THE_DESK, accuracyMeters: 10 } });
    expect(result.status).toBe("APPROVED");
    expect(result.lateMinutes).toBe(0);
  });
});

describe("computePayslip", () => {
  const base = {
    monthlySalary: 30000,
    expectedDays: 26,
    workedDays: 26,
    paidLeaveDays: 0,
    serviceCommission: 4200,
    productCommission: 800,
    tips: 1500,
  };

  it("pays in full for a full month", () => {
    const slip = computePayslip(base);
    expect(slip.earnedSalary).toBe(30000);
    expect(slip.absentDays).toBe(0);
    expect(slip.salaryDeduction).toBe(0);
    expect(slip.gross).toBe(36500);
  });

  it("pro-rates salary for absence", () => {
    const slip = computePayslip({ ...base, workedDays: 24 });
    expect(slip.absentDays).toBe(2);
    expect(slip.earnedSalary).toBe(27692.31);
    expect(slip.salaryDeduction).toBe(2307.69);
  });

  /** Approved leave is paid - that is what approving it means. */
  it("counts approved leave as worked", () => {
    const slip = computePayslip({ ...base, workedDays: 24, paidLeaveDays: 2 });
    expect(slip.absentDays).toBe(0);
    expect(slip.earnedSalary).toBe(30000);
  });

  it("does not pay extra for working more days than rostered", () => {
    const slip = computePayslip({ ...base, workedDays: 30 });
    expect(slip.earnedSalary).toBe(30000);
  });

  it("never docks salary when nothing was rostered", () => {
    const slip = computePayslip({ ...base, expectedDays: 0, workedDays: 0 });
    expect(slip.earnedSalary).toBe(30000);
    expect(slip.absentDays).toBe(0);
  });

  /** Commission-only staff are a real arrangement, not a missing salary. */
  it("handles commission-only staff", () => {
    const slip = computePayslip({ ...base, monthlySalary: 0, workedDays: 20 });
    expect(slip.earnedSalary).toBe(0);
    expect(slip.gross).toBe(6500);
  });

  it("never pro-rates commission or tips", () => {
    const slip = computePayslip({ ...base, workedDays: 13 });
    expect(slip.serviceCommission).toBe(4200);
    expect(slip.tips).toBe(1500);
  });

  it("rounds to paise, not floating dust", () => {
    const slip = computePayslip({ ...base, monthlySalary: 33333.33, workedDays: 17 });
    expect(Number.isFinite(slip.gross)).toBe(true);
    expect(slip.gross.toString()).toMatch(/^\d+(\.\d{1,2})?$/);
  });
});
