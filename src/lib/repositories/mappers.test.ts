import { describe, it, expect } from "vitest";
import {
  categorizeTrips,
  toItineraryDay,
  toNextStops,
  toTripSummary,
  type ItemRow,
  type ItemRowForStops,
  type LegRow,
  type TripRowForSummary,
} from "@/lib/repositories/mappers";
import type { TripSummary } from "@/types/view";

const ROW: TripRowForSummary = {
  id: "trip-1",
  name: "Broadway weekend",
  origin: "Charlotte, NC",
  destination: "New York City",
  startDate: new Date("2026-09-18T00:00:00Z"),
  endDate: new Date("2026-09-21T00:00:00Z"),
  travelers: 2,
  status: "READY",
  currency: "USD",
  totalBudgetCents: 300_000,
  budgets: [{ plannedCents: 100_000 }, { plannedCents: 50_000 }],
  mustDos: [
    { status: "SCHEDULED" },
    { status: "COMPLETED" },
    { status: "UNSCHEDULED" },
  ],
  _count: { itineraryItems: 25 },
};

function summary(overrides: Partial<TripSummary>): TripSummary {
  return { ...toTripSummary(ROW), ...overrides };
}

describe("toTripSummary", () => {
  it("renders dates as calendar strings without timezone drift", () => {
    const result = toTripSummary(ROW);
    expect(result.startDate).toBe("2026-09-18");
    expect(result.endDate).toBe("2026-09-21");
  });

  it("sums planned spend across the ledger", () => {
    expect(toTripSummary(ROW).plannedCents).toBe(150_000);
  });

  it("counts a completed must-do as scheduled", () => {
    const result = toTripSummary(ROW);
    expect(result.mustDoCount).toBe(3);
    expect(result.mustDoScheduledCount).toBe(2);
  });

  it("handles a trip with no ledger rows yet", () => {
    expect(toTripSummary({ ...ROW, budgets: [] }).plannedCents).toBe(0);
  });
});

describe("categorizeTrips", () => {
  const today = "2026-09-15";

  it("puts a future planned trip in upcoming", () => {
    const { upcoming } = categorizeTrips([summary({ status: "PLANNING" })], today);
    expect(upcoming).toHaveLength(1);
  });

  it("keeps a trip that ends today in upcoming", () => {
    const { upcoming } = categorizeTrips(
      [summary({ endDate: today, startDate: "2026-09-12" })],
      today,
    );
    expect(upcoming).toHaveLength(1);
  });

  it("moves a ready trip whose dates have passed into past", () => {
    const { past, upcoming } = categorizeTrips(
      [summary({ startDate: "2026-08-01", endDate: "2026-08-04" })],
      today,
    );
    expect(upcoming).toHaveLength(0);
    expect(past).toHaveLength(1);
  });

  it("separates drafts regardless of their dates", () => {
    const { drafts, upcoming } = categorizeTrips(
      [summary({ status: "DRAFT", startDate: "2026-01-01", endDate: "2026-01-04" })],
      today,
    );
    expect(drafts).toHaveLength(1);
    expect(upcoming).toHaveLength(0);
  });

  it("sorts upcoming soonest first and past most recent first", () => {
    const { upcoming, past } = categorizeTrips(
      [
        summary({ id: "a", startDate: "2026-11-01", endDate: "2026-11-05" }),
        summary({ id: "b", startDate: "2026-10-01", endDate: "2026-10-05" }),
        summary({ id: "c", startDate: "2026-07-01", endDate: "2026-07-05" }),
        summary({ id: "d", startDate: "2026-06-01", endDate: "2026-06-05" }),
      ],
      today,
    );
    expect(upcoming.map((t) => t.id)).toEqual(["b", "a"]);
    expect(past.map((t) => t.id)).toEqual(["c", "d"]);
  });
});

