import { db } from "@/lib/db";

export async function GET() {
  let database = "unavailable";
  try {
    await db.$queryRaw`SELECT 1`;
    database = "connected";
  } catch {
    database = "unavailable";
  }
  return Response.json({
    status: "ok",
    service: "ruvyra-web",
    database,
    timestamp: new Date().toISOString(),
  });
}
