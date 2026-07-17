import { cookies } from "next/headers";
import { z } from "zod";
import { createSessionToken, sessionCookie } from "@/lib/session";
import { db } from "@/lib/db";
import { verifyOtp } from "@/lib/otp-store";

const schema = z.object({
  phone: z.string().regex(/^\+91[6-9]\d{9}$/),
  code: z.string().length(6),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Invalid verification" }, { status: 400 });
  if (process.env.NODE_ENV === "production") {
    // Real SMS provider integration required before customer sign-in is enabled in production.
    return Response.json({ error: "Customer sign-in is not yet available" }, { status: 503 });
  }

  // In dev, accept either the static demo code (printed in the login UI) or the
  // randomly issued code that /auth/otp/request stored.
  const isStaticDemoCode = parsed.data.code === "123456";
  if (!isStaticDemoCode && !verifyOtp(parsed.data.phone, parsed.data.code)) {
    return Response.json({ error: "Invalid verification" }, { status: 401 });
  }

  const user = await db.user.upsert({
    where: { phone: parsed.data.phone },
    update: { isActive: true },
    create: { phone: parsed.data.phone, name: "Operyx customer", role: "CUSTOMER" },
  });
  if (user.role !== "CUSTOMER" || !user.isActive) return Response.json({ error: "This phone number cannot use customer sign-in" }, { status: 403 });
  const token = await createSessionToken({ userId: user.id, tenantId: null, role: "CUSTOMER", name: user.name });
  (await cookies()).set(sessionCookie.name, token, sessionCookie.options);
  return Response.json({ data: { role: "CUSTOMER", redirectTo: "/account" } });
}
