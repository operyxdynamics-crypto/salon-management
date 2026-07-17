/**
 * Browser-safe unique id for idempotency keys.
 *
 * `crypto.randomUUID()` only exists in a secure context - HTTPS or localhost. On a
 * plain-HTTP origin (a phone hitting the dev server over the LAN, or any non-TLS
 * deployment) it is undefined, and every call site that built an idempotency key
 * with it threw `crypto.randomUUID is not a function`, breaking checkout, refunds,
 * rescheduling, and stock movements.
 *
 * `crypto.getRandomValues()` has no secure-context requirement, so it is the right
 * primitive here. The Math.random path is a last resort for ancient browsers; it is
 * weaker but these ids only need collision resistance, not unpredictability.
 */
export function newId() {
  const webCrypto = typeof globalThis === "undefined" ? undefined : globalThis.crypto;

  if (typeof webCrypto?.randomUUID === "function") {
    return webCrypto.randomUUID();
  }

  if (typeof webCrypto?.getRandomValues === "function") {
    const bytes = webCrypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  const random = () => Math.random().toString(16).slice(2, 10);
  return `${random()}-${random()}-${Date.now().toString(16)}`;
}
