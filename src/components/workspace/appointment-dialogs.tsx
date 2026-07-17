"use client";

import { FormEvent, useState } from "react";
import { CalendarClock, Ban } from "lucide-react";
import { WorkspaceModalShell, formatDateTime, title } from "@/components/workspace/shared-ui";

/**
 * In-app replacements for window.prompt / window.confirm.
 *
 * A cancellation reason is an auditable business field - it belongs in a validated
 * form, not an OS dialog that cannot be styled, cannot enforce a minimum length,
 * and blocks the main thread.
 */

export type PendingStatusChange = {
  appointmentId: string;
  branchId: string;
  status: "CANCELLED" | "NO_SHOW";
  customer: string;
  startsAt: string;
};

export type PendingMove = {
  appointmentId: string;
  branchId: string;
  customer: string;
  fromStartsAt: string;
  toStartsAt: string;
  staffId: string | null;
  staffName: string;
};

const CANCELLATION_PRESETS = [
  "Customer requested cancellation",
  "Customer rescheduled",
  "Salon unable to service",
  "Staff unavailable",
  "Duplicate booking",
];

const NO_SHOW_PRESETS = [
  "Customer did not arrive",
  "Customer unreachable on call",
  "Arrived too late to service",
];

export function StatusReasonDialog({ pending, busy, error, close, confirm }: {
  pending: PendingStatusChange;
  busy: boolean;
  error: string;
  close: () => void;
  confirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const isCancel = pending.status === "CANCELLED";
  const presets = isCancel ? CANCELLATION_PRESETS : NO_SHOW_PRESETS;
  const trimmed = reason.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < 3;

  async function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (trimmed.length < 3) return;
    await confirm(trimmed);
  }

  return <WorkspaceModalShell
    title={isCancel ? "Cancel appointment" : "Mark as no-show"}
    eyebrow={isCancel ? "Cancellation" : "No-show"}
    description={`${pending.customer} - ${formatDateTime(pending.startsAt)}. The reason is recorded against this appointment and appears in reports.`}
    icon={isCancel ? <Ban size={22} /> : <CalendarClock size={22} />}
    close={close}
    onSubmit={handle}
    busy={busy || trimmed.length < 3}
    error={error}
    submitLabel={isCancel ? "Cancel appointment" : "Mark no-show"}
  >
    <div className="space-y-5">
      <div>
        <p className="text-sm font-extrabold text-[#1F2937]">Common reasons</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {presets.map((preset) => <button
            key={preset}
            type="button"
            onClick={() => setReason(preset)}
            className={`rounded-full border px-3 py-2 text-xs font-extrabold transition ${reason === preset ? "border-[#173279] bg-[#173279] text-white" : "border-[#E5E7EB] bg-[#F7FAFC] text-[#7b5514] hover:border-[#173279]"}`}
          >{preset}</button>)}
        </div>
      </div>
      <label className="block text-sm font-extrabold text-[#1F2937]">
        Reason
        <textarea
          className="field mt-2 min-h-24"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={300}
          placeholder={isCancel ? "Pick a reason above or describe what happened" : "What happened?"}
          autoFocus
        />
        <span className="mt-1 flex items-center justify-between text-xs font-semibold text-[#737174]">
          <span>{tooShort ? "Use at least 3 characters." : "This is stored in the appointment audit trail."}</span>
          <span>{trimmed.length}/300</span>
        </span>
      </label>
    </div>
  </WorkspaceModalShell>;
}

export function MoveAppointmentDialog({ pending, busy, error, close, confirm }: {
  pending: PendingMove;
  busy: boolean;
  error: string;
  close: () => void;
  confirm: () => Promise<void>;
}) {
  async function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await confirm();
  }

  return <WorkspaceModalShell
    title="Move appointment"
    eyebrow="Reschedule"
    description="Availability is rechecked before saving. If the new slot has been taken, the move is rejected and nothing changes."
    icon={<CalendarClock size={22} />}
    close={close}
    onSubmit={handle}
    busy={busy}
    error={error}
    submitLabel="Move appointment"
  >
    <div className="space-y-4">
      <div className="rounded-3xl border border-[#DDE7EF] bg-[#F7FAFC] p-4">
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#1789AA]">Customer</p>
        <p className="mt-1 text-lg font-extrabold">{pending.customer}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#737174]">From</p>
          <p className="mt-2 font-extrabold text-[#737174] line-through">{formatDateTime(pending.fromStartsAt)}</p>
        </div>
        <div className="rounded-2xl border border-[#a8ead8] bg-[#e7f8f2] p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#0f6f57] opacity-80">To</p>
          <p className="mt-2 font-extrabold text-[#0f6f57]">{formatDateTime(pending.toStartsAt)}</p>
        </div>
      </div>
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#737174]">Professional</p>
        <p className="mt-2 font-extrabold">{pending.staffName}</p>
      </div>
    </div>
  </WorkspaceModalShell>;
}

export function statusNeedsReason(status: string): status is PendingStatusChange["status"] {
  return status === "CANCELLED" || status === "NO_SHOW";
}

export function terminalMoveMessage(status: string) {
  return `${title(status)} appointments cannot be moved. Reopen the appointment from its detail drawer if this was a mistake.`;
}
