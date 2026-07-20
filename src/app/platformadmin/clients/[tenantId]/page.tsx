import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ClientDetail } from "@/components/platform-admin/client-detail";
import { assessHealth } from "@/lib/customer-health";
import { db } from "@/lib/db";
import { branchChecklist } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

/**
 * One salon, everything Operyx needs about them.
 *
 * This is the support screen. When a salon rings, whoever answers should be able to see their
 * subscription, their setup, what they last did, and the history of every change we made - without
 * asking the customer to read numbers down the phone.
 *
 * What it deliberately does not show: their customer list, their bookings, their revenue detail.
 * Those belong to the salon. We can see whether they are billing, not who they billed.
 */
export default async function ClientPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const now = Date.now();
  const twoWeeksAgo = new Date(now - 14 * DAY);

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    include: {
      subscriptionRecord: { include: { plan: true } },
      users: { where: { role: { not: "CUSTOMER" } }, select: { id: true, name: true, email: true, role: true, isActive: true } },
      services: { where: { isActive: true }, select: { id: true } },
      verificationDocuments: { orderBy: { createdAt: "desc" } },
      adminNotes: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 20 },
      ownerInvitations: { orderBy: { createdAt: "desc" }, take: 3 },
      subscriptionEvents: { include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 30 },
      branches: {
        include: {
          operatingHours: true,
          verificationDocuments: true,
          _count: { select: { appointments: true, staff: true, invoices: true } },
          invoices: { where: { createdAt: { gte: twoWeeksAgo } }, select: { createdAt: true } },
        },
        orderBy: { name: "asc" },
      },
      _count: { select: { customers: true } },
    },
  });

  if (!tenant) notFound();

  const invoiceDates = tenant.branches.flatMap((branch) => branch.invoices.map((invoice) => invoice.createdAt));
  const weekAgo = new Date(now - 7 * DAY);
  const everBilled = tenant.branches.reduce((sum, branch) => sum + branch._count.invoices, 0) > 0;
  const latest = invoiceDates.length ? Math.max(...invoiceDates.map((date) => date.getTime())) : null;

  const health = assessHealth({
    billsThisWeek: invoiceDates.filter((date) => date >= weekAgo).length,
    billsLastWeek: invoiceDates.filter((date) => date < weekAgo).length,
    daysSinceLastBill: latest ? Math.floor((now - latest) / DAY) : everBilled ? 14 : null,
    ageDays: Math.floor((now - tenant.createdAt.getTime()) / DAY),
  });

  const plans = await db.subscriptionPlan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });

  return <>
    <Link href="/platformadmin/clients" className="inline-flex items-center gap-1.5 text-sm font-bold text-[#9CA3AF] transition hover:text-[#5B2A86]">
      <ArrowLeft size={15} /> All clients
    </Link>

    <ClientDetail
      tenant={{
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        legalName: tenant.legalName,
        gstin: tenant.gstin,
        status: tenant.status,
        createdAt: tenant.createdAt.toISOString(),
        customerCount: tenant._count.customers,
        serviceCount: tenant.services.length,
      }}
      health={health}
      subscription={tenant.subscriptionRecord ? {
        planId: tenant.subscriptionRecord.planId,
        planName: tenant.subscriptionRecord.plan.name,
        status: tenant.subscriptionRecord.status,
        billingPeriod: tenant.subscriptionRecord.billingPeriod,
        trialEndsAt: tenant.subscriptionRecord.trialEndsAt?.toISOString() ?? null,
        currentPeriodEnd: tenant.subscriptionRecord.currentPeriodEnd?.toISOString() ?? null,
        agreedPrice: tenant.subscriptionRecord.agreedPricePaise ? tenant.subscriptionRecord.agreedPricePaise / 100 : null,
        listMonthly: tenant.subscriptionRecord.plan.monthlyPricePaise / 100,
      } : null}
      plans={plans.map((plan) => ({ id: plan.id, name: plan.name, maxBranches: plan.maxBranches, maxStaff: plan.maxStaff }))}
      people={tenant.users.map((user) => ({ id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive }))}
      branches={tenant.branches.map((branch) => ({
        id: branch.id,
        name: branch.name,
        city: branch.city,
        publicationStatus: branch.publicationStatus,
        appointments: branch._count.appointments,
        staff: branch._count.staff,
        invoices: branch._count.invoices,
        checklist: branchChecklist({
          tenant,
          branch,
          documents: tenant.verificationDocuments.filter((document) => !document.branchId || document.branchId === branch.id),
          serviceCount: tenant.services.length,
          operatingHourCount: branch.operatingHours.length,
        }),
      }))}
      documents={tenant.verificationDocuments.map((document) => ({
        id: document.id, type: document.type, fileName: document.fileName,
        status: document.status, createdAt: document.createdAt.toISOString(),
      }))}
      notes={tenant.adminNotes.map((note) => ({ id: note.id, note: note.note, author: note.author.name, createdAt: note.createdAt.toISOString() }))}
      invitations={tenant.ownerInvitations.map((invitation) => ({ id: invitation.id, email: invitation.email, status: invitation.status }))}
      events={tenant.subscriptionEvents.map((event) => ({
        id: event.id,
        kind: event.kind,
        fromValue: event.fromValuePaise === null ? null : event.fromValuePaise / 100,
        toValue: event.toValuePaise === null ? null : event.toValuePaise / 100,
        reason: event.reason,
        actor: event.actor?.name ?? "System",
        createdAt: event.createdAt.toISOString(),
      }))}
    />
  </>;
}
