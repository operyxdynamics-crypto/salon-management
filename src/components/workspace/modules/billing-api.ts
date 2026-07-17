import type { AppointmentDetail, CustomerProfile } from "@/lib/operations-types";
import { mutateWorkspace, queryWorkspace } from "@/components/workspace/client";
import type { HeldSale } from "@/components/workspace/modules/billing-types";

export function getHeldSales(branchId: string) {
  return queryWorkspace<HeldSale[]>(`/api/v1/operations/sale-drafts?branchId=${encodeURIComponent(branchId)}`);
}

export function getBillingAppointment(appointmentId: string) {
  return queryWorkspace<AppointmentDetail>(`/api/v1/operations/appointments/${appointmentId}`);
}

export function getBillingCustomerProfile(customerId: string, branchId: string, signal?: AbortSignal) {
  return queryWorkspace<CustomerProfile>(`/api/v1/operations/customers/${customerId}?branchId=${encodeURIComponent(branchId)}&pageSize=5`, { signal });
}

export function deleteHeldSale(draftId: string, branchId: string, reason: string) {
  return mutateWorkspace<unknown>(`/api/v1/operations/sale-drafts/${draftId}`, "DELETE", { branchId, reason });
}
