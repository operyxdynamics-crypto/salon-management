import { queryWorkspace } from "@/components/workspace/client";

export function getBookingOptions<T>(branchId: string) {
  return queryWorkspace<T>(`/api/v1/operations/booking-options?branchId=${encodeURIComponent(branchId)}`);
}

export function getAvailableSlots(params: URLSearchParams, signal?: AbortSignal) {
  return queryWorkspace<{ slots: string[] }>(`/api/v1/availability?${params}`, { signal });
}
