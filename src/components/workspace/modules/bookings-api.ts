import type { WorkspaceData } from "@/lib/operations-types";
import { queryWorkspace } from "@/components/workspace/client";
import type { AppointmentItem } from "@/components/workspace/contracts";

export type AppointmentListResult = AppointmentItem[] | {
  appointments: AppointmentItem[];
  blockedTimes?: WorkspaceData["blockedTimes"];
  pagination?: { page: number; pageSize: number; total: number; pages: number };
};

export function getAppointments(params: URLSearchParams) {
  return queryWorkspace<AppointmentListResult>(`/api/v1/operations/appointments?${params}`);
}
