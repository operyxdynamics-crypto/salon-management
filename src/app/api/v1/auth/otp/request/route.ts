import { z } from "zod";
import { issueOtp } from "@/lib/otp-store";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const schema = z.object({ phone: z.string().regex(/^\+91[6-9]\d{9}$/) });

const PHONE_LIMIT = 3;          // 3 OTP requests per phone
const IP_LIMIT = 10;            // 10 OTP requests per IP
const WINDOW_MS = 10 * 60_000;  // 10-minute window

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Invalid India mobile number" }, { status: 400 });

  if (process.env.NODE_ENV === "production") {
    // Real SMS provider integration required before customer sign-in works in production.
    return Response.json({ error: "Customer sign-in is not yet available" }, { status: 503 });
  }

  const ipCheck = rateLimit(clientKey(request, "otp-ip"), IP_LIMIT, WINDOW_MS);
  const phoneCheck = rateLimit(`otp-phone:${parsed.data.phone}`, PHONE_LIMIT, WINDOW_MS);
  const blocked = !ipCheck.allowed ? ipCheck : !phoneCheck.allowed ? phoneCheck : null;
  if (blocked) {
    return Response.json(
      { error: "Too many code requests. Please wait before trying again." },
      { status: 429, headers: { "retry-after": String(blocked.retryAfterSeconds) } },
    );
  }

  const { code, expiresInSeconds } = issueOtp(parsed.data.phone);
  // In development, surface the code via the server console so the dev flow works
  // without a provider configured. The dev login UI also accepts the static "123456" fallback.
  console.log(`[dev] OTP for ${parsed.data.phone}: ${code} (expires in ${expiresInSeconds}s)`);
  return Response.json({ data: { status: "QUEUED", expiresInSeconds } }, { status: 202 });
}
