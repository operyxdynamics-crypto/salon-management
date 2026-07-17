import type { AppointmentDetail, CustomerProfile, ServiceProfile } from "@/lib/operations-types";
import { queryWorkspace } from "@/components/workspace/client";

export function getAppointmentDetail(appointmentId: string) {
  return queryWorkspace<AppointmentDetail>(`/api/v1/operations/appointments/${appointmentId}`);
}

export function getCustomerProfile(customerId: string, params: URLSearchParams) {
  return queryWorkspace<CustomerProfile>(`/api/v1/operations/customers/${customerId}?${params}`);
}

export function getServiceProfile(serviceId: string, branchId: string, signal?: AbortSignal) {
  return queryWorkspace<ServiceProfile>(`/api/v1/operations/services/${serviceId}?branchId=${encodeURIComponent(branchId)}`, { signal });
}
