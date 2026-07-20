import { redirect } from "next/navigation";

/**
 * "Clients" is gone, because it lumped trialling salons in with paying ones.
 *
 * Kept as a redirect rather than deleted: someone has this bookmarked, and a 404 teaches them
 * nothing about where it went.
 */
export default function ClientsRedirect() {
  redirect("/platformadmin/customers");
}
