"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, Check, ChevronRight, Clock, LoaderCircle, MapPin, Phone, Sparkles, Star, User } from "lucide-react";
import { inr } from "@/lib/format";

type Service = {
  id: string;
  name: string;
  category: string;
  durationMinutes: number;
  price: number;
};

type StaffMember = {
  id: string;
  name: string;
  role: string;
  serviceIds: string[];
};

type Salon = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  branchId: string;
  branchName: string;
  branchAddress: string;
  branchPhone: string | null;
  rating: number;
  reviews: number;
  services: Service[];
  staff: StaffMember[];
};

type Step = "select" | "details" | "verify" | "confirmed";

const indiaFormatter = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" });
const indiaIsoDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });
const indiaTime = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });
const indiaFullDate = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", year: "numeric" });

function buildDateChoices(count: number) {
  const today = new Date();
  return Array.from({ length: count }, (_, index) => {
    const value = new Date(today);
    value.setDate(value.getDate() + index);
    return indiaIsoDate.format(value);
  });
}

export function BookingFlow({ salon }: { salon: Salon }) {
  const [step, setStep] = useState<Step>("select");
  const [serviceId, setServiceId] = useState(salon.services[0]?.id ?? "");
  const [staffId, setStaffId] = useState<string>("");
  const [date, setDate] = useState(() => indiaIsoDate.format(new Date()));
  const [slot, setSlot] = useState<string>("");
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotError, setSlotError] = useState("");
  const [phone, setPhone] = useState("+91");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpExpiresAt, setOtpExpiresAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<{ id: string; startsAt: string; endsAt: string } | null>(null);

  const service = salon.services.find((item) => item.id === serviceId);
  const dateChoices = useMemo(() => buildDateChoices(14), []);
  const qualifiedStaff = useMemo(
    () => salon.staff.filter((member) => !serviceId || member.serviceIds.includes(serviceId)),
    [salon.staff, serviceId],
  );

  // Load available time slots when service / staff / date changes
  useEffect(() => {
    if (!serviceId || !date) return;
    const controller = new AbortController();
    setLoadingSlots(true);
    setSlotError("");
    const params = new URLSearchParams({ branchId: salon.branchId, serviceId, date });
    if (staffId) params.set("staffId", staffId);
    fetch(`/api/v1/availability?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => ({ response, result: await response.json() }))
      .then(({ response, result }) => {
        if (!response.ok) throw new Error(result?.error?.message || result?.error || "Unable to load times");
        setSlots(result.data.slots ?? []);
        if (slot && !(result.data.slots ?? []).includes(slot)) setSlot("");
      })
      .catch((loadError) => {
        if (loadError?.name === "AbortError") return;
        setSlotError(loadError instanceof Error ? loadError.message : "Unable to load times");
        setSlots([]);
      })
      .finally(() => setLoadingSlots(false));
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salon.branchId, serviceId, staffId, date]);

  async function requestOtp() {
    if (!/^\+91[6-9]\d{9}$/.test(phone)) { setError("Enter a valid Indian mobile number."); return; }
    if (name.trim().length < 2) { setError("Tell us your name so the salon knows who's coming."); return; }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/auth/otp/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const result = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) {
        setError(typeof result.error === "string" ? result.error : "Couldn't send the code. Try again in a moment.");
        return;
      }
      const expiresInSeconds = Number((result.data as { expiresInSeconds?: number } | undefined)?.expiresInSeconds ?? 300);
      setOtpExpiresAt(Date.now() + expiresInSeconds * 1000);
      setStep("verify");
    } finally {
      setBusy(false);
    }
  }

  async function verifyAndBook() {
    if (!/^\d{6}$/.test(otpCode)) { setError("Enter the 6-digit code from your SMS."); return; }
    if (!service || !slot) { setError("Please pick a service and time."); return; }
    setBusy(true);
    setError("");
    try {
      const verifyResponse = await fetch("/api/v1/auth/otp/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, code: otpCode }),
      });
      if (!verifyResponse.ok) {
        const result = await verifyResponse.json().catch(() => ({} as Record<string, unknown>));
        setError(typeof result.error === "string" ? result.error : "That code didn't work. Try again.");
        return;
      }
      const bookingResponse = await fetch("/api/v1/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          salonId: salon.tenantId,
          branchId: salon.branchId,
          serviceId: service.id,
          staffId: staffId || undefined,
          source: "SALON_WEBSITE",
          customer: { name: name.trim(), phone, email: email.trim() || undefined },
          startsAt: slot,
          idempotencyKey: `web-${salon.branchId}-${service.id}-${slot}-${phone}`,
        }),
      });
      const bookingResult = await bookingResponse.json().catch(() => ({} as Record<string, unknown>));
      if (!bookingResponse.ok) {
        setError(typeof bookingResult.error === "string" ? bookingResult.error : "We couldn't save your booking. Please try a different time.");
        return;
      }
      const appointment = bookingResult.data as { id: string; startsAt: string; endsAt: string };
      setConfirmation({ id: appointment.id, startsAt: appointment.startsAt, endsAt: appointment.endsAt });
      setStep("confirmed");
    } finally {
      setBusy(false);
    }
  }

  function icsHref() {
    if (!confirmation || !service) return "#";
    const start = confirmation.startsAt.replace(/[-:]/g, "").replace(".000", "");
    const end = confirmation.endsAt.replace(/[-:]/g, "").replace(".000", "");
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Operyx//Booking//EN",
      "BEGIN:VEVENT",
      `UID:${confirmation.id}@${salon.tenantSlug}`,
      `DTSTAMP:${start}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${service.name} at ${salon.tenantName}`,
      `LOCATION:${salon.branchAddress}`,
      `DESCRIPTION:Booking confirmation ${confirmation.id}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines)}`;
  }

  if (!salon.services.length) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#F7FAFC] p-6 text-center">
        <div>
          <h1 className="font-serif text-3xl">{salon.tenantName}</h1>
          <p className="mt-3 text-[#766e67]">This salon hasn&apos;t published a service menu yet.</p>
        </div>
      </main>
    );
  }

  // ============== CONFIRMED ==============
  if (step === "confirmed" && confirmation && service) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#F7FAFC] p-5">
        <div className="w-full max-w-lg rounded-[2rem] bg-white p-7 text-center shadow-xl sm:p-10">
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-[#e5f0eb] text-[#2f6a55]"><Check size={28} /></div>
          <p className="mt-6 text-xs font-bold uppercase tracking-[.18em] text-[#1969A2]">Booking confirmed</p>
          <h1 className="mt-2 font-serif text-3xl">See you soon, {name.split(" ")[0]}.</h1>
          <p className="mt-4 text-sm text-[#756d66]">{service.name} at {salon.tenantName}</p>
          <div className="mt-7 rounded-2xl bg-[#f6f2ec] p-5 text-left text-sm">
            <p className="flex justify-between py-2"><span className="text-[#827970]">Date</span><strong>{indiaFullDate.format(new Date(confirmation.startsAt))}</strong></p>
            <p className="flex justify-between py-2"><span className="text-[#827970]">Time</span><strong>{indiaTime.format(new Date(confirmation.startsAt))}</strong></p>
            <p className="flex justify-between py-2"><span className="text-[#827970]">Duration</span><strong>{service.durationMinutes} minutes</strong></p>
            <p className="flex justify-between py-2"><span className="text-[#827970]">Pay at salon</span><strong>{inr.format(service.price)}</strong></p>
            <p className="flex justify-between border-t border-black/10 pt-3 mt-3"><span className="text-[#827970]">Booking ID</span><strong className="font-mono text-xs">{confirmation.id.slice(0, 12).toUpperCase()}</strong></p>
          </div>
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <a href={icsHref()} download={`${service.name}.ics`} className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-bold">Add to calendar</a>
            {salon.branchPhone && <a href={`tel:${salon.branchPhone}`} className="rounded-full bg-[#173279] px-5 py-3 text-sm font-bold text-white">Call salon</a>}
          </div>
          <p className="mt-5 text-xs text-[#827970]">Need to reschedule? Call the salon at {salon.branchPhone ?? "the number they shared with you"}.</p>
        </div>
      </main>
    );
  }

  // ============== HEADER ==============
  const header = (
    <header className="bg-gradient-to-br from-[#173279] to-[#1789AA] text-white">
      <div className="mx-auto max-w-3xl px-5 pb-10 pt-8 sm:pt-12">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-[#e3c89c]">Book your appointment</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold sm:text-4xl">{salon.tenantName}</h1>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-white/85">
          <span className="flex items-center gap-1"><MapPin size={14} /> {salon.branchAddress}</span>
          {salon.rating > 0 && <span className="flex items-center gap-1"><Star size={14} fill="currentColor" /> {salon.rating.toFixed(1)} ({salon.reviews})</span>}
        </div>
      </div>
    </header>
  );

  // ============== STEP 1: SELECT ==============
  if (step === "select") {
    return (
      <main className="min-h-screen bg-[#F7FAFC] text-[#1F2937]">
        {header}
        <div className="mx-auto max-w-3xl space-y-8 px-5 py-8 pb-32">
          <Section icon={<Sparkles size={18} />} title="Choose a service">
            <div className="grid gap-2.5">
              {salon.services.map((item) => (
                <button key={item.id} onClick={() => { setServiceId(item.id); setStaffId(""); setSlot(""); }} className={`flex items-center justify-between gap-3 rounded-2xl border-2 p-4 text-left transition ${serviceId === item.id ? "border-[#1969A2] bg-white shadow-sm" : "border-black/8 bg-white/60 hover:bg-white"}`}>
                  <div>
                    <p className="font-bold">{item.name}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-[#7c746c]"><Clock size={12} /> {item.durationMinutes} min · {item.category}</p>
                  </div>
                  <span className="text-sm font-bold">{inr.format(item.price)}</span>
                </button>
              ))}
            </div>
          </Section>

          <Section icon={<User size={18} />} title="Choose a professional (optional)">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setStaffId("")} className={`rounded-full border-2 px-4 py-2 text-sm font-semibold ${!staffId ? "border-[#173279] bg-[#173279] text-white" : "border-black/10 bg-white"}`}>Any professional</button>
              {qualifiedStaff.map((member) => (
                <button key={member.id} onClick={() => setStaffId(member.id)} className={`rounded-full border-2 px-4 py-2 text-sm font-semibold ${staffId === member.id ? "border-[#173279] bg-[#173279] text-white" : "border-black/10 bg-white"}`}>
                  {member.name}
                </button>
              ))}
              {!qualifiedStaff.length && <p className="text-sm text-[#827970]">No professionals are mapped to this service yet.</p>}
            </div>
          </Section>

          <Section icon={<Calendar size={18} />} title="Pick a date">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {dateChoices.map((value) => (
                <button key={value} onClick={() => { setDate(value); setSlot(""); }} className={`flex shrink-0 flex-col items-center rounded-2xl border-2 px-4 py-3 ${date === value ? "border-[#173279] bg-[#173279] text-white" : "border-black/10 bg-white"}`}>
                  <span className="text-[10px] font-bold uppercase tracking-wider">{indiaFormatter.format(new Date(`${value}T12:00:00+05:30`)).split(",")[0]}</span>
                  <strong className="mt-0.5 text-lg">{new Date(`${value}T12:00:00+05:30`).getDate()}</strong>
                  <span className="text-[10px]">{indiaFormatter.format(new Date(`${value}T12:00:00+05:30`)).split(" ")[2]}</span>
                </button>
              ))}
            </div>
          </Section>

          <Section icon={<Clock size={18} />} title="Pick a time">
            {loadingSlots ? (
              <p className="flex items-center gap-2 text-sm text-[#827970]"><LoaderCircle size={16} className="animate-spin" /> Checking the salon&apos;s calendar…</p>
            ) : slotError ? (
              <p className="rounded-2xl bg-[#fff0ec] p-4 text-sm font-semibold text-[#995849]">{slotError}</p>
            ) : slots.length ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.map((value) => (
                  <button key={value} onClick={() => setSlot(value)} className={`rounded-xl border-2 px-3 py-3 text-sm font-bold ${slot === value ? "border-[#1969A2] bg-[#1969A2] text-white" : "border-black/10 bg-white"}`}>
                    {indiaTime.format(new Date(value))}
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-[#E5E7EB] bg-[#F7FAFC] p-4 text-sm text-[#737174]">No times open on this date. Try another day.</p>
            )}
          </Section>
        </div>

        <BottomBar
          summary={service ? `${service.name} · ${slot ? indiaTime.format(new Date(slot)) : "Select a time"}` : "Choose a service"}
          price={service ? inr.format(service.price) : ""}
          disabled={!service || !slot}
          label="Continue"
          onClick={() => { setError(""); setStep("details"); }}
        />
      </main>
    );
  }

  // ============== STEP 2: DETAILS ==============
  if (step === "details") {
    return (
      <main className="min-h-screen bg-[#F7FAFC] text-[#1F2937]">
        {header}
        <div className="mx-auto max-w-md space-y-6 px-5 py-8 pb-32">
          <Summary salon={salon} service={service} slot={slot} staffId={staffId} />
          <Section icon={<User size={18} />} title="Your details">
            <div className="space-y-3">
              <Field label="Full name">
                <input value={name} onChange={(event) => setName(event.target.value)} className="field" placeholder="Your full name" autoComplete="name" />
              </Field>
              <Field label="Mobile number">
                <input value={phone} onChange={(event) => setPhone(event.target.value)} type="tel" className="field" placeholder="+91XXXXXXXXXX" autoComplete="tel" />
                <p className="mt-1 text-xs text-[#827970]">We&apos;ll text you a 6-digit code to confirm.</p>
              </Field>
              <Field label="Email (optional)">
                <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" className="field" placeholder="you@example.com" autoComplete="email" />
              </Field>
            </div>
          </Section>
          {error && <p className="rounded-2xl bg-[#fff0ec] p-3 text-sm font-semibold text-[#995849]">{error}</p>}
        </div>
        <BottomBar
          summary="Step 2 of 3"
          price=""
          disabled={busy}
          label={busy ? "Sending code…" : "Send verification code"}
          onClick={requestOtp}
        />
      </main>
    );
  }

  // ============== STEP 3: VERIFY ==============
  const remainingSeconds = otpExpiresAt ? Math.max(0, Math.ceil((otpExpiresAt - Date.now()) / 1000)) : 0;
  return (
    <main className="min-h-screen bg-[#F7FAFC] text-[#1F2937]">
      {header}
      <div className="mx-auto max-w-md space-y-6 px-5 py-8 pb-32">
        <Summary salon={salon} service={service} slot={slot} staffId={staffId} />
        <Section icon={<Phone size={18} />} title="Verify your number">
          <p className="text-sm text-[#827970]">We sent a 6-digit code to <strong>{phone}</strong>. {remainingSeconds > 0 && `Expires in ${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")}.`}</p>
          <input
            value={otpCode}
            onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            maxLength={6}
            className="field mt-4 tracking-[0.4em] text-center font-mono text-2xl"
            placeholder="••••••"
            autoFocus
          />
          <button onClick={requestOtp} disabled={busy} className="mt-3 text-sm font-bold text-[#1969A2] disabled:opacity-50">Resend code</button>
        </Section>
        {error && <p className="rounded-2xl bg-[#fff0ec] p-3 text-sm font-semibold text-[#995849]">{error}</p>}
      </div>
      <BottomBar
        summary="Step 3 of 3"
        price=""
        disabled={busy || otpCode.length !== 6}
        label={busy ? "Confirming…" : "Confirm booking"}
        onClick={verifyAndBook}
      />
    </main>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 font-serif text-xl"><span className="grid size-7 place-items-center rounded-full bg-[#E8FBFB] text-[#1969A2]">{icon}</span>{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wider text-[#827970]">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Summary({ salon, service, slot, staffId }: { salon: Salon; service: Service | undefined; slot: string; staffId: string }) {
  const staffName = staffId ? salon.staff.find((member) => member.id === staffId)?.name ?? "Any professional" : "Any professional";
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-[#1969A2]">Your appointment</p>
      <p className="mt-2 font-serif text-lg">{service?.name ?? "Service"}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-[#827970]">
        <div><p className="font-bold text-[#1F2937]">{slot ? indiaTime.format(new Date(slot)) : "—"}</p><p>{slot ? indiaFullDate.format(new Date(slot)) : ""}</p></div>
        <div><p className="font-bold text-[#1F2937]">{staffName}</p><p>{service ? `${service.durationMinutes} min` : ""}</p></div>
      </div>
      <p className="mt-3 flex items-center justify-between text-sm"><span className="text-[#827970]">Pay at salon</span><strong>{service ? inr.format(service.price) : ""}</strong></p>
    </div>
  );
}

function BottomBar({ summary, price, disabled, label, onClick }: { summary: string; price: string; disabled: boolean; label: string; onClick: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t border-black/8 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-[#827970]">{summary}</p>
          {price && <p className="text-lg font-bold">{price}</p>}
        </div>
        <button onClick={onClick} disabled={disabled} className="flex shrink-0 items-center gap-1 rounded-full bg-[#173279] px-6 py-3 text-sm font-bold text-white disabled:opacity-50">
          {label} <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
