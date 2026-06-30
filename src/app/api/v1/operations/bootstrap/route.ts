import { requireOperationsContext, operationsErrorResponse } from "@/lib/operations-auth";
import { getWorkspaceData } from "@/lib/workspace-data";

export async function GET(request: Request) {
  try {
    const branchId = new URL(request.url).searchParams.get("branchId");
    const context = await requireOperationsContext("appointment:read", { branchId: branchId ?? undefined, allowAll: true });
    const data = await getWorkspaceData({
      tenantId: context.tenant.id,
      selectedBranchId: context.branch?.id ?? null,
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
    return Response.json({ data });
  } catch (error) {
    return operationsErrorResponse(error);
  }
}
