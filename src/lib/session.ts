import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import type { Role } from "./rbac";

export type SessionPayload = {
  userId: string;
  tenantId: string | null;
  role: Role;
  name: string;
};

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET must be set in production");
    }
    return new TextEncoder().encode("development-only-secret-change-before-deploying");
  }
  return new TextEncoder().encode(value);
}

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .setSubject(payload.userId)
    .sign(secret());
}

export async function readSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(sessionCookie.name)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      userId: String(payload.userId),
      tenantId: payload.tenantId ? String(payload.tenantId) : null,
      role: payload.role as Role,
      name: String(payload.name),
    };
  } catch {
    return null;
  }
}

export const sessionCookie = {
  name: "ruvyra_session",
  options: {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  },
};
