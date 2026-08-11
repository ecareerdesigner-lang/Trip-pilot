import { describe, it, expect } from "vitest";
import { createRng, hashString } from "@/lib/providers/mock/rng";

describe("hashString", () => {
  it("is stable for the same input", () => {
    expect(hashString("new york city")).toBe(hashString("new york city"));
  });

  it("separates similar inputs", () => {
    expect(hashString("hotels:nyc")).not.toBe(hashString("hotels:nyd"));
  });
});

describe("createRng", () => {
  it("produces the same sequence for the same seed", () => {
    const a = createRng("trip-seed");
    const b = createRng("trip-seed");
    const first = Array.from({ length: 20 }, () => a.next());
    const second = Array.from({ length: 20 }, () => b.next());
    expect(first).toEqual(second);
  });

  it("produces different sequences for different seeds", () => {
    const a = createRng("seed-a").next();
    const b = createRng("seed-b").next();
    expect(a).not.toBe(b);
  });

  it("stays inside [0, 1)", () => {
    const rng = createRng("range");
    for (let i = 0; i < 2_000; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("respects integer bounds inclusively", () => {
    const rng = createRng("ints");
    const seen = new Set<number>();
    for (let i = 0; i < 2_000; i += 1) {
      const value = rng.int(1, 5);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(5);
      seen.add(value);
    }
    // All five values should appear; a generator that never returns the
    // upper bound is the classic off-by-one here.
    expect(seen.size).toBe(5);
  });

  it("handles a single-value integer range", () => {
    expect(createRng("one").int(3, 3)).toBe(3);
  });

  it("shuffles without mutating or losing items", () => {
    const source = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = createRng("shuffle").shuffle(source);
    expect(source).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(source);
  });

  it("shuffles the same way for the same seed", () => {
    const source = ["a", "b", "c", "d", "e"];
    expect(createRng("s").shuffle(source)).toEqual(createRng("s").shuffle(source));
  });

  it("throws rather than returning undefined from an empty list", () => {
    expect(() => createRng("empty").pick([])).toThrow();
  });

  it("produces roughly the requested probability", () => {
    const rng = createRng("bools");
    let count = 0;
    for (let i = 0; i < 5_000; i += 1) if (rng.bool(0.3)) count += 1;
    expect(count / 5_000).toBeGreaterThan(0.26);
    expect(count / 5_000).toBeLessThan(0.34);
  });
});
