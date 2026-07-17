import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { LoginPanel } from "@/components/login-panel";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen bg-[#F7FAFC] lg:grid-cols-[.8fr_1.2fr]">
      <section className="hidden bg-[#173279] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandMark light />
        </Link>
        <div>
          <p className="text-sm font-bold uppercase tracking-[.18em] text-[#16B994]">One calm workspace</p>
          <h1 className="mt-4 max-w-xl font-serif text-5xl leading-tight">Beautiful businesses run on thoughtful details.</h1>
          <p className="mt-6 max-w-md leading-7 text-white/60">Appointments, customers, payments, stock, staff and growth, finally working together.</p>
        </div>
        <p className="text-sm text-white/40">Secure access for salon teams and customers</p>
      </section>
      <section className="grid place-items-center p-5 sm:p-10">
        <LoginPanel />
      </section>
    </main>
  );
}
