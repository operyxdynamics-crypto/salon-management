import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { InvitationForm } from "@/components/registration-form";

export default async function InvitationPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <main className="grid min-h-screen place-items-center bg-[#f3f1ed] p-5"><div className="w-full max-w-xl rounded-[2rem] bg-white p-8 shadow-xl"><Link href="/" className="font-serif text-2xl font-bold"><BrandMark /></Link><h1 className="mt-8 font-serif text-4xl">Accept salon invitation</h1><p className="mt-3 text-[#746d66]">Set up the owner account and continue the salon onboarding checklist.</p><InvitationForm token={token} /></div></main>;
}
