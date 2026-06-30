// Lightweight in-memory OTP store for the customer SMS flow.
// Process-local — sufficient for a single-instance dev setup. When you wire a
// real SMS provider (and run multiple instances) replace this with a DB-backed
// or Redis-backed store. The verify endpoint is gated to non-production today,
// so this only ships as a development convenience.

import { createHash, randomInt, timingSafeEqual } from "node:crypto";

type Entry = {
  hash: string;
  expiresAt: number;
  attempts: number;
};

const store = new Map<string, Entry>();

const TTL_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;

function hash(phone: string, code: string) {
  return createHash("sha256").update(`${phone}|${code}`).digest("hex");
}

export function issueOtp(phone: string): { code: string; expiresInSeconds: number } {
  const code = String(randomInt(100000, 1_000_000));
  store.set(phone, { hash: hash(phone, code), expiresAt: Date.now() + TTL_MS, attempts: 0 });
  return { code, expiresInSeconds: Math.floor(TTL_MS / 1000) };
}

export function verifyOtp(phone: string, code: string): boolean {
  const entry = store.get(phone);
  if (!entry || entry.expiresAt < Date.now()) {
    store.delete(phone);
    return false;
  }
  if (entry.attempts >= MAX_ATTEMPTS) {
    store.delete(phone);
    return false;
  }
  entry.attempts += 1;
  const expected = Buffer.from(entry.hash);
  const actual = Buffer.from(hash(phone, code));
  const matches = expected.length === actual.length && timingSafeEqual(expected, actual);
  if (matches) store.delete(phone);
  return matches;
}
