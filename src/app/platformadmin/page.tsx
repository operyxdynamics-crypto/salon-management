import { redirect } from "next/navigation";

/**
 * /platformadmin has no screen of its own - the day starts on Today.
 *
 * Next's typed routes also require a page at any segment that has a layout, so this both fixes
 * that and means typing the bare URL lands somewhere useful instead of a 404.
 */
export default function PlatformAdminIndex() {
  redirect("/platformadmin/dashboard");
}
