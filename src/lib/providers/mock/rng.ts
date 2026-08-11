/**
 * Deterministic pseudo-randomness for mock providers.
 *
 * Mock data must be varied enough to be realistic and identical on every
 * run. `Math.random()` fails the second requirement, which would make every
 * test flaky and every re-plan produce a different trip for the same input.
 *
 * Seeded from a string, so the same city and query always yield the same
 * hotels in the same order.
 */

/** FNV-1a. Small, fast, good enough spread for picking list items. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number;
  /** Float in [min, max). */
  float(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  /** A new array, shuffled. Does not mutate the input. */
  shuffle<T>(items: readonly T[]): T[];
  bool(probability?: number): boolean;
}

/** mulberry32 — compact, well-distributed, fully determined by its seed. */
export function createRng(seed: string | number): Rng {
  let state = (typeof seed === "string" ? hashString(seed) : seed) >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };

  const float = (min: number, max: number): number => min + next() * (max - min);

  const int = (min: number, max: number): number =>
    Math.floor(float(min, max + 1));

  return {
    next,
    float,
    int,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new Error("Cannot pick from an empty list.");
      }
      return items[int(0, items.length - 1)] as T;
    },
    shuffle<T>(items: readonly T[]): T[] {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = int(0, i);
        [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
      }
      return copy;
    },
    bool(probability = 0.5): boolean {
      return next() < probability;
    },
  };
}
