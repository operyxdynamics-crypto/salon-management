"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Database, PlugZap } from "lucide-react";
import { useToast } from "./toast";

/**
 * The customer's own database, as the client page sees it.
 *
 * The connection string is write-only: it can be set and replaced, never read back. What the page
 * shows afterwards is the host name and the state of the last connection test - which is all
 * support ever needs, and infinitely less than what a leaked page could give away.
 */

export type EnvironmentView = {
  appUrl: string | null;
  hostedBy: string | null;
  notes: string | null;
  databaseHost: string;
  lastCheckedAt: string | null;
  lastCheckOk: boolean | null;
  lastMigration: string | null;
} | null;

const when = (value: string) => new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(value));

export function EnvironmentCard({ tenantId, environment, planRequiresIt, currentMigration }: {
  tenantId: string;
  environment: EnvironmentView;
  planRequiresIt: boolean;
  /** The newest migration in this codebase, so drift is a comparison rather than a guess. */
  currentMigration: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(!environment);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [testMessage, setTestMessage] = useState("");

  if (!environment && !planRequiresIt) return null;

  const behind = Boolean(environment?.lastMigration && currentMigration && environment.lastMigration !== currentMigration);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const databaseUrl = String(form.get("databaseUrl") || "").trim();

    setBusy(true); setError("");
    const response = await fetch(`/api/v1/admin/tenants/${tenantId}/environment`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        // Left blank on edit means "keep the credential you have" - replacing it must be deliberate.
        ...(databaseUrl ? { databaseUrl } : {}),
        appUrl: String(form.get("appUrl") || ""),
        hostedBy: String(form.get("hostedBy") || "") || undefined,
        notes: String(form.get("notes") || "") || undefined,
      }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(result.error?.message ?? "Unable to save environment");
    setEditing(false);
    toast("Environment saved.");
    router.refresh();
  }

  async function test() {
    setBusy(true); setError(""); setTestMessage("");
    const response = await fetch(`/api/v1/admin/tenants/${tenantId}/environment`, { method: "PATCH" });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    setTestMessage(result.data?.message ?? result.error?.message ?? "No response");
    router.refresh();
  }

  return <section className="rounded-2xl border border-[#EFEAF3] bg-white p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 font-serif text-2xl"><Database size={19} className="text-[#5B2A86]" /> Their own database</h2>
      {environment && (
        <button onClick={() => setEditing(!editing)} className="rounded-full border border-[#E3D9EE] px-4 py-2 text-sm font-bold text-[#5B2A86] transition hover:bg-[#F3E8FF]">
          {editing ? "Cancel" : "Edit"}
        </button>
      )}
    </div>
    <p className="mt-1 text-sm text-[#737174]">
      This salon runs on its own deployment against its own database. Operyx never touches it except
      the connection test below.
    </p>

    {planRequiresIt && !environment && (
      <p className="mt-4 rounded-xl border border-[#F3E4C0] bg-[#FFFBF0] p-3 text-sm font-semibold text-[#865C12]">
        Their plan includes a dedicated database, but none is recorded yet. Follow
        {" "}<code className="rounded bg-white px-1">docs/DEDICATED-ENVIRONMENTS.md</code>{" "}
        to set one up, then record it here.
      </p>
    )}

    {environment && !editing && (
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-[#F7F6F9] p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#9CA3AF]">Database</p>
          <p className="mt-1 font-mono text-sm">{environment.databaseHost}</p>
          <p className="mt-1 text-xs text-[#9CA3AF]">{environment.hostedBy ?? "Host not recorded"}</p>
          {environment.appUrl && <a href={environment.appUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-bold text-[#5B2A86] underline underline-offset-2">{environment.appUrl}</a>}
        </div>
        <div className="rounded-xl bg-[#F7F6F9] p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#9CA3AF]">Last check</p>
          {environment.lastCheckedAt ? (
            <>
              <p className={`mt-1 text-sm font-bold ${environment.lastCheckOk ? "text-[#0B6B4F]" : "text-[#94302E]"}`}>
                {environment.lastCheckOk ? "Reachable" : "Unreachable"} · {when(environment.lastCheckedAt)}
              </p>
              {/* Drift is the thing that actually bites: a bug report from a version you fixed. */}
              {environment.lastMigration && (
                <p className={`mt-1 text-xs ${behind ? "font-bold text-[#865C12]" : "text-[#6B7280]"}`}>
                  {behind ? "Behind: " : "Up to date: "}{environment.lastMigration}
                </p>
              )}
            </>
          ) : <p className="mt-1 text-sm text-[#9CA3AF]">Never tested</p>}
          <button disabled={busy} onClick={() => void test()} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#E3D9EE] px-3 py-1.5 text-xs font-bold text-[#5B2A86] transition hover:bg-[#F3E8FF]">
            <PlugZap size={13} /> {busy ? "Testing…" : "Test connection"}
          </button>
          {testMessage && <p className="mt-2 text-xs text-[#6B7280]">{testMessage}</p>}
        </div>
        {environment.notes && <p className="text-xs text-[#6B7280] sm:col-span-2">{environment.notes}</p>}
      </div>
    )}

    {editing && (
      <form onSubmit={save} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-bold sm:col-span-2">Connection string
          <input
            name="databaseUrl"
            type="password"
            autoComplete="off"
            placeholder={environment ? "Leave blank to keep the current one" : "postgresql://user:password@host:5432/postgres"}
            required={!environment}
            className="field mt-2 font-mono"
          />
          {/* Write-only by design: once saved it can be replaced but never viewed. */}
          <span className="mt-1 block text-xs font-normal text-[#9CA3AF]">Stored encrypted. It can be replaced later but never viewed again.</span>
        </label>
        <label className="text-sm font-bold">Their app URL<input name="appUrl" type="url" defaultValue={environment?.appUrl ?? ""} placeholder="https://salon.example.com" className="field mt-2" /></label>
        <label className="text-sm font-bold">Database hosted by<input name="hostedBy" defaultValue={environment?.hostedBy ?? ""} placeholder="Supabase, their account" className="field mt-2" /></label>
        <label className="text-sm font-bold sm:col-span-2">Notes<input name="notes" defaultValue={environment?.notes ?? ""} placeholder="Who their technical contact is, backup arrangement, anything support will need at 9pm" className="field mt-2" /></label>
        {error && <p className="rounded-xl bg-[#FDECEC] p-3 text-sm font-bold text-[#94302E] sm:col-span-2">{error}</p>}
        <div><button disabled={busy} className="primary">Save environment</button></div>
      </form>
    )}
  </section>;
}
