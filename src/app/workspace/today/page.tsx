import { TodayPreview } from "./today-preview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Today (preview) - Operyx" };

export default function TodayPreviewPage() {
  return (
    <main className="min-h-[100dvh] bg-[var(--surface-page)] p-6">
      <div className="mx-auto max-w-5xl">
        <TodayPreview />
      </div>
    </main>
  );
}
