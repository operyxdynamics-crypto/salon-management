import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSessionToken, sessionCookie } from "@/lib/session";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8),
});

const IP_LIMIT = 20;          // 20 attempts per IP
const EMAIL_LIMIT = 5;        // 5 attempts per email
const WINDOW_MS = 15 * 60_000; // sliding 15-minute window

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Invalid email or password format" }, { status: 400 });
    const ipCheck = rateLimit(clientKey(request, "auth-staff-ip"), IP_LIMIT, WINDOW_MS);
    const emailCheck = rateLimit(`auth-staff-email:${parsed.data.email}`, EMAIL_LIMIT, WINDOW_MS);
    const blocked = !ipCheck.allowed ? ipCheck : !emailCheck.allowed ? emailCheck : null;
    if (blocked) {
      return Response.json(
        { error: "Too many sign-in attempts. Please wait before trying again." },
        { status: 429, headers: { "retry-after": String(blocked.retryAfterSeconds) } },
      );
    }
    const user = await db.user.findUnique({ where: { email: parsed.data.email }, include: { tenant: true } });
    if (!user?.passwordHash || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      return Response.json({ error: "Invalid credentials" }, { status: 401 });
    }
    if (!user.isActive || (user.tenant && ["SUSPENDED", "ARCHIVED"].includes(user.tenant.status))) {
      return Response.json({ error: "This workspace is not active" }, { status: 403 });
    }
    if (user.tenant && user.tenant.status !== "ACTIVE" && user.role !== "OWNER") {
      return Response.json({ error: "This workspace is awaiting approval" }, { status: 403 });
    }
    const token = await createSessionToken({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      name: user.name,
    });
    const response = NextResponse.json({
      data: {
        role: user.role,
        redirectTo: user.role === "PLATFORM_ADMIN"
          ? "/admin"
          : user.role === "OWNER" && user.tenant?.status !== "ACTIVE"
            ? "/onboarding"
            : "/workspace/home",
      },
    });
    response.cookies.set(sessionCookie.name, token, sessionCookie.options);
    return response;
  } catch (error) {
    console.error("Staff login failed", error);
    return Response.json({
      error: "Login service is temporarily unavailable",
      details: process.env.NODE_ENV === "production" ? undefined : error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
