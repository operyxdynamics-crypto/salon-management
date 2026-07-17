import type { WorkspaceData } from "@/lib/operations-types";

type ApiErrorPayload = {
  error?: string | {
    message?: string;
    code?: string;
    details?: unknown;
  };
};

export class WorkspaceClientError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "WorkspaceClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json() as ApiErrorPayload & { data?: T };
  if (!response.ok) {
    const nestedError = typeof payload.error === "object" ? payload.error : undefined;
    const message = nestedError?.message || (typeof payload.error === "string" ? payload.error : "Unable to complete request");
    // Surface the server's real error (in dev this includes the stack) in the browser console, so a
    // 500 is diagnosable from the page instead of needing the terminal. Stringified, because the
    // Next.js error overlay renders a bare object as "{}" and hides exactly what we need.
    let printable: string;
    try {
      printable = JSON.stringify(payload.error, null, 2);
    } catch {
      printable = String(payload.error);
    }
    console.error(`[API ${response.status}] ${message}\n${printable}`);
    throw new WorkspaceClientError(message, response.status, nestedError?.code, nestedError?.details);
  }
  return payload.data as T;
}

export async function queryWorkspace<T>(path: string, options: { signal?: AbortSignal } = {}) {
  const response = await fetch(path, { cache: "no-store", signal: options.signal });
  return readResponse<T>(response);
}

export function createBranchScopeParams(branchIds: string[], scopeMode: "all" | "selection") {
  const params = new URLSearchParams();
  if (scopeMode === "all") params.set("branchId", "all");
  else if (branchIds.length === 1) params.set("branchId", branchIds[0]);
  else if (branchIds.length > 1) params.set("branchIds", branchIds.join(","));
  else params.set("branchId", "all");
  return params;
}

export async function getWorkspaceBootstrap(branchIds: string[], scopeMode: "all" | "selection") {
  const response = await fetch(`/api/v1/operations/bootstrap?${createBranchScopeParams(branchIds, scopeMode)}`, { cache: "no-store" });
  return readResponse<WorkspaceData>(response);
}

export async function mutateWorkspace<T>(path: string, method: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return readResponse<T>(response);
}
