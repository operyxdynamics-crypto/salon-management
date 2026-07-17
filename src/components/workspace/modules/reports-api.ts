import { mutateWorkspace, queryWorkspace } from "@/components/workspace/client";

export function getInvoices<T>(params: URLSearchParams) {
  return queryWorkspace<T>(`/api/v1/operations/invoices?${params}`);
}

export function getInvoice<T>(invoiceId: string, branchId: string) {
  return queryWorkspace<T>(`/api/v1/operations/invoices/${invoiceId}?branchId=${encodeURIComponent(branchId)}`);
}

export function updateInvoice<T>(invoiceId: string, body: Record<string, unknown>) {
  return mutateWorkspace<T>(`/api/v1/operations/invoices/${invoiceId}/refund`, "POST", body);
}
