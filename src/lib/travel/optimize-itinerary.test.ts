import { describe, it, expect } from "vitest";
import { optimizeItinerary, type OptimizeOptions } from "@/lib/travel/optimize-itinerary";
import type { ItineraryDay, TimelineItem } from "@/types/view";

const OPTIONS: OptimizeOptions = {
  destination: "New York City",
  travelers: 2,
  pace: "BALANCED",
  transportPreferences: ["PUBLIC_TRANSPORT_PREFERRED"],
  dayStartMinute: 8 * 60,
  dayEndMinute: 22 * 60,
};

// Real Manhattan coordinates so distances are meaningful.
const MIDTOWN = { latitude: 40.7597, longitude: -73.9897 };
const UPPER_WEST = { latitude: 40.7813, longitude: -73.974 };
const UPPER_EAST = { latitude: 40.7794, longitude: -73.9632 };
const DOWNTOWN = { latitude: 40.7061, longitude: -74.0087 };

function at(minute: number): string {
  const hours = String(Math.floor(minute / 60)).padStart(2, "0");
  const minutes = String(minute % 60).padStart(2, "0");
  return `2026-09-18T${hours}:${minutes}:00.000Z`;
}

function item(
  id: string,
  startMinute: number,
  durationMinutes: number,
  point: { latitude: number; longitude: number },
  overrides: Partial<TimelineItem> = {},
): TimelineItem {
  return {
    id,
    type: "SIGHTSEEING",
    title: `Item ${id}`,
    description: null,
    startTime: at(startMinute),
    endTime: at(startMinute + durationMinutes),
    durationMinutes,
    locationName: id,
    latitude: point.latitude,
    longitude: point.longitude,
    placeLink: null,
    estimatedCostCents: 0,
    reservationRequired: false,
    reservationStatus: "NOT_REQUIRED",
    priority: "NORMAL",
    source: "AI_SUGGESTION",
    isMustDo: false,
    completed: false,
    isMock: true,
    legs: [],
    ...overrides,
  };
}

function day(items: TimelineItem[]): ItineraryDay {
  return {
    id: "d1",
    dayNumber: 1,
    date: "2026-09-18",
    summary: null,
    items,
    totals: {
      itemCount: items.length,
      plannedCents: 0,
      scheduledMinutes: 0,
      travelMinutes: 0,
      walkingMeters: 0,
      openMinutes: 0,
    },
    startsAt: null,
    endsAt: null,
  };
}

describe("geographic ordering", () => {
  it("cuts travel by grouping nearby stops", () => {
    // Midtown, downtown, back uptown, back downtown: a day of yo-yoing.
    const zigzag = day([
      item("a", 540, 60, MIDTOWN),
      item("b", 660, 60, DOWNTOWN),
      item("c", 780, 60, UPPER_WEST),
      item("d", 900, 60, DOWNTOWN),
    ]);

    const result = optimizeItinerary([zigzag], OPTIONS);
    expect(result.travelMinutesSaved).toBeGreaterThan(0);
    expect(result.days[0]!.travelMinutesAfter).toBeLessThan(
      result.days[0]!.travelMinutesBefore,
    );
  });

  it("leaves an already-efficient day alone", () => {
    const tidy = day([
      item("a", 540, 60, UPPER_WEST),
      item("b", 660, 60, UPPER_EAST),
    ]);
    const result = optimizeItinerary([tidy], OPTIONS);
    expect(result.days[0]!.travelMinutesAfter).toBe(
      result.days[0]!.travelMinutesBefore,
    );
  });

  it("never reorders for no gain", () => {
    const tidy = day([
      item("a", 540, 60, MIDTOWN),
      item("b", 660, 60, MIDTOWN),
    ]);
    const result = optimizeItinerary([tidy], OPTIONS);
    const resequenced = result.days[0]!.changes.filter(
      (change) => change.kind === "resequenced",
    );
    expect(resequenced).toHaveLength(0);
  });
});

describe("anchors", () => {
  it("keeps a confirmed booking at its own time", () => {
    const withShow = day([
      item("museum", 540, 120, UPPER_WEST),
      item("show", 1_140, 165, MIDTOWN, {
        reservationRequired: true,
        reservationStatus: "CONFIRMED",
        title: "Broadway show",
      }),
    ]);

    const result = optimizeItinerary([withShow], OPTIONS);
    const show = result.days[0]!.items.find((entry) => entry.id === "show")!;
    expect(show.startMinute).toBe(1_140);
  });

  it("keeps travel where it is", () => {
    const withFlight = day([
      item("flight", 420, 155, MIDTOWN, { type: "TRAVEL", title: "Flight" }),
      item("museum", 780, 120, UPPER_WEST),
    ]);
    const result = optimizeItinerary([withFlight], OPTIONS);
    expect(
      result.days[0]!.items.find((entry) => entry.id === "flight")!.startMinute,
    ).toBe(420);
  });

  it("honours an explicitly pinned item", () => {
    const pinned = day([
      item("a", 540, 60, MIDTOWN),
      item("b", 900, 60, DOWNTOWN),
    ]);
    const result = optimizeItinerary([pinned], {
      ...OPTIONS,
      anchoredItemIds: ["b"],
    });
    expect(
      result.days[0]!.items.find((entry) => entry.id === "b")!.startMinute,
    ).toBe(900);
  });
});

