import Link from "next/link";
import { BrandMark, brandName } from "@/components/brand-mark";
import { RegistrationForm } from "@/components/registration-form";

export default function RegistrationPage() {
  return (
    <main className="min-h-screen bg-[#F7FAFC] px-5 py-10 text-[#1F2937]">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="flex items-center gap-2 font-serif text-2xl font-bold"><BrandMark /></Link>
        <div className="mt-10 rounded-[2.5rem] bg-white p-7 shadow-xl sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#1969A2]">Salon onboarding</p>
          <h1 className="mt-3 font-serif text-4xl font-semibold sm:text-5xl">Create your {brandName} workspace.</h1>
          <p className="mt-4 max-w-2xl leading-7 text-[#737174]">Start with your owner account. You can complete GST, branch, service, policy, and verification details in the next step.</p>
          <RegistrationForm />
        </div>
      </div>
    </main>
  );
}
