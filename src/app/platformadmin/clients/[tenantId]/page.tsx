import { redirect } from "next/navigation";

/** Moved under Customers. See ../page.tsx for why. */
export default async function ClientDetailRedirect({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  redirect(`/platformadmin/customers/${tenantId}`);
}
