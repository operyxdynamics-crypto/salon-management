import { redirect } from "next/navigation";
import { AdminConsole, type AdminConsoleData } from "@/components/admin-console";
import { db } from "@/lib/db";
import { branchChecklist } from "@/lib/onboarding";
import { readSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.role !== "PLATFORM_ADMIN") redirect("/dashboard");

  const [tenants, plans, categoryTemplates, auditLogs, appointmentCount, paidTotals] = await Promise.all([
    db.tenant.findMany({
      include: {
        branches: {
          include: {
            operatingHours: true,
            verificationDocuments: { orderBy: { createdAt: "desc" } },
            reviewsHistory: { include: { reviewer: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 5 },
            _count: { select: { appointments: true, staff: true, invoices: true } },
          },
          orderBy: { name: "asc" },
        },
        users: { where: { role: "OWNER" }, select: { id: true, name: true, email: true, phone: true, isActive: true } },
        services: { where: { isActive: true }, select: { id: true } },
        verificationDocuments: { orderBy: { createdAt: "desc" } },
        subscriptionRecord: { include: { plan: true } },
        adminNotes: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 10 },
        ownerInvitations: { orderBy: { createdAt: "desc" }, take: 3 },
        _count: { select: { customers: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    db.subscriptionPlan.findMany({ where: { isActive: true }, orderBy: { maxBranches: "asc" } }),
    db.serviceCategoryTemplate.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.auditLog.findMany({ include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.appointment.count(),
    db.invoice.aggregate({ where: { status: "PAID" }, _sum: { total: true } }),
  ]);

  const data: AdminConsoleData = {
    adminName: session.name,
    metrics: {
      tenants: tenants.length,
      activeTenants: tenants.filter((tenant) => tenant.status === "ACTIVE").length,
      pendingBranches: tenants.flatMap((tenant) => tenant.branches).filter((branch) => branch.publicationStatus === "PENDING_REVIEW").length,
      approvedBranches: tenants.flatMap((tenant) => tenant.branches).filter((branch) => branch.publicationStatus === "APPROVED").length,
      appointments: appointmentCount,
      recordedRevenue: Number(paidTotals._sum.total ?? 0),
    },
    plans: plans.map((plan) => ({
      id: plan.id, code: plan.code, name: plan.name, description: plan.description,
      maxBranches: plan.maxBranches, maxStaff: plan.maxStaff, maxServices: plan.maxServices,
      maxMonthlyAppointments: plan.maxMonthlyAppointments, maxStorageMb: plan.maxStorageMb,
    })),
    categoryTemplates: categoryTemplates.map((template) => ({
      id: template.id,
      name: template.name,
      description: template.description,
      color: template.color,
      icon: template.icon,
      sortOrder: template.sortOrder,
      isActive: template.isActive,
    })),
    tenants: tenants.map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      legalName: tenant.legalName,
      gstin: tenant.gstin,
      panNumber: tenant.panNumber,
      status: tenant.status,
      onboardingStep: tenant.onboardingStep,
      createdAt: tenant.createdAt.toISOString(),
      owner: tenant.users[0] ?? null,
      customerCount: tenant._count.customers,
      serviceCount: tenant.services.length,
      subscription: tenant.subscriptionRecord ? {
        id: tenant.subscriptionRecord.id,
        planId: tenant.subscriptionRecord.planId,
        planName: tenant.subscriptionRecord.plan.name,
        planCode: tenant.subscriptionRecord.plan.code,
      } : null,
      documents: tenant.verificationDocuments.map((document) => ({
        id: document.id, branchId: document.branchId, type: document.type, fileName: document.fileName,
        status: document.status, reviewNote: document.reviewNote, createdAt: document.createdAt.toISOString(),
      })),
      branches: tenant.branches.map((branch) => ({
        id: branch.id, name: branch.name, city: branch.city, address: branch.address, phone: branch.phone, email: branch.email,
        publicationStatus: branch.publicationStatus, isPublished: branch.isPublished, submittedAt: branch.submittedAt?.toISOString() ?? null,
        appointments: branch._count.appointments, staff: branch._count.staff, invoices: branch._count.invoices,
        checklist: branchChecklist({
          tenant,
          branch,
          documents: tenant.verificationDocuments.filter((document) => !document.branchId || document.branchId === branch.id),
          serviceCount: tenant.services.length,
          operatingHourCount: branch.operatingHours.length,
        }),
        reviews: branch.reviewsHistory.map((review) => ({ id: review.id, toStatus: review.toStatus, note: review.note, reviewer: review.reviewer.name, createdAt: review.createdAt.toISOString() })),
      })),
      notes: tenant.adminNotes.map((note) => ({ id: note.id, note: note.note, author: note.author.name, createdAt: note.createdAt.toISOString() })),
      invitations: tenant.ownerInvitations.map((invitation) => ({ id: invitation.id, email: invitation.email, status: invitation.status, expiresAt: invitation.expiresAt.toISOString() })),
    })),
    auditLogs: auditLogs.map((log) => ({
      id: log.id, action: log.action, entity: log.entity, entityId: log.entityId,
      tenantId: log.tenantId, actor: log.user?.name ?? "System", createdAt: log.createdAt.toISOString(),
    })),
  };
  return <AdminConsole data={data} />;
}
