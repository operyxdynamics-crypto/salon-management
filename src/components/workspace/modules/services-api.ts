import { queryWorkspace } from "@/components/workspace/client";

export type ServiceCategoryTemplates = {
  templates?: Array<{ id: string; name: string; color: string | null }>;
};

export function getServiceCategoryTemplates(branchId: string) {
  return queryWorkspace<ServiceCategoryTemplates>(`/api/v1/operations/service-categories?branchId=${encodeURIComponent(branchId)}`);
}
