import { db } from "@/lib/db";
import { platformErrorResponse, requirePlatformAdmin } from "@/lib/platform-auth";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin();
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() ?? "";
    const tenantId = searchParams.get("tenantId") || undefined;
    const logs = await db.auditLog.findMany({
      where: {
        tenantId,
        ...(query ? { OR: [{ action: { contains: query, mode: "insensitive" } }, { entity: { contains: query, mode: "insensitive" } }] } : {}),
      },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return Response.json({ data: logs.map((log) => ({ ...log, actor: log.user?.name ?? "System" })) });
  } catch (error) {
    return platformErrorResponse(error);
  }
}
