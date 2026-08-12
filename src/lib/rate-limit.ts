import { env } from "@/lib/env";

/**
 * Rate limiting abstraction.
 *
 * The in-memory implementation below is correct for a single process and is
 * the right default for personal use. It is NOT correct across serverless
 * instances — swap in a Redis/Upstash implementation of `RateLimiter` before
 * this runs multi-tenant. Call sites never need to change.
 */

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Unix ms when the current window resets. */
  resetAt: number;
  /** Seconds the caller should wait. Zero when allowed. */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string, cost?: number): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
}

interface Window {
  count: number;
  resetAt: number;
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  async check(key: string, cost = 1): Promise<RateLimitResult> {
    const now = Date.now();
    const existing = this.windows.get(key);

    if (!existing || existing.resetAt <= now) {
      const window: Window = { count: cost, resetAt: now + this.windowMs };
      this.windows.set(key, window);
      this.sweep(now);
      return {
        allowed: true,
        limit: this.limit,
        remaining: Math.max(0, this.limit - cost),
        resetAt: window.resetAt,
        retryAfterSeconds: 0,
      };
    }

    if (existing.count + cost > this.limit) {
      return {
        allowed: false,
        limit: this.limit,
        remaining: 0,
        resetAt: existing.resetAt,
        retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
      };
    }

    existing.count += cost;
    return {
      allowed: true,
      limit: this.limit,
      remaining: Math.max(0, this.limit - existing.count),
      resetAt: existing.resetAt,
      retryAfterSeconds: 0,
    };
  }

  async reset(key: string): Promise<void> {
    this.windows.delete(key);
  }

  /** Drop expired windows so the map cannot grow without bound. */
  private sweep(now: number): void {
    if (this.windows.size < 1000) return;
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }
}

const globalForLimiter = globalThis as unknown as {
  aiRateLimiter: RateLimiter | undefined;
};

/**
 * Limiter for routes that cost real money or real CPU.
 *
 * Generation and chat call an external model. Optimization does not, but it
 * runs a routing calculation for every pair of stops on every day — cheap
 * once, a way to pin a core when pressed in a loop.
 */
export function aiRateLimiter(): RateLimiter {
  if (!globalForLimiter.aiRateLimiter) {
    const config = env();
    globalForLimiter.aiRateLimiter = new MemoryRateLimiter(
      config.RATE_LIMIT_MAX,
      config.RATE_LIMIT_WINDOW_SECONDS * 1000,
    );
  }
  return globalForLimiter.aiRateLimiter;
}
