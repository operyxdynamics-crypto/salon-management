import { queryWorkspace } from "@/components/workspace/client";

export function getDayCloseSummary<T>(branchId: string) {
  return queryWorkspace<T>(`/api/v1/operations/register?branchId=${encodeURIComponent(branchId)}`);
}
