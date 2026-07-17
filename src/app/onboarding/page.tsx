import { redirect } from "next/navigation";
import { OnboardingWorkspace } from "@/components/onboarding-workspace";
import { readSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await readSession();
  if (!session) redirect("/onboarding/register");
  if (session.role !== "OWNER") redirect(session.role === "PLATFORM_ADMIN" ? "/admin" : "/workspace/home");
  return <OnboardingWorkspace />;
}
