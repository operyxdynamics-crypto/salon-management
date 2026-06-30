"use client";

import { FormEvent, useState } from "react";

export function RegistrationForm() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/onboarding/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form)),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return setError(result.error?.message ?? "Unable to create workspace");
    window.location.href = result.data.redirectTo;
  }
  return <form onSubmit={submit} className="mt-8 grid gap-4 sm:grid-cols-2"><Field name="businessName" label="Salon name" /><Field name="ownerName" label="Owner name" /><Field name="email" label="Work email" type="email" /><Field name="phone" label="India mobile" defaultValue="+91" /><Field name="city" label="Primary city" /><Field name="password" label="Password" type="password" />{error && <p className="sm:col-span-2 rounded-xl bg-[#f2ded8] p-3 text-sm font-bold text-[#995849]">{error}</p>}<button disabled={busy} className="primary justify-center sm:col-span-2">{busy ? "Creating workspace..." : "Create workspace"}</button></form>;
}

export function InvitationForm({ token }: { token: string }) {
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/onboarding/invitation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, ...Object.fromEntries(form) }) });
    const result = await response.json();
    if (!response.ok) return setError(result.error?.message ?? "Unable to accept invitation");
    window.location.href = result.data.redirectTo;
  }
  return <form onSubmit={submit} className="mt-7 grid gap-4"><Field name="name" label="Owner name" /><Field name="phone" label="India mobile" defaultValue="+91" /><Field name="password" label="Password" type="password" />{error && <p className="rounded-xl bg-[#f2ded8] p-3 text-sm font-bold text-[#995849]">{error}</p>}<button className="primary justify-center">Accept and continue</button></form>;
}

function Field({ name, label, type = "text", defaultValue }: { name: string; label: string; type?: string; defaultValue?: string }) {
  return <label className="text-sm font-bold">{label}<input className="field mt-2" required name={name} type={type} defaultValue={defaultValue} /></label>;
}
