import { db } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const branches = await db.branch.findMany({
    where: {
      isPublished: true,
      publicationStatus: "APPROVED",
      tenant: { status: "ACTIVE" },
      ...(query ? {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { city: { contains: query, mode: "insensitive" } },
          { tenant: { name: { contains: query, mode: "insensitive" } } },
        ],
      } : {}),
    },
    include: { tenant: { include: { services: { where: { isActive: true }, take: 4 } } } },
    orderBy: [{ rating: "desc" }, { reviewCount: "desc" }],
  });
  const results = branches.map((branch) => ({
    id: branch.tenant.slug,
    branchId: branch.id,
    name: branch.tenant.name,
    area: `${branch.address}, ${branch.city}`,
    rating: Number(branch.rating),
    reviews: branch.reviewCount,
    services: branch.tenant.services.map((service) => service.name),
    timezone: branch.timezone,
  }));
  return Response.json({ data: results, meta: { total: results.length } });
}