describe("toNextStops", () => {
  const items: ItemRowForStops[] = [
    {
      id: "item-1",
      title: "Lunch",
      type: "RESTAURANT",
      startTime: new Date("2026-09-18T11:35:00Z"),
      location: { name: "Hell's Kitchen bistro" },
      inboundLegs: [],
    },
    {
      id: "item-2",
      title: "Museum",
      type: "SIGHTSEEING",
      startTime: new Date("2026-09-18T13:20:00Z"),
      location: { name: "AMNH" },
      inboundLegs: [
        {
          id: "leg-b",
          mode: "SUBWAY",
          departureTime: new Date("2026-09-18T12:53:00Z"),
          durationMinutes: 18,
          instructions: "Take the C uptown",
          legOrder: 1,
        },
        {
          id: "leg-a",
          mode: "WALK",
          departureTime: new Date("2026-09-18T12:45:00Z"),
          durationMinutes: 8,
          instructions: "Walk to the station",
          legOrder: 0,
        },
      ],
    },
  ];

  it("places legs before the item they deliver to", () => {
    const stops = toNextStops(items);
    expect(stops.map((stop) => stop.id)).toEqual([
      "item-1",
      "leg-leg-a",
      "leg-leg-b",
      "item-2",
    ]);
  });

  it("orders legs by legOrder, not by array position", () => {
    const stops = toNextStops(items);
    expect(stops[1]!.mode).toBe("WALK");
    expect(stops[2]!.mode).toBe("SUBWAY");
  });

  it("marks a walking leg as walking and other legs as transportation", () => {
    const stops = toNextStops(items);
    expect(stops[1]!.type).toBe("WALKING");
    expect(stops[2]!.type).toBe("TRANSPORTATION");
  });

  it("leaves mode null on real destinations", () => {
    const stops = toNextStops(items);
    expect(stops[0]!.mode).toBeNull();
    expect(stops[3]!.mode).toBeNull();
  });

  it("anchors a leg with no departure time to its item", () => {
    const stops = toNextStops([
      {
        ...items[1]!,
        inboundLegs: [
          {
            id: "leg-c",
            mode: "UBER",
            departureTime: null,
            durationMinutes: 20,
            instructions: null,
            legOrder: 0,
          },
        ],
      },
    ]);
    expect(stops[0]!.startTime).toBe("2026-09-18T13:20:00.000Z");
    expect(stops[0]!.title).toBe("Uber to Museum");
  });

  it("returns nothing for no items", () => {
    expect(toNextStops([])).toEqual([]);
  });
});

