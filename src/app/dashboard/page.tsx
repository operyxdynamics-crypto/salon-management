import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardRedirectPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(`/workspace/home${await querySuffix(searchParams)}`);
}

async function querySuffix(searchParams: Promise<Record<string, string | string[] | undefined>>) {
  const query = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}
