import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";
import { BrandMark, brandName, brandTagline } from "@/components/brand-mark";
import { db } from "@/lib/db";

const categories = ["Haircut", "Hair colour", "Facial", "Nails", "Makeup", "Spa"];

export const dynamic = "force-dynamic";

export default async function MarketplacePage() {
  const databaseSalons = await db.branch.findMany({
    where: { isPublished: true, publicationStatus: "APPROVED", tenant: { status: "ACTIVE" } },
    include: { tenant: { include: { services: { where: { isActive: true }, take: 3 } } } },
    orderBy: [{ rating: "desc" }, { reviewCount: "desc" }],
  }).catch(() => []);
  const salons = databaseSalons.map((branch, index) => ({
    id: branch.tenant.slug,
    name: branch.tenant.name,
    area: `${branch.address}, ${branch.city}`,
    distance: index === 0 ? "1.2 km" : "Nearby",
    rating: Number(branch.rating),
    reviews: branch.reviewCount,
    price: "₹₹",
    badge: index === 0 ? "Top rated" : "Verified",
    accent: ["from-[#1C459D] to-[#16B994]", "from-[#173279] to-[#1969A2]", "from-[#173279] to-[#16B994]"][index % 3],
    description: "Contemporary beauty services delivered by verified professionals in a welcoming space.",
    nextSlot: "Today, 4:30 PM",
    services: branch.tenant.services.map((service) => service.category),
  }));
  return (
    <main className="min-h-screen bg-[#F7FAFC] text-[#173279]">
      <header className="sticky top-0 z-30 border-b border-[#173279]/5 bg-[#F7FAFC]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandMark />
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-medium md:flex">
            <a href="#discover" className="hover:text-[#1969A2]">Discover</a>
            <a href="#how-it-works" className="hover:text-[#1969A2]">How it works</a>
            <Link href="/workspace/home" className="hover:text-[#1969A2]">For salons</Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden rounded-full px-4 py-2 text-sm font-semibold sm:block">Sign in</Link>
            <Link href="/workspace/home" className="rounded-full bg-[#173279] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#173279]">
              Salon workspace
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden px-5 pb-20 pt-16 lg:px-8 lg:pb-28 lg:pt-24">
        <div className="absolute -right-28 top-10 size-[420px] rounded-full bg-[#16B994]/20 blur-3xl" />
        <div className="absolute -left-36 bottom-0 size-[360px] rounded-full bg-[#1C459D]/15 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1fr_480px] lg:items-center">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#16B994]/25 bg-white/70 px-4 py-2 text-sm font-semibold text-[#1789AA]">
              <Sparkles size={15} /> {brandTagline}
            </div>
            <h1 className="font-serif text-5xl leading-[1.04] tracking-[-0.04em] sm:text-6xl lg:text-8xl">
              Salon operations and bookings, automated by {brandName}.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[#5e6977]">
              Run appointments, customers, POS, invoices, inventory, staff, and reporting from one installable workspace.
            </p>
          </div>
          <div className="hidden rounded-[2.5rem] border border-[#16B994]/20 bg-white/75 p-8 shadow-[0_24px_80px_rgba(23,50,121,0.12)] lg:block">
            <Image src="/operyx-logo.png" alt={`${brandName} logo`} width={640} height={384} className="w-full object-contain" priority />
          </div>

          <div className="lg:col-span-2">
            <div className="grid max-w-5xl gap-2 rounded-3xl border border-[#173279]/5 bg-white p-2 shadow-[0_24px_80px_rgba(23,50,121,0.10)] md:grid-cols-[1.2fr_1fr_auto] md:rounded-full">
              <label className="flex items-center gap-3 rounded-full px-5 py-3.5">
                <Search size={20} className="text-[#1969A2]" />
                <input className="w-full bg-transparent text-sm outline-none placeholder:text-[#8a98a8]" placeholder="Service or salon" />
              </label>
              <label className="flex items-center gap-3 border-[#173279]/10 px-5 py-3.5 md:border-l">
                <MapPin size={20} className="text-[#1969A2]" />
                <input className="w-full bg-transparent text-sm outline-none placeholder:text-[#8a98a8]" placeholder="Bengaluru" />
              </label>
              <a href="#discover" className="flex items-center justify-center gap-2 rounded-full bg-[#1969A2] px-7 py-3.5 text-sm font-bold text-white hover:bg-[#1789AA]">
                Find salons <ArrowRight size={17} />
              </a>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {categories.map((category) => (
                <button key={category} className="rounded-full border border-[#173279]/10 bg-white/60 px-4 py-2 text-sm font-medium transition hover:border-[#16B994]/50 hover:bg-white">
                  {category}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="discover" className="bg-white px-5 py-20 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#1969A2]">Verified near you</p>
              <h2 className="mt-2 font-serif text-4xl tracking-tight sm:text-5xl">Salons worth showing up for</h2>
            </div>
            <button className="flex items-center gap-2 text-sm font-bold text-[#1789AA]">View all salons <ArrowRight size={16} /></button>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {salons.map((salon, index) => (
              <article key={salon.id} className="group overflow-hidden rounded-[2rem] border border-[#173279]/8 bg-[#fbfdff] transition hover:-translate-y-1 hover:shadow-xl">
                <div className={`relative h-64 bg-gradient-to-br ${salon.accent} p-6`}>
                  <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_30%_20%,white_0,transparent_24%),radial-gradient(circle_at_80%_80%,white_0,transparent_20%)]" />
                  <span className="relative inline-flex rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-[#173279]">{salon.badge}</span>
                  <div className="absolute bottom-6 left-6 font-serif text-6xl text-white/90">0{index + 1}</div>
                  <button aria-label="Save salon" className="absolute right-6 top-6 grid size-10 place-items-center rounded-full bg-white/90 text-lg">♡</button>
                </div>
                <div className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-serif text-2xl font-semibold">{salon.name}</h3>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-[#667386]"><MapPin size={14} /> {salon.area} · {salon.distance}</p>
                    </div>
                    <div className="flex items-center gap-1 rounded-full bg-[#E8FBFB] px-2.5 py-1 text-sm font-bold text-[#1789AA]"><Star size={14} fill="currentColor" /> {salon.rating}</div>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-[#667386]">{salon.description}</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {salon.services.map((service) => <span key={service} className="rounded-full bg-[#eaf4fb] px-3 py-1 text-xs font-semibold">{service}</span>)}
                  </div>
                  <div className="mt-6 flex items-center justify-between border-t border-[#173279]/8 pt-5">
                    <div>
                      <p className="text-xs text-[#667386]">Next available</p>
                      <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-[#1789AA]"><Clock3 size={15} /> {salon.nextSlot}</p>
                    </div>
                    <Link href={`/book/${salon.id}`} className="rounded-full bg-[#173279] px-5 py-2.5 text-sm font-bold text-white">Book</Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {!salons.length && <div className="mt-10 rounded-[2rem] border border-dashed border-[#173279]/15 bg-[#fbfdff] p-12 text-center"><h3 className="font-serif text-3xl">No approved salons yet</h3><p className="mt-3 text-[#667386]">New salons will appear here after branch verification and approval.</p></div>}
        </div>
      </section>

      <section id="how-it-works" className="px-5 py-20 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-12 rounded-[2.5rem] bg-[#173279] p-8 text-white lg:grid-cols-[.8fr_1.2fr] lg:p-14">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#16B994]">Simple by design</p>
            <h2 className="mt-3 font-serif text-4xl leading-tight">From “I need a trim” to booked in minutes.</h2>
            <p className="mt-5 leading-7 text-white/65">Every salon is verified before it appears. Every operations record connects back to real appointments, invoices, and reports.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              [Search, "Discover", "Browse by service, location, rating, and real availability."],
              [CalendarDays, "Book instantly", "Choose your professional and time with immediate confirmation."],
              [ShieldCheck, "Operate clearly", "Verified businesses, transparent pricing, and connected salon records."],
            ].map(([Icon, title, body]) => {
              const StepIcon = Icon as typeof Search;
              return (
                <div key={title as string} className="rounded-3xl bg-white/8 p-6">
                  <StepIcon className="text-[#16B994]" />
                  <h3 className="mt-8 text-lg font-bold">{title as string}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/60">{body as string}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="border-t border-[#173279]/8 px-5 py-8 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 text-sm text-[#667386] sm:flex-row">
          <p>© 2026 {brandName}</p>
          <p className="flex items-center gap-2"><Check size={14} /> Made for India&apos;s beauty professionals</p>
        </div>
      </footer>
    </main>
  );
}
