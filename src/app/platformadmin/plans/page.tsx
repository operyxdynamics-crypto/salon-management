import { redirect } from "next/navigation";

/** Plans are half the catalogue now — add-ons are the other half. Both live under Packages. */
export default function PlansRedirect() {
  redirect("/platformadmin/packages");
}
