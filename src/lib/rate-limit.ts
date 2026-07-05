// Einfacher In-Memory-Rate-Limiter (Fixed Window).
// P0-Lösung: schützt pro Server-Instanz. Bekannte Grenze: bei mehreren
// Serverless-Instanzen gilt das Limit je Instanz -> P1-Upgrade auf
// @upstash/ratelimit (Redis) ohne API-Änderung möglich.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number) {
  // gelegentlich abgelaufene Buckets entfernen (Memory-Hygiene)
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Prüft und zählt einen Treffer für `key`.
 * @param key      eindeutiger Schlüssel, z. B. "login:ip:1.2.3.4"
 * @param limit    erlaubte Treffer pro Fenster
 * @param windowMs Fensterlänge in ms
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (bucket.count >= limit) {
    return { ok: false, remaining: 0, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { ok: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
}

/** IP aus Standard-Proxy-Headern (Vercel setzt x-forwarded-for). */
export function ipFromHeaders(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "unknown";
}
