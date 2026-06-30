import { notFound } from "next/navigation";
import { BookingFlow } from "@/components/booking-flow";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await db.tenant.findUnique({ where: { slug }, select: { name: true } });
  if (!tenant) return { title: "Salon booking" };
  return {
    title: `Book an appointment | ${tenant.name}`,
    description: `Reserve your appointment at ${tenant.name}.`,
    openGraph: {
      title: `Book an appointment at ${tenant.name}`,
      description: `Pick a service, choose a time, confirm in seconds.`,
    },
  };
}

export default async function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Booking page works for any active SaaS tenant — marketplace approval is a separate
  // concept that only affects whether the salon appears in marketplace search. Salons that
  // use this purely as their own management portal can still share /book/{slug} with their
  // customers.
  const tenant = await db.tenant.findUnique({
    where: { slug },
    include: {
      branches: {
        where: { publicationStatus: { not: "ARCHIVED" } },
        include: {
          operatingHours: { orderBy: { dayOfWeek: "asc" } },
          staff: {
            where: { user: { isActive: true } },
            include: { user: true, services: { select: { serviceId: true } } },
            orderBy: { user: { name: "asc" } },
          },
        },
        take: 1,
      },
      services: {
        where: { isActive: true },
        include: { branches: true, categoryRecord: true },
        orderBy: [{ categoryRecord: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
      },
    },
  });
  const branch = tenant?.branches[0];
  if (!tenant || tenant.status !== "ACTIVE" || !branch) notFound();

  // Resolve per-branch service overrides
  const services = tenant.services.flatMap((service) => {
    const override = service.branches.find((item) => item.branchId === branch.id);
    if (override?.isActive === false) return [];
    return [{
      id: service.id,
      name: service.name,
      category: service.categoryRecord?.name ?? service.category,
      durationMinutes: override?.durationMinutes ?? service.durationMinutes,
      price: Number(override?.price ?? service.price),
    }];
  });

  const staff = branch.staff.map((member) => ({
    id: member.id,
    name: member.user.name,
    role: member.jobTitle,
    serviceIds: member.services.map((row) => row.serviceId),
  }));

  return (
    <BookingFlow
      salon={{
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        branchId: branch.id,
        branchName: branch.name,
        branchAddress: `${branch.address}, ${branch.city}`,
        branchPhone: branch.phone ?? null,
        rating: Number(branch.rating),
        reviews: branch.reviewCount,
        services,
        staff,
      }}
    />
  );
}
