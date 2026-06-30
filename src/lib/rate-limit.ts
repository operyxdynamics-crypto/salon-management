// Lightweight in-memory sliding-window rate limiter.
// Intentionally process-local: good enough for single-instance deployments and
// for blunting the most obvious credential-stuffing attempts. Swap for a
// Redis-backed limiter once the app is horizontally scaled.

type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((stamp) => stamp > cutoff);
  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0];
    buckets.set(key, bucket);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  return {
    allowed: true,
    remaining: limit - bucket.hits.length,
    retryAfterSeconds: 0,
  };
}

export function clientKey(request: Request, extra?: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = request.headers.get("x-real-ip");
  const ip = forwarded ?? real ?? "unknown";
  return extra ? `${ip}:${extra}` : ip;
}
