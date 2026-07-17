import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  CalendarDays,
  CreditCard,
  FileText,
  Percent,
  ReceiptText,
  ShieldCheck,
  Store,
  Users,
} from "lucide-react";
import { BrandMark, brandName } from "@/components/brand-mark";

/**
 * The Operyx home page.
 *
 * Sells the software to salon owners. It used to be a consumer marketplace - a salon search bar and
 * "Book" cards - while the headline talked about POS and inventory, so it pitched two audiences and
 * landed neither. Everything built here for months is the operator's workspace, so that is what
 * this page is about.
 *
 * Deliberately static: no database call. The old page queried published branches on every request,
 * which meant the marketing site went down whenever Postgres was asleep. A page whose job is to say
 * what the product does should not depend on the product's database being awake.
 */

export const metadata = {
  title: "Operyx — salon operations, automated",
  description:
    "Bookings, billing, GST invoices, stock, staff and reports in one workspace. Built for Indian salons, from a single chair to a franchise network.",
};

const counterFeatures = [
  { icon: CalendarDays, title: "Bookings", body: "The day as a list, not a puzzle. Who is here, who is next, who has not paid." },
  { icon: CreditCard, title: "Billing", body: "One screen from customer to payment. Split tenders, cash change, held sales." },
  { icon: ReceiptText, title: "GST invoices", body: "Tax invoice or bill of supply, correct either way. A4 to file, A5 for the counter." },
  { icon: Boxes, title: "Products & stock", body: "Catalogue, categories, brands and units together. Stock moves when you sell." },
  { icon: Users, title: "Team", body: "Attendance, shifts, commission. Each person sees only their own work." },
  { icon: Percent, title: "Offers", body: "Memberships, packages, gift cards, coupons and points that survive a refund." },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-[#1F2937]">
      {/* ---------------------------------------------------------------- header */}
      <header className="sticky top-0 z-30 border-b border-black/5 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-5 lg:px-8">
          <Link href="/" aria-label={brandName}><BrandMark /></Link>
          <nav className="hidden items-center gap-8 text-sm font-semibold text-[#6B7280] md:flex">
            <a href="#counter" className="transition hover:text-[#5B2A86]">What it does</a>
            <a href="#gst" className="transition hover:text-[#5B2A86]">GST</a>
            <a href="#scale" className="transition hover:text-[#5B2A86]">Franchise</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-full px-4 py-2.5 text-sm font-bold text-[#5B2A86] transition hover:bg-[#F3E8FF]">Sign in</Link>
            <Link href="/onboarding/register" className="rounded-full bg-[#5B2A86] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#472066]">
              Start free
            </Link>
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------------------- hero */}
      <section className="relative overflow-hidden px-5 pb-20 pt-16 lg:px-8 lg:pt-24">
        <div className="pointer-events-none absolute -right-32 -top-24 size-[460px] rounded-full bg-[#F3E8FF] blur-3xl" />
        <div className="relative mx-auto max-w-6xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-[#E3D9EE] bg-[#FBF9FD] px-4 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-[#5B2A86]">
            Operations. Automated.
          </p>
          <h1 className="mt-6 max-w-4xl font-serif text-5xl leading-[1.05] tracking-[-0.03em] sm:text-6xl lg:text-7xl">
            Run the whole salon from the front desk.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-[#6B7280]">
            Bookings, billing, GST invoices, stock, staff and reports — one workspace your reception
            team can use on day one, without training.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/onboarding/register" className="inline-flex items-center gap-2 rounded-full bg-[#5B2A86] px-7 py-3.5 text-sm font-bold text-white transition hover:bg-[#472066]">
              Start free <ArrowRight size={17} />
            </Link>
            <Link href="/login" className="inline-flex items-center gap-2 rounded-full border border-[#E3D9EE] px-7 py-3.5 text-sm font-bold text-[#5B2A86] transition hover:bg-[#F3E8FF]">
              Sign in
            </Link>
          </div>
          <p className="mt-5 text-sm text-[#9CA3AF]">
            Works on the counter PC, a tablet, or a phone. Installs like an app.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- what it does */}
      <section id="counter" className="border-y border-black/5 bg-[#FBF9FD] px-5 py-20 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="max-w-2xl font-serif text-4xl tracking-tight sm:text-5xl">
            Everything the counter touches, in one place.
          </h2>
          <p className="mt-4 max-w-2xl text-[#6B7280]">
            Not modules bolted together. A sale moves stock, pays commission, earns points and files
            its own GST — because it is one system, not seven.
          </p>

          <div className="mt-12 grid gap-px overflow-hidden rounded-[1.75rem] border border-[#E3D9EE] bg-[#E3D9EE] sm:grid-cols-2 lg:grid-cols-3">
            {counterFeatures.map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-white p-7">
                <span className="grid size-11 place-items-center rounded-xl bg-[#F3E8FF] text-[#5B2A86]"><Icon size={19} /></span>
                <h3 className="mt-5 text-lg font-bold text-[#1F2937]">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#6B7280]">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- GST */}
      <section id="gst" className="px-5 py-24 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-14 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#5B2A86]">GST, done properly</p>
            <h2 className="mt-3 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
              An invoice is a legal record, not a receipt.
            </h2>
            <p className="mt-5 leading-7 text-[#6B7280]">
              Most salon software prints a total and calls it a tax invoice. Operyx keeps what the law
              asks for: the supplier and their GSTIN, the place of supply, an HSN or SAC code on every
              line, and the tax split correctly — CGST and SGST within the state, IGST across it.
            </p>
            <ul className="mt-7 space-y-3.5">
              {[
                "Rates come from one tax master, so a service cannot drift from it.",
                "Every serial is unique per branch, per year, and inside GST's 16 characters.",
                "Rates and codes are snapshotted onto the bill, so re-pricing tomorrow never rewrites yesterday.",
              ].map((line) => (
                <li key={line} className="flex gap-3 text-sm leading-6 text-[#4B5563]">
                  <ShieldCheck size={17} className="mt-0.5 shrink-0 text-[#5B2A86]" />{line}
                </li>
              ))}
            </ul>
          </div>

          {/* A real invoice, not a stock photo of one. */}
          <div className="rounded-[1.75rem] border border-[#E3D9EE] bg-white p-7 shadow-[0_24px_70px_rgba(91,42,134,0.10)]">
            <div className="flex items-start justify-between border-b-2 border-[#5B2A86] pb-4">
              <div>
                <p className="font-serif text-xl font-semibold text-[#5B2A86]">Velvet Glow Salon</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#9CA3AF]">Tax invoice</p>
              </div>
              <p className="font-serif text-sm text-[#5B2A86]">WHF/2526/00001</p>
            </div>
            <table className="mt-4 w-full text-left text-xs">
              <thead>
                <tr className="text-[9px] uppercase tracking-[0.1em] text-[#9CA3AF]">
                  <th className="pb-2 font-semibold">Description</th>
                  <th className="pb-2 font-semibold">HSN/SAC</th>
                  <th className="pb-2 text-right font-semibold">GST</th>
                  <th className="pb-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="text-[#4B5563]">
                <tr className="border-t border-[#EFEAF3]">
                  <td className="py-2.5 font-semibold text-[#1F2937]">Keratin hair spa</td>
                  <td className="py-2.5 tabular-nums">999721</td>
                  <td className="py-2.5 text-right tabular-nums">18%</td>
                  <td className="py-2.5 text-right font-bold tabular-nums">₹1,298</td>
                </tr>
                <tr className="border-t border-[#EFEAF3]">
                  <td className="py-2.5 font-semibold text-[#1F2937]">Argan shampoo 200ml</td>
                  <td className="py-2.5 tabular-nums">3305</td>
                  <td className="py-2.5 text-right tabular-nums">18%</td>
                  <td className="py-2.5 text-right font-bold tabular-nums">₹118</td>
                </tr>
              </tbody>
            </table>
            <div className="mt-4 space-y-1.5 border-t border-[#EFEAF3] pt-4 text-xs">
              <p className="flex justify-between text-[#6B7280]"><span>CGST</span><span className="tabular-nums">₹108.00</span></p>
              <p className="flex justify-between text-[#6B7280]"><span>SGST</span><span className="tabular-nums">₹108.00</span></p>
              <p className="mt-2 flex justify-between border-t-2 border-[#5B2A86] pt-2.5 font-serif text-lg font-bold text-[#5B2A86]">
                <span>Total</span><span className="tabular-nums">₹1,416.00</span>
              </p>
            </div>
            <p className="mt-5 flex items-center gap-2 text-[11px] font-semibold text-[#9CA3AF]">
              <FileText size={13} /> Download, print A4 or A5, or send it on WhatsApp.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- scale */}
      <section id="scale" className="px-5 pb-24 lg:px-8">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-[#5B2A86] p-8 text-white lg:p-14">
          <div className="grid gap-12 lg:grid-cols-[.9fr_1.1fr]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#D9C7EC]">One chair to a hundred</p>
              <h2 className="mt-3 font-serif text-4xl leading-tight">Complexity you have to earn.</h2>
              <p className="mt-5 leading-7 text-white/70">
                A single-salon owner never meets franchise models, legal entities, or a branch picker —
                not because a simple mode is switched on, but because Operyx can see there is one
                branch and says nothing about franchises. Open a second and the picker appears by
                itself.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                [Store, "COCO", "You own it, you run it. The company bills."],
                [Users, "FOCO", "They funded it, you run it. The company still bills."],
                [ShieldCheck, "FOFO", "They own and run it, so they bill — under their own GSTIN."],
              ].map(([Icon, title, body]) => {
                const Glyph = Icon as typeof Store;
                return (
                  <div key={title as string} className="rounded-2xl bg-white/10 p-5">
                    <Glyph size={20} className="text-[#D9C7EC]" />
                    <h3 className="mt-6 font-bold">{title as string}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-white/65">{body as string}</p>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="mt-10 border-t border-white/15 pt-6 text-sm text-white/60">
            Whoever operates a branch is the supplier — so a franchisee&apos;s sale bills under the
            franchisee&apos;s GSTIN, and never lands in the company&apos;s revenue.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- CTA */}
      <section className="border-t border-black/5 bg-[#FBF9FD] px-5 py-20 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-serif text-3xl tracking-tight sm:text-4xl">Set it up this afternoon.</h2>
            <p className="mt-2 text-[#6B7280]">Add your services, open the counter, take a bill. No card needed.</p>
          </div>
          <Link href="/onboarding/register" className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#5B2A86] px-7 py-3.5 text-sm font-bold text-white transition hover:bg-[#472066]">
            Start free <ArrowRight size={17} />
          </Link>
        </div>
      </section>

      {/* ---------------------------------------------------------------- footer */}
      <footer className="px-5 py-10 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-4 text-sm text-[#9CA3AF] sm:flex-row sm:items-center">
          <BrandMark compact />
          <p>© {new Date().getFullYear()} {brandName} · Built for India&apos;s salons</p>
        </div>
      </footer>
    </main>
  );
}
