import { redirect } from "next/navigation";

/** "Enquiries" is now "Pipeline" — same salons, a name that admits they are being sold to. */
export default function EnquiriesRedirect() {
  redirect("/platformadmin/pipeline");
}
