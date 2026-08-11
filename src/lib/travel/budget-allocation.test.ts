import { describe, it, expect } from "vitest";
import {
  allocateBudget,
  dailyPerTravelerCents,
  summarizeBudget,
} from "@/lib/travel/budget-allocation";
import { BUDGET_CATEGORIES } from "@/types/domain";

function total(amounts: Record<string, number>): number {
  return Object.values(amounts).reduce((sum, value) => sum + value, 0);
}

describe("allocateBudget", () => {
  it("splits a whole budget across every category", () => {
    const result = allocateBudget(300_000);
    expect(total(result.amounts)).toBe(300_000);
    expect(result.fixed).toEqual([]);
    expect(result.derived).toHaveLength(BUDGET_CATEGORIES.length);
  });

  it("never loses or invents a cent on an awkward total", () => {
    for (const amount of [1, 7, 99, 100_001, 333_333, 999_999]) {
      expect(total(allocateBudget(amount).amounts)).toBe(amount);
    }
  });

  it("leaves explicit amounts exactly as given", () => {
    const result = allocateBudget(300_000, { LODGING: 120_000 });
    expect(result.amounts.LODGING).toBe(120_000);
    expect(result.fixed).toEqual(["LODGING"]);
    expect(total(result.amounts)).toBe(300_000);
  });

  it("shares only what is left among the remaining categories", () => {
    const result = allocateBudget(200_000, {
      LODGING: 80_000,
      TRANSPORTATION: 60_000,
    });
    expect(result.remainingCents).toBe(60_000);
    const derivedTotal = result.derived.reduce(
      (sum, category) => sum + result.amounts[category],
      0,
    );
    expect(derivedTotal).toBe(60_000);
  });

  it("reports over-allocation instead of quietly shrinking amounts", () => {
    const result = allocateBudget(100_000, {
      LODGING: 80_000,
      FOOD: 50_000,
    });
    expect(result.amounts.LODGING).toBe(80_000);
    expect(result.amounts.FOOD).toBe(50_000);
    expect(result.remainingCents).toBe(-30_000);
  });

  it("adds nothing when every category is already set", () => {
    const explicit = {
      TRANSPORTATION: 10_000,
      LODGING: 10_000,
      FOOD: 10_000,
      ACTIVITIES: 10_000,
      LOCAL_TRANSPORTATION: 10_000,
      MISCELLANEOUS: 10_000,
    };
    const result = allocateBudget(60_000, explicit);
    expect(result.derived).toEqual([]);
    expect(total(result.amounts)).toBe(60_000);
  });

  it("handles a zero budget without dividing by zero", () => {
    const result = allocateBudget(0);
    expect(total(result.amounts)).toBe(0);
  });
});

describe("summarizeBudget", () => {
  it("reports what is left to allocate", () => {
    const summary = summarizeBudget(300_000, { LODGING: 90_000 });
    expect(summary.allocatedCents).toBe(90_000);
    expect(summary.unallocatedCents).toBe(210_000);
    expect(summary.overAllocated).toBe(false);
  });

  it("flags categories that exceed the total", () => {
    const summary = summarizeBudget(100_000, {
      LODGING: 90_000,
      FOOD: 30_000,
    });
    expect(summary.overAllocated).toBe(true);
    expect(summary.unallocatedCents).toBe(-20_000);
  });

  it("does not flag anything when no total was given", () => {
    const summary = summarizeBudget(null, { LODGING: 90_000 });
    expect(summary.overAllocated).toBe(false);
  });

  it("treats a null category as unset rather than zero", () => {
    const summary = summarizeBudget(100_000, { LODGING: null });
    expect(summary.allocatedCents).toBe(0);
  });
});

describe("dailyPerTravelerCents", () => {
  it("divides across days and travelers", () => {
    expect(dailyPerTravelerCents(300_000, 4, 2)).toBe(37_500);
  });

  it("returns zero rather than infinity on bad input", () => {
    expect(dailyPerTravelerCents(300_000, 0, 2)).toBe(0);
    expect(dailyPerTravelerCents(300_000, 4, 0)).toBe(0);
  });
});
