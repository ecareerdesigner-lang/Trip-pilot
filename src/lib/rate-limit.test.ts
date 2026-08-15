import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryRateLimiter } from "@/lib/rate-limit";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("MemoryRateLimiter", () => {
  it("allows requests up to the limit within a window", async () => {
    const limiter = new MemoryRateLimiter(3, 60_000);

    for (let i = 0; i < 3; i += 1) {
      const result = await limiter.check("user-1");
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks the request that would exceed the limit", async () => {
    const limiter = new MemoryRateLimiter(3, 60_000);

    await limiter.check("user-1");
    await limiter.check("user-1");
    await limiter.check("user-1");
    const fourth = await limiter.check("user-1");

    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
  });

  it("reports remaining count accurately as it counts down", async () => {
    const limiter = new MemoryRateLimiter(5, 60_000);

    const first = await limiter.check("user-1");
    expect(first.remaining).toBe(4);

    const second = await limiter.check("user-1");
    expect(second.remaining).toBe(3);
  });

  it("tracks separate keys independently", async () => {
    const limiter = new MemoryRateLimiter(1, 60_000);

    const userA = await limiter.check("user-a");
    const userB = await limiter.check("user-b");

    expect(userA.allowed).toBe(true);
    expect(userB.allowed).toBe(true);
  });

  it("resets the count once the window has passed", async () => {
    const limiter = new MemoryRateLimiter(1, 60_000);

    await limiter.check("user-1");
    const blocked = await limiter.check("user-1");
    expect(blocked.allowed).toBe(false);

    vi.setSystemTime(new Date("2026-01-01T00:01:00.001Z"));

    const afterWindow = await limiter.check("user-1");
    expect(afterWindow.allowed).toBe(true);
  });

  it("reports zero retryAfterSeconds when allowed", async () => {
    const limiter = new MemoryRateLimiter(2, 60_000);
    const result = await limiter.check("user-1");
    expect(result.retryAfterSeconds).toBe(0);
  });

  it("reports a positive, rounded-up retryAfterSeconds when blocked", async () => {
    const limiter = new MemoryRateLimiter(1, 60_000);
    await limiter.check("user-1");

    // 45 seconds into a 60-second window: 15 seconds remain, which should
    // round up to 15, not truncate to 14.
    vi.setSystemTime(new Date("2026-01-01T00:00:45.000Z"));
    const blocked = await limiter.check("user-1");

    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(15);
  });

  it("accepts a cost greater than one and charges it against the limit", async () => {
    const limiter = new MemoryRateLimiter(10, 60_000);

    const result = await limiter.check("user-1", 7);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(3);

    const second = await limiter.check("user-1", 4);
    expect(second.allowed).toBe(false);
  });

  it("allows a request whose cost exactly fills the remaining budget", async () => {
    const limiter = new MemoryRateLimiter(10, 60_000);

    await limiter.check("user-1", 7);
    const exact = await limiter.check("user-1", 3);

    expect(exact.allowed).toBe(true);
    expect(exact.remaining).toBe(0);
  });

  it("reset() clears a key so its next check starts a fresh window", async () => {
    const limiter = new MemoryRateLimiter(1, 60_000);

    await limiter.check("user-1");
    const blocked = await limiter.check("user-1");
    expect(blocked.allowed).toBe(false);

    await limiter.reset("user-1");

    const afterReset = await limiter.check("user-1");
    expect(afterReset.allowed).toBe(true);
  });

  it("reports the same limit value regardless of allowed/blocked outcome", async () => {
    const limiter = new MemoryRateLimiter(2, 60_000);

    const first = await limiter.check("user-1");
    await limiter.check("user-1");
    const blocked = await limiter.check("user-1");

    expect(first.limit).toBe(2);
    expect(blocked.limit).toBe(2);
  });
});
