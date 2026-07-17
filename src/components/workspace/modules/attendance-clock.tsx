"use client";

import { useState } from "react";
import { Clock, LoaderCircle, LogIn, LogOut, MapPin, TriangleAlert } from "lucide-react";
import { newId } from "@/lib/client-id";
import type { WorkspaceData } from "@/lib/operations-types";

import { SubmitFn } from "@/components/workspace/contracts";

/**
 * The staff member's own clock.
 *
 * Reception staff should not have to ask a manager to mark them present, and a manager should not
 * be the bottleneck for the whole floor arriving at 9am. This is the one screen a stylist touches
 * every single day, so it is one button.
 *
 * Location is requested but never required. A refused permission, an old phone, or a basement with
 * no signal must not stop someone starting their shift - the check-in simply lands in the approvals
 * queue instead. The rule is: never block work, always record the truth, let a human judge the odd
 * one out.
 */

type ClockResult = {
  status: string;
  kind: string;
  distanceMeters: number | null;
  lateMinutes: number;
  note: string | null;
};

/**
 * Ask the browser where we are, and give up gracefully.
 *
 * Resolves to null rather than throwing on denial or timeout: not knowing the location is an
 * ordinary outcome here, not an error, and the caller must carry on either way. The 10s cap exists
 * because a cold GPS fix indoors can hang for minutes, and nobody is standing at a counter waiting
 * for a satellite.
 */
function currentPosition(): Promise<GeolocationPosition | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  });
}

export function AttendanceClock({ data, submit, onDone }: {
  data: WorkspaceData;
  submit: SubmitFn;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState<"in" | "out" | null>(null);
  const [result, setResult] = useState<ClockResult | null>(null);
  const [error, setError] = useState("");

  const me = data.staff.find((member) => member.id === data.identity.currentStaffId);
  const branchId = data.identity.branchId;
  const state = me?.attendanceToday.state;
  const isOpen = state === "CLOCKED_IN";

  // Someone who is not a staff member (an owner with no staff profile) has no shift to clock.
  if (!me || !branchId) return null;

  async function clock(action: "CLOCK_IN" | "CLOCK_OUT") {
    setBusy(action === "CLOCK_IN" ? "in" : "out");
    setError("");
    setResult(null);

    // Only a check-in needs to prove where you were. Where you finished is not what pay turns on,
    // and asking twice a day for a permission we do not use would be theatre.
    const position = action === "CLOCK_IN" ? await currentPosition() : null;

    const outcome = await submit<ClockResult>("/api/v1/operations/staff/attendance", {
      action,
      branchId,
      staffId: me!.id,
      ...(position ? {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: Math.round(position.coords.accuracy),
      } : {}),
      idempotencyKey: `attendance-${action.toLowerCase()}-${newId()}`,
    }, action === "CLOCK_IN" ? "Checked in." : "Checked out.", "POST", false);

    setBusy(null);
    if (!outcome.ok) return setError(outcome.error);
    setResult(outcome.data);
    onDone?.();
  }

  const pending = result?.status === "PENDING";

  return <div className="rounded-2xl border border-[#E3D9EE] bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${isOpen ? "bg-[#E9F7F1] text-[#0B6B4F]" : "bg-[#F3E8FF] text-[#5B2A86]"}`}>
          <Clock size={18} />
        </span>
        <div>
          <p className="text-sm font-extrabold text-[#1F2937]">
            {isOpen ? "You're checked in" : state === "ON_LEAVE" ? "You're on leave today" : "Start your day"}
          </p>
          <p className="text-xs text-[#9CA3AF]">
            {me.attendanceToday.firstClockIn
              ? `Since ${new Date(me.attendanceToday.firstClockIn).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}`
              : data.identity.branchName}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void clock(isOpen ? "CLOCK_OUT" : "CLOCK_IN")}
        disabled={busy !== null}
        className={`inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold text-white transition disabled:opacity-60 ${isOpen ? "bg-[#6B7280] hover:bg-[#4B5563]" : "bg-[#5B2A86] hover:bg-[#472066]"}`}
      >
        {busy ? <LoaderCircle size={16} className="animate-spin" /> : isOpen ? <LogOut size={16} /> : <LogIn size={16} />}
        {busy === "in" ? "Finding you…" : busy === "out" ? "Checking out…" : isOpen ? "Check out" : "Check in"}
      </button>
    </div>

    {/* Say what happened plainly. "Pending" with no reason reads as a system fault; with a reason it
        reads as a fact the person already knows - they were late, or they are at a client's home. */}
    {result && <div className={`mt-3 rounded-xl border p-3 text-xs ${pending ? "border-[#ECD7A7] bg-[#FFF7DF] text-[#865C12]" : "border-[#A9DFCB] bg-[#E9F7F1] text-[#0B6B4F]"}`}>
      <p className="flex items-start gap-2 font-bold">
        {pending ? <TriangleAlert size={14} className="mt-0.5 shrink-0" /> : <MapPin size={14} className="mt-0.5 shrink-0" />}
        {pending ? "Sent for approval" : "Recorded"}
      </p>
      {pending && result.note && <p className="mt-1 pl-6 font-semibold">{result.note}</p>}
      {pending && <p className="mt-1 pl-6 opacity-80">Your manager will review it. Carry on working — this does not stop your day.</p>}
    </div>}

    {error && <p className="mt-3 flex items-start gap-2 rounded-xl border border-[#F0C4C2] bg-[#FDECEC] p-3 text-xs font-bold text-[#94302E]">
      <TriangleAlert size={14} className="mt-0.5 shrink-0" />{error}
    </p>}
  </div>;
}