describe("scheduling", () => {
  it("leaves room to travel between consecutive stops", () => {
    const spread = day([
      item("a", 540, 60, MIDTOWN),
      item("b", 620, 60, DOWNTOWN),
    ]);

    const result = optimizeItinerary([spread], OPTIONS);
    const items = result.days[0]!.items;

    for (let index = 1; index < items.length; index += 1) {
      const previous = items[index - 1]!;
      const current = items[index]!;
      const gap =
        current.startMinute - (previous.startMinute + previous.durationMinutes);
      expect(gap).toBeGreaterThanOrEqual(current.travelMinutesIn);
    }
  });

  it("never starts a day before the traveler wants to", () => {
    const early = day([item("a", 300, 60, MIDTOWN)]);
    const result = optimizeItinerary([early], OPTIONS);
    expect(result.days[0]!.items[0]!.startMinute).toBeGreaterThanOrEqual(
      OPTIONS.dayStartMinute,
    );
  });

  it("keeps items in the order it scheduled them", () => {
    const busy = day([
      item("a", 540, 60, MIDTOWN),
      item("b", 660, 60, UPPER_WEST),
      item("c", 780, 60, UPPER_EAST),
    ]);
    const result = optimizeItinerary([busy], OPTIONS);
    const starts = result.days[0]!.items.map((entry) => entry.startMinute);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });
});

describe("reporting", () => {
  it("explains every change it makes", () => {
    const zigzag = day([
      item("a", 540, 60, MIDTOWN),
      item("b", 660, 60, DOWNTOWN),
      item("c", 780, 60, UPPER_WEST),
    ]);
    const result = optimizeItinerary([zigzag], OPTIONS);
    for (const change of result.changes) {
      expect(change.reason).toBeTruthy();
      expect(change.title).toBeTruthy();
      expect(change.itemId).toBeTruthy();
    }
  });

  it("reports no saving when it changed nothing", () => {
    const single = day([item("a", 540, 60, MIDTOWN)]);
    const result = optimizeItinerary([single], OPTIONS);
    expect(result.travelMinutesSaved).toBe(0);
  });

  it("never reports a negative saving", () => {
    const zigzag = day([
      item("a", 540, 60, MIDTOWN),
      item("b", 660, 60, DOWNTOWN),
      item("c", 780, 60, UPPER_WEST),
      item("d", 900, 60, UPPER_EAST),
    ]);
    expect(
      optimizeItinerary([zigzag], OPTIONS).travelMinutesSaved,
    ).toBeGreaterThanOrEqual(0);
  });
});

describe("edge cases", () => {
  it("handles an empty day", () => {
    const result = optimizeItinerary([day([])], OPTIONS);
    expect(result.days[0]!.items).toEqual([]);
    expect(result.changes).toEqual([]);
  });

  it("handles a day with one item", () => {
    const result = optimizeItinerary([day([item("a", 540, 60, MIDTOWN)])], OPTIONS);
    expect(result.days[0]!.items).toHaveLength(1);
  });

  it("keeps items that have no coordinates", () => {
    const noPlace = day([
      item("a", 540, 60, MIDTOWN),
      { ...item("b", 660, 60, MIDTOWN), latitude: null, longitude: null },
    ]);
    const result = optimizeItinerary([noPlace], OPTIONS);
    expect(result.days[0]!.items).toHaveLength(2);
  });

  it("loses nothing across multiple days", () => {
    const result = optimizeItinerary(
      [
        day([item("a", 540, 60, MIDTOWN), item("b", 660, 60, DOWNTOWN)]),
        { ...day([item("c", 540, 60, UPPER_WEST)]), dayNumber: 2, date: "2026-09-19" },
      ],
      OPTIONS,
    );
    const total = result.days.reduce((sum, entry) => sum + entry.items.length, 0);
    expect(total).toBe(3);
  });

  it("is deterministic", () => {
    const input = [
      day([
        item("a", 540, 60, MIDTOWN),
        item("b", 660, 60, DOWNTOWN),
        item("c", 780, 60, UPPER_WEST),
      ]),
    ];
    expect(JSON.stringify(optimizeItinerary(input, OPTIONS))).toBe(
      JSON.stringify(optimizeItinerary(input, OPTIONS)),
    );
  });
});
