"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, LoaderCircle, TriangleAlert } from "lucide-react";
import { BrandMark, brandName } from "@/components/brand-mark";

/**
 * The demo credentials are prefilled locally so nobody has to remember them, and never in
 * production - a login form that hands out an owner password would be an open door.
 */
const showDemoHints = process.env.NODE_ENV !== "production";

export function LoginPanel() {
  const [mode, setMode] = useState<"staff" | "customer">("staff");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submitStaff(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/auth/staff", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    });
    setLoading(false);
    // Deliberately vague: saying which half was wrong tells an attacker which emails exist.
    if (!response.ok) return setError("Email or password is incorrect.");
    const result = await response.json();
    window.location.href = result.data.redirectTo;
  }

  async function submitCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const endpoint = step === "phone" ? "/api/v1/auth/otp/request" : "/api/v1/auth/otp/verify";
    const body = step === "phone"
      ? { phone: form.get("phone") }
      : { phone: form.get("phone"), code: form.get("code") };
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setLoading(false);
    if (!response.ok) return setError("Please check the details and try again.");
    if (step === "phone") setStep("otp");
    else window.location.href = "/";
  }

  return (
    <div className="w-full max-w-md rounded-[1.75rem] border border-[#EFEAF3] bg-white p-7 shadow-[0_24px_70px_rgba(91,42,134,0.10)] sm:p-9">
      {/* The purple panel is hidden below lg, so the brand has to appear here instead. */}
      <Link href="/" className="mb-7 inline-flex items-center gap-1.5 text-sm font-bold text-[#9CA3AF] transition hover:text-[#5B2A86] lg:hidden">
        <ArrowLeft size={16} /> Back to {brandName}
      </Link>
      <div className="mb-7 lg:hidden"><BrandMark /></div>

      <h2 className="font-serif text-4xl font-semibold tracking-tight text-[#1F2937]">Sign in</h2>
      <p className="mt-2 text-sm text-[#6B7280]">Welcome back to {brandName}.</p>

      <div className="mt-7 grid grid-cols-2 rounded-full bg-[#F6F2FA] p-1">
        {(["staff", "customer"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => { setMode(value); setError(""); }}
            aria-pressed={mode === value}
            className={`rounded-full py-2.5 text-sm font-bold transition ${mode === value ? "bg-white text-[#5B2A86] shadow-sm" : "text-[#9CA3AF] hover:text-[#6B7280]"}`}
          >
            {value === "staff" ? "Salon team" : "Customer"}
          </button>
        ))}
      </div>

      {mode === "staff" ? (
        <form onSubmit={submitStaff} className="mt-7 space-y-4">
          <Input label="Work email" name="email" type="email" defaultValue={showDemoHints ? "owner@operyx.demo" : ""} autoComplete="email" />
          <Input label="Password" name="password" type="password" defaultValue={showDemoHints ? "Aero@1406" : ""} autoComplete="current-password" />
          <ErrorNote error={error} />
          <Submit loading={loading}>Sign in to workspace</Submit>
          <Link href="/onboarding/register" className="block text-center text-sm font-bold text-[#5B2A86] transition hover:text-[#472066]">
            Register a new salon
          </Link>
        </form>
      ) : (
        <form onSubmit={submitCustomer} className="mt-7 space-y-4">
          <Input label="Mobile number" name="phone" type="tel" defaultValue={showDemoHints ? "+919876543210" : ""} readOnly={step === "otp"} autoComplete="tel" />
          {step === "otp" && <Input label="6-digit code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" defaultValue={showDemoHints ? "123456" : ""} />}
          <ErrorNote error={error} />
          <Submit loading={loading}>{step === "phone" ? "Send secure code" : "Verify and continue"}</Submit>
          <p className="text-center text-xs text-[#9CA3AF]">
            {step === "phone" ? "We'll send a one-time code by SMS." : "Enter the 6-digit code we sent you."}
          </p>
        </form>
      )}

      {/* Clearly marked as scaffolding, so nobody mistakes it for a real account. */}
      {showDemoHints && (
        <div className="mt-7 rounded-xl border border-dashed border-[#E3D9EE] bg-[#FBF9FD] p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9CA3AF]">Demo data · local only</p>
          <p className="mt-1.5 text-xs leading-5 text-[#6B7280]">
            Salon <span className="font-semibold text-[#5B2A86]">owner@operyx.demo</span> · Admin{" "}
            <span className="font-semibold text-[#5B2A86]">admin@operyx.demo</span><br />
            Customer code <span className="font-semibold text-[#5B2A86]">123456</span>
          </p>
        </div>
      )}
    </div>
  );
}

function ErrorNote({ error }: { error: string }) {
  if (!error) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl border border-[#F0C4C2] bg-[#FDECEC] p-3 text-sm font-semibold text-[#94302E]">
      <TriangleAlert size={16} className="mt-0.5 shrink-0" />{error}
    </p>
  );
}

function Input({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-[#4B5563]">{label}</span>
      <input
        {...props}
        required
        className="mt-2 w-full rounded-xl border border-[#E5E7EB] bg-white px-4 py-3.5 text-sm text-[#1F2937] outline-none transition placeholder:text-[#C7CBD1] focus:border-[#5B2A86] focus:ring-4 focus:ring-[#5B2A86]/12 read-only:bg-[#F6F7FB] read-only:text-[#6B7280]"
      />
    </label>
  );
}

function Submit({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return (
    <button
      disabled={loading}
      className="flex w-full items-center justify-center gap-2 rounded-full bg-[#5B2A86] py-3.5 text-sm font-bold text-white transition hover:bg-[#472066] disabled:opacity-60"
    >
      {loading && <LoaderCircle size={17} className="animate-spin" />}{children}
    </button>
  );
}
