import { StyleGuideClient } from "./style-guide-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Design system - Operyx" };

export default function StyleGuidePage() {
  return (
    <main className="min-h-[100dvh] bg-[var(--surface-page)]">
      <StyleGuideClient />
    </main>
  );
}
