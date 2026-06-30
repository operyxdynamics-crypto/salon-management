"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { BrandMark, brandName } from "@/components/brand-mark";

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
    <div className="w-full max-w-md rounded-[2rem] bg-white p-7 shadow-xl sm:p-9">
      <Link href="/" className="mb-8 flex items-center gap-2 text-sm font-bold text-[#756e67] lg:hidden"><ArrowLeft size={17} /> Back to {brandName}</Link>
      <div className="mb-8 lg:hidden"><BrandMark /></div>
      <p className="text-xs font-bold uppercase tracking-[.18em] text-[#9e5d55]">Welcome back</p>
      <h2 className="mt-2 font-serif text-4xl font-semibold">Sign in to {brandName}</h2>
      <div className="mt-7 grid grid-cols-2 rounded-full bg-[#f2efea] p-1">
        <button onClick={() => { setMode("staff"); setError(""); }} className={`rounded-full py-2.5 text-sm font-bold ${mode === "staff" ? "bg-white shadow-sm" : "text-[#817970]"}`}>Salon team</button>
        <button onClick={() => { setMode("customer"); setError(""); }} className={`rounded-full py-2.5 text-sm font-bold ${mode === "customer" ? "bg-white shadow-sm" : "text-[#817970]"}`}>Customer</button>
      </div>
      {mode === "staff" ? (
        <form onSubmit={submitStaff} className="mt-7 space-y-4">
          <Input label="Work email" name="email" type="email" defaultValue={showDemoHints ? "owner@neel.demo" : ""} autoComplete="email" />
          <Input label="Password" name="password" type="password" defaultValue={showDemoHints ? "Aero@1406" : ""} autoComplete="current-password" />
          {error && <p className="text-sm font-semibold text-[#a55348]">{error}</p>}
          <Submit loading={loading}>Sign in to workspace</Submit>
          <Link href="/onboarding/register" className="block text-center text-sm font-bold text-[#2f6a55]">Register a new salon</Link>
          {showDemoHints && (
            <p className="text-center text-xs leading-5 text-[#8b837b]">Salon: owner@neel.demo / Aero@1406<br />Admin: admin@neel.demo / Aero@1406</p>
          )}
        </form>
      ) : (
        <form onSubmit={submitCustomer} className="mt-7 space-y-4">
          <Input label="Mobile number" name="phone" type="tel" defaultValue={showDemoHints ? "+919876543210" : ""} readOnly={step === "otp"} />
          {step === "otp" && <Input label="6-digit code" name="code" type="text" defaultValue={showDemoHints ? "123456" : ""} />}
          {error && <p className="text-sm font-semibold text-[#a55348]">{error}</p>}
          <Submit loading={loading}>{step === "phone" ? "Send secure code" : "Verify and continue"}</Submit>
          <p className="text-center text-xs text-[#8b837b]">{step === "phone" ? "We'll send a one-time code by SMS." : showDemoHints ? "Demo code: 123456" : "Enter the 6-digit code we sent you."}</p>
        </form>
      )}
    </div>
  );
}

function Input({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="block"><span className="text-sm font-bold">{label}</span><input {...props} className="mt-2 w-full rounded-xl border border-black/10 px-4 py-3.5 text-sm outline-none transition focus:border-[#9e5d55]" required /></label>;
}

function Submit({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-full bg-[#203a36] py-3.5 text-sm font-bold text-white disabled:opacity-60">{loading && <LoaderCircle size={17} className="animate-spin" />}{children}</button>;
}
