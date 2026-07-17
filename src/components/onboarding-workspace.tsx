"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Circle, FileUp, LogOut, Plus, Send } from "lucide-react";
import { BrandMark, brandName } from "@/components/brand-mark";
import { inr } from "@/lib/format";

type Data = {
  id: string;
  name: string;
  legalName: string | null;
  gstin: string | null;
  panNumber: string | null;
  status: string;
  services: Array<{ id: string; name: string; category: string; durationMinutes: number; price: string | number; taxRate: string | number; priceTaxMode: "EXCLUSIVE" | "INCLUSIVE" }>;
  verificationDocuments: Array<{ id: string; branchId: string | null; type: string; fileName: string; status: string; reviewNote: string | null }>;
  branches: Array<{
    id: string; name: string; phone: string | null; email: string | null; address: string; city: string; state: string; postalCode: string;
    profileDescription: string | null; publicationStatus: string; policies: { cancellationHours?: number } | null;
    operatingHours: Array<{ dayOfWeek: number; opensAt: string; closesAt: string; isClosed: boolean }>;
    checklist: Record<string, boolean>;
    reviewsHistory: Array<{ id: string; note: string | null; toStatus: string; createdAt: string }>;
  }>;
};

const documentTypes = [
  ["GST_CERTIFICATE", "GST certificate"], ["PAN_CARD", "PAN card"], ["ADDRESS_PROOF", "Address proof"],
  ["BANK_PROOF", "Cancelled cheque / bank proof"], ["SALON_MEDIA", "Salon photo"],
];
const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function OnboardingWorkspace() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState("");

  async function refresh() {
    const response = await fetch("/api/v1/onboarding", { cache: "no-store" });
    if (response.status === 401) return void (window.location.href = "/login");
    const result = await response.json();
    if (!response.ok) return setError(result.error?.message ?? "Unable to load onboarding");
    setData(result.data);
    setSelectedBranchId((current) => current || result.data.branches[0]?.id || "");
  }
  useEffect(() => {
    let active = true;
    fetch("/api/v1/onboarding", { cache: "no-store" })
      .then(async (response) => ({ response, result: await response.json() }))
      .then(({ response, result }) => {
        if (!active) return;
        if (response.status === 401) window.location.href = "/login";
        else if (!response.ok) setError(result.error?.message ?? "Unable to load onboarding");
        else {
          setData(result.data);
          setSelectedBranchId(result.data.branches[0]?.id ?? "");
        }
      })
      .catch(() => { if (active) setError("Unable to load onboarding"); });
    return () => { active = false; };
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    setBusy(true); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    const branch = data.branches.find((item) => item.id === selectedBranchId) ?? data.branches[0];
    if (!branch) return;
    const body = {
      name: form.get("name"),
      legalName: form.get("legalName"),
      gstin: String(form.get("gstin")).replace(/\s/g, "").toUpperCase(),
      panNumber: String(form.get("panNumber")).replace(/\s/g, "").toUpperCase(),
      branch: {
        id: branch.id, name: form.get("branchName"), phone: form.get("phone"), email: form.get("email"), address: form.get("address"),
        city: form.get("city"), state: form.get("state"), postalCode: form.get("postalCode"), profileDescription: form.get("profileDescription"),
        cancellationHours: Number(form.get("cancellationHours")),
      },
      operatingHours: dayNames.map((_, dayOfWeek) => ({ dayOfWeek, opensAt: String(form.get(`open-${dayOfWeek}`)), closesAt: String(form.get(`close-${dayOfWeek}`)), isClosed: form.get(`closed-${dayOfWeek}`) === "on" })),
    };
    const response = await fetch("/api/v1/onboarding", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json(); setBusy(false);
    if (!response.ok) return setError(validationMessage(result.error));
    setNotice("Business and branch profile saved."); await refresh();
  }

  async function addService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await fetch("/api/v1/onboarding/services", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name"), category: form.get("category"), durationMinutes: Number(form.get("durationMinutes")), price: Number(form.get("price")), taxRate: Number(form.get("taxRate")), priceTaxMode: form.get("priceTaxMode") }) });
    const result = await response.json(); if (!response.ok) return setError(result.error?.message ?? "Unable to add service");
    formElement.reset(); setNotice("Service added."); await refresh();
  }

  async function addBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true); setError("");
    const response = await fetch("/api/v1/onboarding/branches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: form.get("name"), city: form.get("city") }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return setError(result.error?.message ?? "Unable to add branch");
    formElement.reset();
    setSelectedBranchId(result.data.id);
    setNotice("New branch draft created.");
    await refresh();
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true); setError("");
    const response = await fetch("/api/v1/onboarding/documents", { method: "POST", body: new FormData(formElement) });
    const result = await response.json(); setBusy(false);
    if (!response.ok) return setError(result.error?.message ?? "Unable to upload document");
    formElement.reset(); setNotice("Document uploaded for review."); await refresh();
  }

  async function submitBranch() {
    if (!data) return;
    const branch = data.branches.find((item) => item.id === selectedBranchId) ?? data.branches[0];
    if (!branch) return;
    const response = await fetch(`/api/v1/onboarding/branches/${branch.id}/submit`, { method: "POST" });
    const result = await response.json();
    if (!response.ok) return setError(`${result.error?.message ?? "Unable to submit"}. ${missing(result.error?.details ?? branch.checklist)}`);
    setNotice(`Branch submitted to ${brandName} for review.`); await refresh();
  }

  if (!data) return <main className="grid min-h-screen place-items-center bg-[#F7FAFC]"><p>Loading onboarding...</p></main>;
  const branch = data.branches.find((item) => item.id === selectedBranchId) ?? data.branches[0];
  if (!branch) return <main className="grid min-h-screen place-items-center bg-[#F7FAFC]"><p>No branch is configured.</p></main>;
  const hours = dayNames.map((_, day) => branch.operatingHours.find((item) => item.dayOfWeek === day) ?? { dayOfWeek: day, opensAt: "09:00", closesAt: "20:00", isClosed: false });
  const complete = Object.values(branch.checklist).every(Boolean);
  const editable = ["DRAFT", "REJECTED"].includes(branch.publicationStatus);
  const checklistDetails = onboardingChecklistDetails(data, branch);

  return <main className="min-h-screen bg-[#F7FAFC] text-[#1F2937]">
    <header className="bg-[#173279] text-white"><div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5"><Link href="/" className="flex items-center gap-2 font-serif text-2xl font-bold"><BrandMark light /></Link><div className="flex items-center gap-3"><span className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold">{label(branch.publicationStatus)}</span><form action="/api/v1/auth/logout" method="post"><button className="flex items-center gap-2 text-sm font-bold"><LogOut size={16} /> Log out</button></form></div></div></header>
    <div className="mx-auto max-w-7xl p-5 lg:p-8">
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section className="rounded-3xl bg-white p-6"><p className="text-xs font-bold uppercase tracking-[.18em] text-[#1969A2]">Salon onboarding</p><h1 className="mt-2 font-serif text-4xl">Prepare {data.name} for approval.</h1><p className="mt-3 text-[#737174]">Each branch has its own profile, documents, checklist, and publication decision.</p><div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]"><select className="field" value={branch.id} onChange={(event) => setSelectedBranchId(event.target.value)}>{data.branches.map((item) => <option key={item.id} value={item.id}>{item.name} · {label(item.publicationStatus)}</option>)}</select><span className="rounded-full bg-[#E8FBFB] px-4 py-3 text-center text-xs font-bold text-[#1969A2]">{data.branches.length} branch{data.branches.length === 1 ? "" : "es"}</span></div>{notice && <p className="mt-4 rounded-xl bg-[#dff0e7] p-3 text-sm font-bold text-[#285543]">{notice}</p>}{error && <p className="mt-4 rounded-xl bg-[#f2ded8] p-3 text-sm font-bold text-[#995849]">{error}</p>}</section>
          <form onSubmit={addBranch} className="rounded-3xl bg-white p-6"><h2 className="font-serif text-2xl">Add another branch</h2><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><input className="field" name="name" placeholder="Branch name" required /><input className="field" name="city" placeholder="City" required /><button disabled={busy} className="primary justify-center"><Plus size={15} /> Add branch</button></div></form>
          <form onSubmit={saveProfile} className="rounded-3xl bg-white p-6">
            <h2 className="font-serif text-2xl">Business and branch profile</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2"><Field name="name" label="Trading name" defaultValue={data.name} /><Field name="legalName" label="Legal business name" defaultValue={data.legalName ?? ""} required={false} /><Field name="gstin" label="GSTIN" defaultValue={data.gstin ?? ""} required={false} hint="Example: 29ABCDE1234F1Z5" uppercase /><Field name="panNumber" label="PAN" defaultValue={data.panNumber ?? ""} required={false} hint="Example: ABCDE1234F" uppercase /><Field name="branchName" label="Branch name" defaultValue={branch.name} /><Field name="phone" label="Branch mobile" defaultValue={branch.phone ?? ""} required={false} hint="10 digits or +91 format" /><Field name="email" label="Branch email" type="email" defaultValue={branch.email ?? ""} required={false} /><Field name="postalCode" label="PIN code" defaultValue={branch.postalCode} required={false} inputMode="numeric" /><Field name="address" label="Address" defaultValue={branch.address} wide required={false} /><Field name="city" label="City" defaultValue={branch.city} /><Field name="state" label="State" defaultValue={branch.state} required={false} /><Field name="cancellationHours" label="Free cancellation hours" type="number" defaultValue={String(branch.policies?.cancellationHours ?? 4)} /><label className="sm:col-span-2 text-sm font-bold">Marketplace description<textarea className="field mt-2 min-h-28" name="profileDescription" defaultValue={branch.profileDescription ?? ""} /><span className="mt-1 block text-xs font-normal text-[#737174]">At least 20 characters before branch submission.</span></label></div>
            <h3 className="mt-7 font-bold">Operating hours</h3><div className="mt-3 grid gap-2">{hours.map((item) => <div key={item.dayOfWeek} className="grid grid-cols-[1fr_100px_100px_auto] items-center gap-2 rounded-xl bg-[#F7FAFC] p-3 text-sm"><strong>{dayNames[item.dayOfWeek]}</strong><input className="field !p-2" name={`open-${item.dayOfWeek}`} type="time" defaultValue={item.opensAt} /><input className="field !p-2" name={`close-${item.dayOfWeek}`} type="time" defaultValue={item.closesAt} /><label className="flex gap-1"><input name={`closed-${item.dayOfWeek}`} type="checkbox" defaultChecked={item.isClosed} /> Closed</label></div>)}</div>
            <button disabled={!editable || busy} className="primary mt-6 justify-center">{busy ? "Saving..." : "Save profile"}</button>
          </form>
          <section className="rounded-3xl bg-white p-6"><h2 className="font-serif text-2xl">Service catalogue</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{data.services.map((service) => <div key={service.id} className="rounded-2xl border border-black/8 p-4"><strong>{service.name}</strong><p className="mt-1 text-sm text-[#737174]">{service.category} · {service.durationMinutes} min · {inr.format(Number(service.price))} · GST {service.priceTaxMode === "INCLUSIVE" ? "included" : "extra"}</p></div>)}</div>{editable && <form onSubmit={addService} className="mt-5 grid gap-3 sm:grid-cols-3"><input className="field" name="name" placeholder="Service name" required /><input className="field" name="category" placeholder="Category" required /><input className="field" name="durationMinutes" type="number" placeholder="Minutes" required /><input className="field" name="price" type="number" placeholder="Customer price" required /><select className="field" name="priceTaxMode" defaultValue="EXCLUSIVE"><option value="EXCLUSIVE">GST extra</option><option value="INCLUSIVE">GST included</option></select><input className="field" name="taxRate" type="number" defaultValue="18" placeholder="GST rate" required /><button className="primary justify-center sm:col-span-3"><Plus size={15} /> Add service</button></form>}</section>
          <section className="rounded-3xl bg-white p-6"><h2 className="font-serif text-2xl">Verification documents</h2><div className="mt-4 space-y-2">{data.verificationDocuments.map((document) => <div key={document.id} className="flex items-center justify-between rounded-xl border border-black/8 p-3 text-sm"><div><strong>{label(document.type)}</strong><p className="text-[#737174]">{document.fileName}{document.reviewNote ? ` · ${document.reviewNote}` : ""}</p></div><Status value={document.status} /></div>)}</div>{editable && <form onSubmit={upload} className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><select className="field" name="type">{documentTypes.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select><input type="hidden" name="branchId" value={branch.id} /><input className="field" type="file" name="file" accept=".pdf,image/jpeg,image/png,image/webp" required /><button disabled={busy} className="primary justify-center"><FileUp size={15} /> Upload</button></form>}</section>
        </div>
        <aside className="h-fit rounded-3xl bg-white p-6 lg:sticky lg:top-6"><h2 className="font-serif text-2xl">Approval checklist</h2><div className="mt-5 space-y-4">{Object.entries(branch.checklist).map(([key, done]) => <div key={key} className="flex items-start gap-3 text-sm">{done ? <Check className="mt-0.5 shrink-0 text-[#2f6a55]" size={18} /> : <Circle className="mt-0.5 shrink-0 text-[#737174]" size={18} />}<span><span className={done ? "font-bold" : "text-[#737174]"}>{label(key)}</span>{!done && checklistDetails[key] && <span className="mt-1 block text-xs leading-5 text-[#984f43]">{checklistDetails[key]}</span>}</span></div>)}</div><button disabled={!complete || !editable} onClick={submitBranch} className="primary mt-6 w-full justify-center"><Send size={15} /> Submit branch</button>{!complete && <p className="mt-3 rounded-xl bg-[#F7FAFC] p-3 text-xs leading-5 text-[#737174]">{submissionHelp(checklistDetails)}</p>}{branch.reviewsHistory[0]?.note && <div className="mt-5 rounded-xl bg-[#F7FAFC] p-4 text-sm"><strong>Latest review note</strong><p className="mt-2 text-[#737174]">{branch.reviewsHistory[0].note}</p></div>}</aside>
      </div>
    </div>
  </main>;
}

function Field({ name, label: text, type = "text", defaultValue, wide, required = true, hint, uppercase, inputMode }: { name: string; label: string; type?: string; defaultValue: string; wide?: boolean; required?: boolean; hint?: string; uppercase?: boolean; inputMode?: "numeric" }) { return <label className={`${wide ? "sm:col-span-2" : ""} text-sm font-bold`}>{text}<input className={`field mt-2 ${uppercase ? "uppercase" : ""}`} required={required} name={name} type={type} defaultValue={defaultValue} inputMode={inputMode} />{hint && <span className="mt-1 block text-xs font-normal text-[#737174]">{hint}</span>}</label>; }
function Status({ value }: { value: string }) { return <span className={`rounded-full px-3 py-1 text-xs font-bold ${value === "APPROVED" ? "bg-[#dff0e7] text-[#285543]" : value === "REJECTED" ? "bg-[#f2ded8] text-[#995849]" : "bg-[#eee6d7] text-[#80632f]"}`}>{label(value)}</span>; }
function label(value: string) { return value.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function missing(checklist: Record<string, boolean>) { return `Missing: ${Object.entries(checklist).filter(([, done]) => !done).map(([key]) => label(key)).join(", ")}`; }
function validationMessage(error: { message?: string; details?: { fields?: Array<{ field: string; message: string }> } } | undefined) {
  const fields = error?.details?.fields;
  if (!fields?.length) return error?.message ?? "Unable to save profile";
  return fields.map((item) => `${fieldLabel(item.field)}: ${item.message}`).join(" · ");
}
function fieldLabel(path: string) {
  const field = path.split(".").at(-1) ?? path;
  return label(field === "postalCode" ? "PIN code" : field === "panNumber" ? "PAN" : field);
}
function onboardingChecklistDetails(data: Data, branch: Data["branches"][number]) {
  const activeDocuments = data.verificationDocuments.filter((document) => !document.branchId || document.branchId === branch.id);
  const documentStatus = new Map(activeDocuments.map((document) => [document.type, document.status]));
  const requiredTypes = ["GST_CERTIFICATE", "PAN_CARD", "ADDRESS_PROOF", "BANK_PROOF"];
  const missingRequired = requiredTypes.filter((type) => !documentStatus.has(type)).map(label);
  const pendingRequired = requiredTypes.filter((type) => documentStatus.get(type) === "PENDING").map(label);
  const rejectedRequired = requiredTypes.filter((type) => documentStatus.get(type) === "REJECTED").map(label);
  const mediaStatus = documentStatus.get("SALON_MEDIA");
  return {
    businessIdentity: "Add legal name, GSTIN, and PAN.",
    ownerContact: "Add both branch mobile number and email.",
    completeAddress: "Complete address, city, state, and 6-digit PIN code.",
    operatingHours: "Save operating hours for all seven days.",
    serviceCatalogue: "Add at least one active service.",
    policies: "Save the cancellation policy.",
    requiredDocuments: [
      missingRequired.length ? `Missing: ${missingRequired.join(", ")}.` : "",
      pendingRequired.length ? `Awaiting admin approval: ${pendingRequired.join(", ")}.` : "",
      rejectedRequired.length ? `Upload replacements: ${rejectedRequired.join(", ")}.` : "",
    ].filter(Boolean).join(" "),
    salonMedia: !mediaStatus ? "Upload at least one clear salon photo." : mediaStatus === "PENDING" ? "Salon photo is awaiting admin approval." : "Upload a replacement salon photo.",
  } as Record<string, string>;
}
function submissionHelp(details: Record<string, string>) {
  const blockers = Object.values(details).filter(Boolean);
  return blockers.length ? `Complete the items above. ${blockers.at(-1)}` : "Complete all onboarding requirements before submission.";
}