describe("toItineraryDay", () => {
  const base = {
    id: "day-1",
    dayNumber: 1,
    date: new Date("2026-09-18T00:00:00Z"),
    summary: "Arrival.",
  };

  function item(overrides: Partial<ItemRow> = {}): ItemRow {
    return {
      id: "i1",
      type: "RESTAURANT",
      title: "Lunch",
      description: null,
      startTime: new Date("2026-09-18T11:00:00Z"),
      endTime: new Date("2026-09-18T12:00:00Z"),
      durationMinutes: 60,
      estimatedCostCents: 4_000,
      reservationRequired: false,
      reservationStatus: "NOT_REQUIRED",
      priority: "NORMAL",
      source: "AI_SUGGESTION",
      completed: false,
      isMock: true,
      sortOrder: 0,
      location: {
        name: "A bistro",
        latitude: 40.75,
        longitude: -73.99,
        providerRef: null,
        providerName: null,
      },
      inboundLegs: [],
      ...overrides,
    };
  }

  const leg = (overrides: Partial<LegRow> = {}): LegRow => ({
    id: "l1",
    mode: "SUBWAY",
    instructions: "Take the C uptown",
    originLabel: null,
    destinationLabel: null,
    originLocation: null,
    destinationLocation: null,
    durationMinutes: 20,
    distanceMeters: 4_000,
    estimatedCostCents: 580,
    departureTime: new Date("2026-09-18T12:40:00Z"),
    arrivalTime: new Date("2026-09-18T13:00:00Z"),
    legOrder: 0,
    ...overrides,
  });

  it("orders items by start time regardless of input order", () => {
    const day = toItineraryDay({
      ...base,
      itineraryItems: [
        item({ id: "late", startTime: new Date("2026-09-18T15:00:00Z") }),
        item({ id: "early", startTime: new Date("2026-09-18T09:00:00Z") }),
      ],
    });
    expect(day.items.map((entry) => entry.id)).toEqual(["early", "late"]);
  });

  it("orders legs by legOrder, not array position", () => {
    const day = toItineraryDay({
      ...base,
      itineraryItems: [
        item({
          inboundLegs: [
            leg({ id: "second", legOrder: 1, mode: "SUBWAY" }),
            leg({ id: "first", legOrder: 0, mode: "WALK" }),
          ],
        }),
      ],
    });
    expect(day.items[0]!.legs.map((entry) => entry.id)).toEqual([
      "first",
      "second",
    ]);
  });

  it("separates time at places from time getting between them", () => {
    const day = toItineraryDay({
      ...base,
      itineraryItems: [
        item({ durationMinutes: 60, inboundLegs: [leg({ durationMinutes: 20 })] }),
      ],
    });
    expect(day.totals.scheduledMinutes).toBe(60);
    expect(day.totals.travelMinutes).toBe(20);
  });

  it("counts leg fares in the day's planned spend", () => {
    const day = toItineraryDay({
      ...base,
      itineraryItems: [
        item({ estimatedCostCents: 4_000, inboundLegs: [leg({ estimatedCostCents: 580 })] }),
      ],
    });
    expect(day.totals.plannedCents).toBe(4_580);
  });

  it("measures open time between the first and last item only", () => {
    const day = toItineraryDay({
      ...base,
      itineraryItems: [
        item({
          id: "a",
          startTime: new Date("2026-09-18T09:00:00Z"),
          endTime: new Date("2026-09-18T10:00:00Z"),
          durationMinutes: 60,
        }),
        item({
          id: "b",
          startTime: new Date("2026-09-18T14:00:00Z"),
          endTime: new Date("2026-09-18T15:00:00Z"),
          durationMinutes: 60,
          inboundLegs: [leg({ durationMinutes: 30 })],
        }),
      ],
    });
    // 09:00 to 15:00 is 360 minutes; 120 scheduled, 30 travelling, 210 open.
    expect(day.totals.openMinutes).toBe(210);
  });

  it("reports no open time for a single-item day", () => {
    const day = toItineraryDay({ ...base, itineraryItems: [item()] });
    expect(day.totals.openMinutes).toBe(0);
  });

  it("never reports negative open time when a day is overbooked", () => {
    const day = toItineraryDay({
      ...base,
      itineraryItems: [
        item({
          id: "a",
          startTime: new Date("2026-09-18T09:00:00Z"),
          endTime: new Date("2026-09-18T12:00:00Z"),
          durationMinutes: 180,
        }),
        item({
          id: "b",
          startTime: new Date("2026-09-18T10:00:00Z"),
          endTime: new Date("2026-09-18T11:00:00Z"),
          durationMinutes: 60,
        }),
      ],
    });
    expect(day.totals.openMinutes).toBe(0);
  });

  it("marks must-do items", () => {
    const day = toItineraryDay({
      ...base,
      itineraryItems: [item({ source: "MUST_DO" }), item({ id: "i2" })],
    });
    expect(day.items[0]!.isMustDo).toBe(true);
    expect(day.items[1]!.isMustDo).toBe(false);
  });

  it("prefers a resolved location name over a plain label", () => {
    const day = toItineraryDay({
      ...base,
      itineraryItems: [
        item({
          inboundLegs: [
            leg({
              originLabel: "somewhere",
              originLocation: { name: "The hotel" },
            }),
          ],
        }),
      ],
    });
    expect(day.items[0]!.legs[0]!.originLabel).toBe("The hotel");
  });

  it("falls back to a readable instruction when none was stored", () => {
    const day = toItineraryDay({
      ...base,
      itineraryItems: [item({ inboundLegs: [leg({ instructions: null, mode: "WALK" })] })],
    });
    expect(day.items[0]!.legs[0]!.instructions).toMatch(/walk/i);
  });

  it("renders dates and times as ISO strings", () => {
    const day = toItineraryDay({ ...base, itineraryItems: [item()] });
    expect(day.date).toBe("2026-09-18");
    expect(day.items[0]!.startTime).toBe("2026-09-18T11:00:00.000Z");
  });

  it("handles a day with nothing scheduled", () => {
    const day = toItineraryDay({ ...base, itineraryItems: [] });
    expect(day.items).toEqual([]);
    expect(day.totals.itemCount).toBe(0);
    expect(day.totals.plannedCents).toBe(0);
  });
});
