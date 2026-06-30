import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionCookie } from "@/lib/session";

export async function POST() {
  (await cookies()).delete(sessionCookie.name);
  redirect("/login");
}
