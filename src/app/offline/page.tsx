import { BrandMark } from "@/components/brand-mark";

export const metadata = { title: "Offline - Operyx" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-[#F7FAFC] px-6 text-center">
      <BrandMark />
      <div>
        <h1 className="font-serif text-3xl font-semibold text-[#1F2937]">You are offline</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm font-semibold leading-6 text-[#737174]">
          Operyx needs a connection to show live bookings, stock, and billing. Nothing you were working on has been lost.
        </p>
      </div>
      <p className="rounded-2xl border border-[#ecd7a7] bg-[#fff7df] px-4 py-3 text-xs font-bold text-[#865c12]">
        Reconnect and this screen will move on by itself.
      </p>
    </main>
  );
}
