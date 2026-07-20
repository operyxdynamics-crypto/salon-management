import { redirect } from "next/navigation";

/**
 * The admin console moved to /platformadmin, where each section is its own route.
 *
 * Kept as a redirect rather than deleted: /admin is bookmarked, it is in the handbook, and it is
 * what anyone who has used this before will type. A dead link is a support call.
 */
export default function LegacyAdminPage() {
  redirect("/platformadmin/dashboard");
}
