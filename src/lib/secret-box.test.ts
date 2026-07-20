import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { describeDatabaseUrl, open, seal } from "./secret-box";

const URL_SAMPLE = "postgresql://postgres:hunter2@db.abc.supabase.co:5432/postgres?sslmode=require";

describe("secret-box", () => {
  beforeEach(() => { process.env.ENVIRONMENT_SECRET_KEY = "test-key-with-enough-length"; });
  afterEach(() => { delete process.env.ENVIRONMENT_SECRET_KEY; });

  it("round-trips", () => {
    expect(open(seal(URL_SAMPLE))).toBe(URL_SAMPLE);
  });

  it("never stores the plain text", () => {
    const sealed = seal(URL_SAMPLE);
    expect(sealed).not.toContain("hunter2");
    expect(sealed).not.toContain("supabase");
  });

  /** Same input, different ciphertext - a fresh IV every time, so equal secrets aren't linkable. */
  it("seals the same value differently each time", () => {
    expect(seal(URL_SAMPLE)).not.toBe(seal(URL_SAMPLE));
  });

  /** GCM authenticates: tampering fails loudly rather than yielding a corrupt connection string. */
  it("refuses a tampered payload", () => {
    const parts = seal(URL_SAMPLE).split(".");
    const corrupted = Buffer.from(parts[3], "base64");
    corrupted[0] ^= 0xff;
    parts[3] = corrupted.toString("base64");
    expect(() => open(parts.join("."))).toThrow();
  });

  it("refuses to open with the wrong key", () => {
    const sealed = seal(URL_SAMPLE);
    process.env.ENVIRONMENT_SECRET_KEY = "a-completely-different-key!!";
    expect(() => open(sealed)).toThrow();
  });

  it("refuses a value that was never sealed", () => {
    expect(() => open("postgresql://plain@host/db")).toThrow("Not a sealed value");
  });

  it("demands a real key", () => {
    process.env.ENVIRONMENT_SECRET_KEY = "short";
    expect(() => seal(URL_SAMPLE)).toThrow("ENVIRONMENT_SECRET_KEY");
    delete process.env.ENVIRONMENT_SECRET_KEY;
    expect(() => seal(URL_SAMPLE)).toThrow("ENVIRONMENT_SECRET_KEY");
  });
});

describe("describeDatabaseUrl", () => {
  it("shows the host, never the password", () => {
    expect(describeDatabaseUrl(URL_SAMPLE)).toBe("db.abc.supabase.co:5432");
  });

  it("copes with rubbish", () => {
    expect(describeDatabaseUrl("not a url")).toBe("unreadable connection string");
  });
});
