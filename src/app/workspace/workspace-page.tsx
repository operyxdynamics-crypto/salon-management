import { redirect } from "next/navigation";
import { SalonWorkspace } from "@/components/salon-workspace";
import { OperationsError, requireOperationsContext } from "@/lib/operations-auth";
import { getWorkspaceData } from "@/lib/workspace-data";

type WorkspaceSearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function WorkspacePage({ searchParams, module }: { searchParams: WorkspaceSearchParams; module?: string | null }) {
  const data = await loadWorkspace();
  const query = await searchParams;
  const single = (value: string | string[] | undefined) => typeof value === "string" ? value : null;
  return <SalonWorkspace
    initialData={data}
    initialModule={module || single(query.view)}
    initialDetail={{
      appointmentId: single(query.appointmentId),
      customerId: single(query.customerId),
      serviceId: single(query.serviceId),
      // A shared invoice link lands here. Without this the ?invoiceId in the URL was read by
      // nothing at all, and the page opened on the invoice list.
      invoiceId: single(query.invoiceId),
    }}
  />;
}

async function loadWorkspace() {
  try {
    const context = await requireOperationsContext("appointment:read");
    return await getWorkspaceData({
      tenantId: context.tenant.id,
      selectedBranchId: context.user.role === "OWNER" ? null : context.branch?.id ?? null,
      authorizedBranches: context.branches.map((branch) => ({
        id: branch.id,
        name: branch.name,
        city: branch.city,
        publicationStatus: branch.publicationStatus,
      })),
      userName: context.user.name,
      role: context.user.role,
      tenantName: context.tenant.name,
      tenantSlug: context.tenant.slug,
      currentStaffId: context.user.staff?.id,
    });
  } catch (error) {
    if (error instanceof OperationsError && error.code === "UNAUTHENTICATED") {
      redirect("/login");
    }
    throw error;
  }
}
