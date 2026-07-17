import { queryWorkspace } from "@/components/workspace/client";

export function getAttendance<T>(params: URLSearchParams) {
  return queryWorkspace<T>(`/api/v1/operations/staff/attendance?${params}`);
}

export function getPayroll<T>(params: URLSearchParams) {
  return queryWorkspace<T>(`/api/v1/operations/staff/payroll?${params}`);
}
