import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Sealed storage for customer database credentials.
 *
 * A dedicated-environment record holds the connection string to somebody else's production
 * database. In plain text that is a catastrophe waiting for any read of the table - a backup, a
 * log line, a curious query. So it is sealed with AES-256-GCM before it touches the database and
 * opened only at the moment of use (a connection test), never on the way to a browser.
 *
 * GCM rather than CBC because it authenticates: a tampered ciphertext fails loudly instead of
 * decrypting to garbage that then gets used as a connection string.
 *
 * The key comes from ENVIRONMENT_SECRET_KEY. Any string works - it is hashed to 32 bytes - but it
 * must be the same everywhere the app runs, and losing it means re-entering every credential.
 * That trade is accepted deliberately: a key you can rotate by re-entering data beats a key so
 * precious nobody dares change it.
 */

const VERSION = "v1";

function key(): Buffer {
  const secret = process.env.ENVIRONMENT_SECRET_KEY;
  if (!secret || secret.length < 16) {
    throw new Error("ENVIRONMENT_SECRET_KEY is not configured (needs at least 16 characters)");
  }
  return createHash("sha256").update(secret).digest();
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(".");
}

export function open(sealed: string): string {
  const [version, iv, tag, payload] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || !payload) throw new Error("Not a sealed value");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(payload, "base64")), decipher.final()]).toString("utf8");
}

/**
 * What the browser is allowed to see: enough to recognise the credential, never enough to use it.
 * "postgresql://postgres:...@db.abc.supabase.co:5432/postgres" → "db.abc.supabase.co:5432"
 */
export function describeDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`;
  } catch {
    return "unreadable connection string";
  }
}
