import { describe, it, expect } from "vitest";
import {
  allocateCents,
  divideCents,
  formatMoney,
  fromCents,
  sumCents,
  toCents,
} from "@/lib/money";

describe("money", () => {
  it("converts dollars to cents without float drift", () => {
    expect(toCents(0.1) + toCents(0.2)).toBe(toCents(0.3));
    expect(toCents(19.99)).toBe(1999);
    expect(fromCents(1999)).toBe(19.99);
  });

  it("sums nullable amounts", () => {
    expect(sumCents([100, null, 250, undefined])).toBe(350);
    expect(sumCents([])).toBe(0);
  });

  it("splits without losing or inventing cents", () => {
    const parts = divideCents(1000, 3);
    expect(parts).toEqual([334, 333, 333]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it("allocates by weight and preserves the exact total", () => {
    const total = 300_000;
    const allocation = allocateCents(total, [30, 30, 18, 12, 6, 4]);
    expect(allocation.reduce((a, b) => a + b, 0)).toBe(total);
    expect(allocation[0]).toBe(90_000);
  });

  it("returns zeros when every weight is zero", () => {
    expect(allocateCents(5000, [0, 0, 0])).toEqual([0, 0, 0]);
  });

  it("formats whole amounts without trailing zeros", () => {
    expect(formatMoney(300_000)).toBe("$3,000");
    expect(formatMoney(271_450)).toBe("$2,714.50");
    expect(formatMoney(null)).toBe("$0");
  });
});
