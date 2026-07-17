import { requireOperationsContext, operationsErrorResponse } from "@/lib/operations-auth";
import { getWorkspaceData } from "@/lib/workspace-data";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const branchId = params.get("branchId");
    const branchIdsParam = params.get("branchIds");
    const requestedBranchIds = branchIdsParam
      ? branchIdsParam.split(",").map((value) => value.trim()).filter(Boolean)
      : null;
    const context = await requireOperationsContext("appointment:read", {
      branchId: requestedBranchIds ? undefined : branchId ?? undefined,
      allowAll: true,
    });
    const authorizedBranchIds = new Set(context.branches.map((branch) => branch.id));
    const selectedBranchIds = requestedBranchIds?.length
      ? [...new Set(requestedBranchIds)].filter((id) => authorizedBranchIds.has(id))
      : context.branch?.id
        ? [context.branch.id]
        : null;
    if (requestedBranchIds?.length && selectedBranchIds?.length !== new Set(requestedBranchIds).size) {
      return Response.json({ error: { code: "FORBIDDEN", message: "You do not have access to one or more selected branches", details: null } }, { status: 403 });
    }
    const data = await getWorkspaceData({
      tenantId: context.tenant.id,
      selectedBranchId: selectedBranchIds?.length === 1 ? selectedBranchIds[0] : context.branch?.id ?? null,
      selectedBranchIds,
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
