import { describe, it, expect } from "vitest";
import {
  buildBudgetLedger,
  buildMustDoRows,
  buildTripDays,
  buildTripScalars,
  calendarDate,
} from "@/lib/travel/trip-setup";
import { BUDGET_CATEGORIES } from "@/types/domain";
import type { TripPayload } from "@/lib/validation/trip";

const PAYLOAD: TripPayload = {
  name: "Broadway weekend",
  origin: "Charlotte, NC",
  destination: "New York City",
  startDate: "2026-09-18",
  endDate: "2026-09-21",
  travelers: 2,
  travelMethod: "FLIGHT",
  transportationIntent: "SEARCH",
  totalBudgetCents: 300_000,
  transportationBudgetCents: null,
  lodgingBudgetCents: 90_000,
  foodBudgetCents: null,
  activityBudgetCents: null,
  localTransportationBudgetCents: null,
  pace: "BALANCED",
  foodPreference: "LOCAL_FAVORITES",
  transportPreferences: ["PUBLIC_TRANSPORT_PREFERRED"],
  dayStartMinute: 480,
  dayEndMinute: 1320,
  mustDos: [{ title: "See a Broadway show", description: "" }],
  notes: "  Anniversary trip.  ",
};

describe("calendarDate", () => {
  it("reads a date as UTC midnight, not local", () => {
    const date = calendarDate("2026-09-18");
    expect(date.toISOString()).toBe("2026-09-18T00:00:00.000Z");
    expect(date.getUTCDate()).toBe(18);
  });

  it("does not slip a day west of UTC", () => {
    // The bug this guards: `new Date("2026-03-01")` read with local getters
    // returns Feb 28 in any US timezone.
    expect(calendarDate("2026-03-01").getUTCMonth()).toBe(2);
  });
});

describe("buildTripDays", () => {
  it("includes both the departure and return days", () => {
    const days = buildTripDays("2026-09-18", "2026-09-21");
    expect(days).toHaveLength(4);
    expect(days.map((day) => day.dayNumber)).toEqual([1, 2, 3, 4]);
  });

  it("produces one day for a same-day trip", () => {
    expect(buildTripDays("2026-09-18", "2026-09-18")).toHaveLength(1);
  });

  it("advances exactly one day at a time", () => {
    const days = buildTripDays("2026-09-18", "2026-09-21");
    expect(days.map((day) => day.date.toISOString().slice(0, 10))).toEqual([
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
      "2026-09-21",
    ]);
  });

  it("crosses a month boundary", () => {
    const days = buildTripDays("2026-03-30", "2026-04-02");
    expect(days.map((day) => day.date.toISOString().slice(0, 10))).toEqual([
      "2026-03-30",
      "2026-03-31",
      "2026-04-01",
      "2026-04-02",
    ]);
  });

  it("crosses a year boundary", () => {
    const days = buildTripDays("2025-12-30", "2026-01-02");
    expect(days).toHaveLength(4);
    expect(days[3]!.date.toISOString().slice(0, 10)).toBe("2026-01-02");
  });

  /**
   * US daylight saving starts 2026-03-08. Adding 86,400,000 ms to a local
   * date across that boundary lands at 1 AM the same day; in UTC it does not.
   */
  it("survives a daylight saving transition", () => {
    const days = buildTripDays("2026-03-07", "2026-03-10");
    expect(days.map((day) => day.date.toISOString().slice(0, 10))).toEqual([
      "2026-03-07",
      "2026-03-08",
      "2026-03-09",
      "2026-03-10",
    ]);
  });

  it("handles a long trip", () => {
    expect(buildTripDays("2026-01-01", "2026-02-28")).toHaveLength(59);
  });

  it("returns nothing when the dates are backwards", () => {
    expect(buildTripDays("2026-09-21", "2026-09-18")).toEqual([]);
  });
});

describe("buildBudgetLedger", () => {
  it("creates one empty row per category", () => {
    const ledger = buildBudgetLedger();
    expect(ledger).toHaveLength(BUDGET_CATEGORIES.length);
    expect(ledger.every((row) => row.plannedCents === 0)).toBe(true);
    expect(ledger.every((row) => row.actualCents === 0)).toBe(true);
  });

  it("does not copy the traveler's allocation into planned spend", () => {
    // Planned is derived from the itinerary. Seeding it from the allocation
    // would double-count against the trip's own budget columns.
    const ledger = buildBudgetLedger();
    expect(ledger.find((row) => row.category === "LODGING")!.plannedCents).toBe(0);
  });
});

describe("buildTripScalars", () => {
  it("keeps money in cents and dates in UTC", () => {
    const scalars = buildTripScalars(PAYLOAD);
    expect(scalars.totalBudgetCents).toBe(300_000);
    expect(scalars.lodgingBudgetCents).toBe(90_000);
    expect(scalars.startDate.toISOString()).toBe("2026-09-18T00:00:00.000Z");
  });

  it("keeps unset budgets null rather than zero", () => {
    expect(buildTripScalars(PAYLOAD).foodBudgetCents).toBeNull();
  });

  it("trims notes and stores blank as null", () => {
    expect(buildTripScalars(PAYLOAD).notes).toBe("Anniversary trip.");
    expect(buildTripScalars({ ...PAYLOAD, notes: "   " }).notes).toBeNull();
  });
});

describe("buildMustDoRows", () => {
  it("marks every must-do required and unscheduled", () => {
    const rows = buildMustDoRows(PAYLOAD);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("UNSCHEDULED");
    expect(rows[0]!.priority).toBe("REQUIRED");
  });

  it("drops entries with no title", () => {
    const rows = buildMustDoRows({
      ...PAYLOAD,
      mustDos: [
        { title: "Real one", description: "" },
        { title: "   ", description: "orphaned detail" },
      ],
    });
    expect(rows).toHaveLength(1);
  });

  it("stores a blank description as null", () => {
    expect(buildMustDoRows(PAYLOAD)[0]!.description).toBeNull();
  });
});
