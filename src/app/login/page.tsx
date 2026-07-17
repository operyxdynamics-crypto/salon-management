import Link from "next/link";
import { CalendarDays, ReceiptText, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { LoginPanel } from "@/components/login-panel";

/**
 * Sign in.
 *
 * The left panel is brand surface, the right is the job. It stays purple in either theme because it
 * is a coloured surface, not a themed one - which is why BrandMark is given `light` here.
 */
export default function LoginPage() {
  return (
    <main className="grid min-h-screen bg-[#FBF9FD] lg:grid-cols-[.85fr_1.15fr]">
      <section className="relative hidden overflow-hidden bg-[#5B2A86] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        {/* A soft wash rather than a hard block - the panel is tall and flat colour goes heavy. */}
        <div className="pointer-events-none absolute -left-24 -top-24 size-[420px] rounded-full bg-white/[0.07] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-16 size-[380px] rounded-full bg-white/[0.05] blur-3xl" />

        <Link href="/" className="relative flex items-center gap-2.5">
          <BrandMark light />
        </Link>

        <div className="relative">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#D9C7EC]">Operations. Automated.</p>
          <h1 className="mt-4 max-w-xl font-serif text-5xl leading-[1.1]">
            The whole salon, from the front desk.
          </h1>
          <p className="mt-6 max-w-md leading-7 text-white/65">
            Bookings, billing, GST invoices, stock and staff — one workspace, already open at the
            counter.
          </p>

          <ul className="mt-10 space-y-3.5">
            {[
              [CalendarDays, "Today's chairs, at a glance"],
              [ReceiptText, "GST invoices that hold up"],
              [ShieldCheck, "Each person sees only their own work"],
            ].map(([Icon, label]) => {
              const Glyph = Icon as typeof CalendarDays;
              return (
                <li key={label as string} className="flex items-center gap-3 text-sm text-white/75">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10 text-[#D9C7EC]"><Glyph size={15} /></span>
                  {label as string}
                </li>
              );
            })}
          </ul>
        </div>

        <p className="relative text-xs text-white/40">Secure access for salon teams and customers</p>
      </section>

      <section className="grid place-items-center p-5 sm:p-10">
        <LoginPanel />
      </section>
    </main>
  );
}
