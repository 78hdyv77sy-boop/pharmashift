import { describe, it, expect, vi, afterEach } from "vitest";
import { rateLimit, ipFromHeaders } from "@/lib/rate-limit";

afterEach(() => vi.useRealTimers());

describe("Rate-Limit (P0 / 3.13)", () => {
  it("erlaubt bis zum Limit, blockt danach mit Retry-After", () => {
    const key = `t-${Math.random()}`;
    expect(rateLimit(key, 2, 60_000).ok).toBe(true);
    expect(rateLimit(key, 2, 60_000).ok).toBe(true);
    const blocked = rateLimit(key, 2, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });
  it("Fenster läuft ab", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-11T10:00:00Z"));
    const key = `t-${Math.random()}`;
    rateLimit(key, 1, 1000);
    expect(rateLimit(key, 1, 1000).ok).toBe(false);
    vi.setSystemTime(new Date("2026-06-11T10:00:02Z"));
    expect(rateLimit(key, 1, 1000).ok).toBe(true);
  });
  it("ipFromHeaders nimmt erste x-forwarded-for-IP", () => {
    const h = new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" });
    expect(ipFromHeaders(h)).toBe("1.2.3.4");
  });
});
