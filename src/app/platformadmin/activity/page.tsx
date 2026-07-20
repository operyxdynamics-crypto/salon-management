import { PageHeader } from "@/components/platform-admin/shell";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Activity · Operyx" };

const readable = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const stamp = (value: Date) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(value);

/** Who did what. The answer to "who changed this salon's plan?" three months from now. */
export default async function ActivityPage() {
  // AuditLog holds a tenantId but has no tenant relation, so names are resolved in one extra
  // query rather than 200 joins.
  const logs = await db.auditLog.findMany({
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const tenantIds = [...new Set(logs.flatMap((log) => log.tenantId ? [log.tenantId] : []))];
  const tenants = tenantIds.length
    ? await db.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } })
    : [];
  const nameOf = new Map(tenants.map((tenant) => [tenant.id, tenant.name]));

  return <>
    <PageHeader title="Activity" blurb="Everything that happened, and who did it. Most recent first." />

    <div className="mt-6 overflow-hidden rounded-2xl border border-[#EFEAF3] bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-[#F7F6F9] text-xs uppercase tracking-wider text-[#9CA3AF]">
          <tr><th className="p-4">Action</th><th className="p-4">Salon</th><th className="p-4">Who</th><th className="p-4">When</th></tr>
        </thead>
        <tbody>{logs.map((log) => (
          <tr key={log.id} className="border-t border-[#EFEAF3]">
            <td className="p-4"><strong>{readable(log.action)}</strong><p className="text-xs text-[#9CA3AF]">{log.entity}</p></td>
            <td className="p-4">{(log.tenantId && nameOf.get(log.tenantId)) ?? <span className="text-[#9CA3AF]">Platform</span>}</td>
            <td className="p-4">{log.user?.name ?? "System"}</td>
            <td className="p-4 text-xs text-[#6B7280]">{stamp(log.createdAt)}</td>
          </tr>
        ))}</tbody>
      </table>
      {!logs.length && <p className="p-12 text-center text-sm text-[#9CA3AF]">Nothing recorded yet.</p>}
    </div>
  </>;
}
