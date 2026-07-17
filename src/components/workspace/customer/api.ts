import { queryWorkspace } from "@/components/workspace/client";
import type { CustomerChoice } from "@/components/workspace/customer/types";

export function searchCustomers(branchId: string, query: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ branchId, query });
  return queryWorkspace<CustomerChoice[]>(`/api/v1/operations/customers?${params}`, { signal });
}
