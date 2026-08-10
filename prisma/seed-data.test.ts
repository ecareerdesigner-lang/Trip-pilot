import { describe, it, expect } from "vitest";
import {
  SEED_ITEMS,
  SEED_LOCATIONS,
  SEED_MUST_DOS,
  SEED_TRIP,
  buildSeedTrip,
  type BuiltItem,
} from "./seed-data";

/**
 * The seed is the fixture the scheduling engines will be built against, so it
 * has to be a schedule that could actually happen. These tests assert the
 * invariants the reality-check engine will enforce in Phase 18 — if the seed
 * cannot pass them, it is the wrong thing to develop against.
 */

const REFERENCE = new Date(Date.UTC(2026, 8, 1)); // deterministic
const trip = buildSeedTrip(REFERENCE);

function itemsForDay(day: number): BuiltItem[] {
  return trip.items
    .filter((item) => item.day === day)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

const DAYS = Array.from({ length: SEED_TRIP.dayCount }, (_, i) => i + 1);

describe("seed fixture shape", () => {
  it("spans the declared number of days", () => {
    expect(trip.days).toHaveLength(SEED_TRIP.dayCount);
    expect(trip.days.map((d) => d.dayNumber)).toEqual([1, 2, 3, 4]);
  });

  it("ends on the last day, not the day after", () => {
    const spanDays =
      (trip.endDate.getTime() - trip.startDate.getTime()) / 86_400_000;
    expect(spanDays).toBe(SEED_TRIP.dayCount - 1);
  });

  it("places every item on a day the trip covers", () => {
    for (const item of trip.items) {
      expect(DAYS).toContain(item.day);
    }
  });

  it("references only locations that exist", () => {
    for (const item of SEED_ITEMS) {
      expect(SEED_LOCATIONS).toHaveProperty(item.location);
      for (const leg of item.legs) {
        expect(SEED_LOCATIONS).toHaveProperty(leg.from);
        expect(SEED_LOCATIONS).toHaveProperty(leg.to);
      }
    }
  });

  it("uses a unique key per item", () => {
    const keys = SEED_ITEMS.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("links every satisfied must-do to a real item", () => {
    const keys = new Set(SEED_ITEMS.map((item) => item.key));
    for (const mustDo of SEED_MUST_DOS) {
      if (mustDo.satisfiedBy !== null) {
        expect(keys).toContain(mustDo.satisfiedBy);
      }
    }
  });

  it("keeps at least one must-do unscheduled, so the UI has both states", () => {
    expect(SEED_MUST_DOS.some((m) => m.satisfiedBy === null)).toBe(true);
    expect(SEED_MUST_DOS.some((m) => m.satisfiedBy !== null)).toBe(true);
  });
});

describe("schedule is possible", () => {
  it("gives every item a positive duration", () => {
    for (const item of trip.items) {
      expect(item.endTime.getTime()).toBeGreaterThan(item.startTime.getTime());
      expect(item.durationMinutes).toBeGreaterThan(0);
    }
  });

  it.each(DAYS)("has no overlapping items on day %i", (day) => {
    const items = itemsForDay(day);
    for (let i = 1; i < items.length; i += 1) {
      const previous = items[i - 1]!;
      const current = items[i]!;
      expect(current.startTime.getTime()).toBeGreaterThanOrEqual(
        previous.endTime.getTime(),
      );
    }
  });

  /**
   * The core invariant. Between the end of one item and the start of the next
   * there must be at least as much time as the legs connecting them require.
   * A fixture that fails this is one where the traveler teleports.
   */
  it.each(DAYS)("leaves enough time to travel between items on day %i", (day) => {
    const items = itemsForDay(day);
    for (let i = 1; i < items.length; i += 1) {
      const previous = items[i - 1]!;
      const current = items[i]!;
      const gapMinutes =
        (current.startTime.getTime() - previous.endTime.getTime()) / 60_000;
      const travelMinutes = current.legs.reduce(
        (sum, leg) => sum + leg.durationMinutes,
        0,
      );
      expect(gapMinutes).toBeGreaterThanOrEqual(travelMinutes);
    }
  });

  it("keeps every item inside its own calendar day", () => {
    for (const item of trip.items) {
      const dayDate = trip.days.find((d) => d.dayNumber === item.day)!.date;
      const nextMidnight = dayDate.getTime() + 86_400_000;
      expect(item.startTime.getTime()).toBeGreaterThanOrEqual(dayDate.getTime());
      expect(item.endTime.getTime()).toBeLessThanOrEqual(nextMidnight);
    }
  });

  it("numbers items sequentially within each day", () => {
    for (const day of DAYS) {
      const orders = itemsForDay(day).map((item) => item.sortOrder);
      expect(orders).toEqual(orders.map((_, index) => index));
    }
  });
});

describe("transportation legs", () => {
  it("orders legs from zero with no gaps", () => {
    for (const item of trip.items) {
      const orders = item.legs.map((leg) => leg.legOrder);
      expect(orders).toEqual(orders.map((_, index) => index));
    }
  });

  it("chains each leg's arrival into the next leg's departure", () => {
    for (const item of trip.items) {
      for (let i = 1; i < item.legs.length; i += 1) {
        expect(item.legs[i]!.departureTime.getTime()).toBe(
          item.legs[i - 1]!.arrivalTime.getTime(),
        );
      }
    }
  });

  it("lands the final leg exactly when the item starts", () => {
    for (const item of trip.items) {
      const last = item.legs.at(-1);
      if (!last) continue;
      expect(last.arrivalTime.getTime()).toBe(item.startTime.getTime());
    }
  });

  it("gives every leg a positive duration and non-negative cost", () => {
    for (const item of trip.items) {
      for (const leg of item.legs) {
        expect(leg.durationMinutes).toBeGreaterThan(0);
        expect(leg.costCents).toBeGreaterThanOrEqual(0);
        expect(leg.distanceMeters).toBeGreaterThan(0);
      }
    }
  });

  it("charges nothing to walk", () => {
    for (const item of trip.items) {
      for (const leg of item.legs) {
        if (leg.mode === "WALK") expect(leg.costCents).toBe(0);
      }
    }
  });

  it("includes at least one multi-leg journey", () => {
    expect(trip.items.some((item) => item.legs.length >= 3)).toBe(true);
  });
});

describe("budget", () => {
  it("totals the categories to the planned total", () => {
    const sum = Object.values(trip.plannedByCategory).reduce(
      (total, value) => total + value,
      0,
    );
    expect(sum).toBe(trip.plannedTotalCents);
  });

  it("counts leg fares as local transportation", () => {
    const legFares = trip.items.flatMap((item) =>
      item.legs.map((leg) => leg.costCents),
    );
    const legTotal = legFares.reduce((sum, value) => sum + value, 0);
    const itemsInCategory = trip.items
      .filter((item) => item.budgetCategory === "LOCAL_TRANSPORTATION")
      .reduce((sum, item) => sum + item.costCents, 0);

    expect(trip.plannedByCategory.LOCAL_TRANSPORTATION).toBe(
      legTotal + itemsInCategory,
    );
    expect(legTotal).toBeGreaterThan(0);
  });

  it("comes in under the trip budget", () => {
    expect(trip.plannedTotalCents).toBeLessThanOrEqual(
      SEED_TRIP.totalBudgetCents,
    );
  });

  it("declares category allocations that fit inside the total", () => {
    const allocated =
      SEED_TRIP.transportationBudgetCents +
      SEED_TRIP.lodgingBudgetCents +
      SEED_TRIP.foodBudgetCents +
      SEED_TRIP.activityBudgetCents +
      SEED_TRIP.localTransportationBudgetCents;
    expect(allocated).toBeLessThanOrEqual(SEED_TRIP.totalBudgetCents);
  });

  it("uses whole cents everywhere", () => {
    for (const value of Object.values(trip.plannedByCategory)) {
      expect(Number.isInteger(value)).toBe(true);
    }
    for (const item of trip.items) {
      expect(Number.isInteger(item.costCents)).toBe(true);
    }
  });
});

describe("determinism", () => {
  it("produces identical output for the same reference date", () => {
    const a = buildSeedTrip(REFERENCE);
    const b = buildSeedTrip(REFERENCE);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("starts in the future relative to the reference date", () => {
    expect(trip.startDate.getTime()).toBeGreaterThan(REFERENCE.getTime());
  });
});
