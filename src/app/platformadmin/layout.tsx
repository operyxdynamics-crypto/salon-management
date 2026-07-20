import { redirect } from "next/navigation";
import { PlatformAdminShell } from "@/components/platform-admin/shell";
import { db } from "@/lib/db";
import { PAYING_STATUSES, TRIAL_STATUSES } from "@/lib/platform-admin-queries";
import { readSession } from "@/lib/session";

/**
 * Guards every page under /platformadmin.
 *
 * Auth lives here rather than in each page: a section added later is protected by existing, which
 * is the only arrangement that stays safe as the panel grows. Forgetting the check on one new page
 * would expose every salon's subscription data.
 */
export const dynamic = "force-dynamic";

export default async function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.role !== "PLATFORM_ADMIN") redirect("/workspace/home");

  // Only the counts the sidebar badges need - cheap, and the same on every page.
  //
  // Customers and Trials are counted separately by the same rule the pages use, so the badge can
  // never say something the screen contradicts.
  const [customers, trials, leads, pendingBranches] = await Promise.all([
    db.tenant.count({ where: { subscriptionRecord: { status: { in: [...PAYING_STATUSES] } } } }),
    db.tenant.count({ where: { OR: [{ subscriptionRecord: { status: { in: [...TRIAL_STATUSES] } } }, { subscriptionRecord: null }] } }),
    db.lead.count({ where: { convertedTenantId: null, status: { notIn: ["WON", "LOST"] } } }),
    db.branch.count({ where: { publicationStatus: "PENDING_REVIEW" } }),
  ]);

  return (
    <PlatformAdminShell
      adminName={session.name}
      counts={{
        "/platformadmin/customers": customers,
        "/platformadmin/trials": trials,
        "/platformadmin/pipeline": leads,
        "/platformadmin/dashboard": pendingBranches,
      }}
    >
      {children}
    </PlatformAdminShell>
  );
}
