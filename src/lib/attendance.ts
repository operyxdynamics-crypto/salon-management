/**
 * Attendance rules: where someone was, whether they were late, and whether that needs a human.
 *
 * Kept pure and separate from the route because this decides whether people get paid. It should be
 * provable by a test, not by clocking in and squinting at the result.
 *
 * The governing principle: **a check-in is never blocked.** Someone standing at the counter at 9am
 * is at work, whether or not their phone found a satellite. What the rules decide is not whether
 * work may start, but whether the record stands on its own or needs a manager to look at it. Any
 * other design pits the software against the person trying to do their job.
 */

export type AttendanceKind = "ON_SITE" | "OFF_SITE";
export type AttendanceStatus = "APPROVED" | "PENDING" | "REJECTED";

export type Coordinates = { latitude: number; longitude: number };

/** Anything past this and the fix is a working phone, not a manager's judgement. */
export const UNUSABLE_ACCURACY_METERS = 1000;

const EARTH_RADIUS_METRES = 6_371_000;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Great-circle distance in metres.
 *
 * Haversine, not a flat approximation: cheap, and correct everywhere including across the equator
 * and the date line. Precision beyond a metre is meaningless here anyway - consumer GPS is not that
 * good - so the result is rounded.
 */
export function distanceMeters(from: Coordinates, to: Coordinates): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(a))));
}

/**
 * Minutes late, after the branch's grace period.
 *
 * Early is not negative-late: it is simply on time. Without a rostered shift there is nothing to be
 * late for, so an unrostered check-in is never marked late - the person may be covering, and
 * inventing a lateness from a shift that does not exist would be a lie.
 */
export function lateMinutes(clockIn: Date, shiftStart: Date | null, graceMinutes = 0): number {
  if (!shiftStart) return 0;
  const allowedFrom = shiftStart.getTime() + graceMinutes * 60_000;
  const over = clockIn.getTime() - allowedFrom;
  return over <= 0 ? 0 : Math.floor(over / 60_000);
}

export type CheckInInput = {
  clockIn: Date;
  /** The rostered shift being started, if there is one. */
  shiftStart: Date | null;
  branch: {
    latitude: number | null;
    longitude: number | null;
    geofenceRadiusMeters: number;
    lateGraceMinutes: number;
  };
  /** What the device reported. Null when it refused, failed, or was never asked. */
  location: (Coordinates & { accuracyMeters?: number | null }) | null;
};

export type CheckInAssessment = {
  kind: AttendanceKind;
  status: AttendanceStatus;
  distanceMeters: number | null;
  lateMinutes: number;
  /** Plain-language reasons this needs review. Empty when the check-in stands on its own. */
  reasons: string[];
};

/**
 * Decide what a check-in is worth.
 *
 * Off-site and late are assessed independently and can both be true - someone can be late *and* at
 * a client's home, and the reviewer should see both reasons rather than the first one found.
 */
export function assessCheckIn(input: CheckInInput): CheckInAssessment {
  const { clockIn, shiftStart, branch, location } = input;
  const reasons: string[] = [];

  const late = lateMinutes(clockIn, shiftStart, branch.lateGraceMinutes);
  if (late > 0) reasons.push(`${late} minute${late === 1 ? "" : "s"} after shift start`);

  const branchHasLocation = branch.latitude !== null && branch.longitude !== null;
  const accuracy = location?.accuracyMeters ?? null;
  const accuracyUnusable = accuracy !== null && accuracy > UNUSABLE_ACCURACY_METERS;

  // No location to compare: not the person's fault, and not evidence of anything. Record the
  // check-in and let a manager decide, rather than accusing them or waving them through.
  if (!location || !branchHasLocation || accuracyUnusable) {
    if (!location) reasons.push("No location from the device");
    else if (accuracyUnusable) reasons.push(`Location accurate only to ${accuracy}m`);
    else reasons.push("Branch has no location set");

    return { kind: "OFF_SITE", status: "PENDING", distanceMeters: null, lateMinutes: late, reasons };
  }

  const metres = distanceMeters(
    { latitude: branch.latitude!, longitude: branch.longitude! },
    { latitude: location.latitude, longitude: location.longitude },
  );

  // Give the device its own claimed error margin. A 40m-accurate fix 160m away from a 150m fence
  // could genuinely be inside it, and a person should not be marked off-site by rounding.
  const effective = Math.max(0, metres - (accuracy ?? 0));
  const onSite = effective <= branch.geofenceRadiusMeters;
  if (!onSite) reasons.push(`${metres}m from the branch`);

  return {
    kind: onSite ? "ON_SITE" : "OFF_SITE",
    status: reasons.length ? "PENDING" : "APPROVED",
    distanceMeters: metres,
    lateMinutes: late,
    reasons,
  };
}

/* ------------------------------------------------------------------------------ payroll */

export type PayslipInput = {
  monthlySalary: number;
  /** Days the salon expected this person to work, from the roster. */
  expectedDays: number;
  /** Days they actually did, counting approved attendance only. */
  workedDays: number;
  /** Days off that are paid anyway - approved leave. */
  paidLeaveDays: number;
  serviceCommission: number;
  productCommission: number;
  tips: number;
};

export type Payslip = {
  earnedSalary: number;
  absentDays: number;
  salaryDeduction: number;
  serviceCommission: number;
  productCommission: number;
  tips: number;
  gross: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * What someone is owed for a period.
 *
 * Salary is pro-rated against days actually worked, because that is the only defensible way to
 * treat an absence. Approved leave counts as worked - that is what "approved" means. Pending
 * attendance counts as nothing: an unreviewed record is not evidence of work, and paying on it
 * would make the approval queue decorative.
 *
 * Commission and tips are earned per sale and never pro-rated.
 */
export function computePayslip(input: PayslipInput): Payslip {
  const { monthlySalary, expectedDays, workedDays, paidLeaveDays } = input;

  const credited = Math.min(expectedDays, workedDays + paidLeaveDays);
  const absentDays = Math.max(0, expectedDays - credited);

  // No roster means no basis to dock anyone - pay the salary in full rather than invent absence.
  const earnedSalary = expectedDays > 0
    ? round2((monthlySalary * credited) / expectedDays)
    : round2(monthlySalary);

  const salaryDeduction = round2(monthlySalary - earnedSalary);
  const serviceCommission = round2(input.serviceCommission);
  const productCommission = round2(input.productCommission);
  const tips = round2(input.tips);

  return {
    earnedSalary,
    absentDays,
    salaryDeduction,
    serviceCommission,
    productCommission,
    tips,
    gross: round2(earnedSalary + serviceCommission + productCommission + tips),
  };
}
