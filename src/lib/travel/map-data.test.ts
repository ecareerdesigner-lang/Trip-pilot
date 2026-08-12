import { describe, it, expect } from "vitest";
import {
  DAY_COLORS,
  buildMapData,
  computeBounds,
  dayColor,
  project,
} from "@/lib/travel/map-data";
import type { ItineraryDay, TimelineItem, TimelineLeg } from "@/types/view";
import type { TransportMode } from "@/types/domain";

const MIDTOWN = { latitude: 40.7597, longitude: -73.9897 };
const UPPER_WEST = { latitude: 40.7813, longitude: -73.974 };
const DOWNTOWN = { latitude: 40.7061, longitude: -74.0087 };

function leg(mode: TransportMode, minutes: number, order = 0): TimelineLeg {
  return {
    id: `${mode}-${order}`,
    mode,
    durationMinutes: minutes,
    distanceMeters: 1_000,
    costCents: 0,
    instructions: "",
    originLabel: null,
    destinationLabel: null,
    departureTime: null,
    arrivalTime: null,
    legOrder: order,
  };
}

function item(
  id: string,
  point: { latitude: number; longitude: number } | null,
  legs: TimelineLeg[] = [],
  overrides: Partial<TimelineItem> = {},
): TimelineItem {
  return {
    id,
    type: "SIGHTSEEING",
    title: `Stop ${id}`,
    description: null,
    startTime: "2026-12-16T10:00:00.000Z",
    endTime: "2026-12-16T11:00:00.000Z",
    durationMinutes: 60,
    locationName: `Place ${id}`,
    latitude: point?.latitude ?? null,
    longitude: point?.longitude ?? null,
    estimatedCostCents: 0,
    reservationRequired: false,
    reservationStatus: "NOT_REQUIRED",
    priority: "NORMAL",
    source: "AI_SUGGESTION",
    isMustDo: false,
    completed: false,
    isMock: true,
    legs,
    ...overrides,
  };
}

function day(dayNumber: number, items: TimelineItem[]): ItineraryDay {
  return {
    id: `d${dayNumber}`,
    dayNumber,
    date: `2026-12-${15 + dayNumber}`,
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

describe("computeBounds", () => {
  it("contains every point", () => {
    const bounds = computeBounds([MIDTOWN, UPPER_WEST, DOWNTOWN])!;
    for (const point of [MIDTOWN, UPPER_WEST, DOWNTOWN]) {
      expect(point.latitude).toBeLessThanOrEqual(bounds.north);
      expect(point.latitude).toBeGreaterThanOrEqual(bounds.south);
      expect(point.longitude).toBeLessThanOrEqual(bounds.east);
      expect(point.longitude).toBeGreaterThanOrEqual(bounds.west);
    }
  });

  it("leaves a margin so nothing sits on the frame edge", () => {
    const bounds = computeBounds([MIDTOWN, DOWNTOWN])!;
    expect(bounds.north).toBeGreaterThan(MIDTOWN.latitude);
    expect(bounds.south).toBeLessThan(DOWNTOWN.latitude);
  });

  it("gives a single point a usable span", () => {
    const bounds = computeBounds([MIDTOWN])!;
    expect(bounds.north).toBeGreaterThan(bounds.south);
    expect(bounds.east).toBeGreaterThan(bounds.west);
  });

  it("centres between the extremes", () => {
    const bounds = computeBounds([MIDTOWN, DOWNTOWN])!;
    expect(bounds.center.latitude).toBeCloseTo(
      (MIDTOWN.latitude + DOWNTOWN.latitude) / 2,
      5,
    );
  });

  it("returns nothing for no points", () => {
    expect(computeBounds([])).toBeNull();
  });
});

describe("project", () => {
  const bounds = computeBounds([MIDTOWN, UPPER_WEST, DOWNTOWN])!;

  it("keeps everything inside the frame", () => {
    for (const point of [MIDTOWN, UPPER_WEST, DOWNTOWN]) {
      const { x, y } = project(point, bounds);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
  });

  it("puts north at the top", () => {
    const north = project(UPPER_WEST, bounds);
    const south = project(DOWNTOWN, bounds);
    expect(north.y).toBeLessThan(south.y);
  });

  it("puts east to the right", () => {
    const east = project(UPPER_WEST, bounds);
    const west = project(DOWNTOWN, bounds);
    expect(east.x).toBeGreaterThan(west.x);
  });

  it("places the centre near the middle", () => {
    const { x, y } = project(bounds.center, bounds);
    expect(x).toBeCloseTo(0.5, 1);
    expect(y).toBeCloseTo(0.5, 1);
  });

  it("does not divide by zero on a degenerate box", () => {
    const single = computeBounds([MIDTOWN])!;
    const { x, y } = project(MIDTOWN, single);
    expect(Number.isFinite(x)).toBe(true);
    expect(Number.isFinite(y)).toBe(true);
  });
});

describe("buildMapData", () => {
  it("marks every stop that has coordinates", () => {
    const data = buildMapData([
      day(1, [item("a", MIDTOWN), item("b", UPPER_WEST)]),
    ]);
    expect(data.markers).toHaveLength(2);
    expect(data.unmappedCount).toBe(0);
  });

  it("counts stops it cannot place rather than hiding them", () => {
    const data = buildMapData([
      day(1, [item("a", MIDTOWN), item("b", null)]),
    ]);
    expect(data.markers).toHaveLength(1);
    expect(data.unmappedCount).toBe(1);
  });

  it("numbers stops within their own day", () => {
    const data = buildMapData([
      day(1, [item("a", MIDTOWN), item("b", UPPER_WEST)]),
      day(2, [item("c", DOWNTOWN)]),
    ]);
    expect(data.markers.map((marker) => marker.order)).toEqual([1, 2, 1]);
  });

  it("does not number a stop it could not place", () => {
    const data = buildMapData([
      day(1, [item("a", MIDTOWN), item("skip", null), item("b", UPPER_WEST)]),
    ]);
    expect(data.markers.map((marker) => marker.order)).toEqual([1, 2]);
  });

  it("connects consecutive stops", () => {
    const data = buildMapData([
      day(1, [item("a", MIDTOWN), item("b", UPPER_WEST), item("c", DOWNTOWN)]),
    ]);
    expect(data.routes).toHaveLength(2);
  });

  it("does not connect across days", () => {
    const data = buildMapData([
      day(1, [item("a", MIDTOWN)]),
      day(2, [item("b", UPPER_WEST)]),
    ]);
    expect(data.routes).toEqual([]);
  });

  it("names a route after the longest leg of the journey", () => {
    // Walk to the station then ride: that is a subway trip, not a walk.
    const data = buildMapData([
      day(1, [
        item("a", MIDTOWN),
        item("b", UPPER_WEST, [leg("WALK", 8, 0), leg("SUBWAY", 18, 1)]),
      ]),
    ]);
    expect(data.routes[0]!.mode).toBe("SUBWAY");
  });

  it("totals the whole journey, not just its longest leg", () => {
    const data = buildMapData([
      day(1, [
        item("a", MIDTOWN),
        item("b", UPPER_WEST, [leg("WALK", 8, 0), leg("SUBWAY", 18, 1)]),
      ]),
    ]);
    expect(data.routes[0]!.durationMinutes).toBe(26);
  });

  it("falls back to walking when a journey has no legs", () => {
    const data = buildMapData([
      day(1, [item("a", MIDTOWN), item("b", UPPER_WEST)]),
    ]);
    expect(data.routes[0]!.mode).toBe("WALK");
  });

  it("gives every route a colour", () => {
    const data = buildMapData([
      day(1, [
        item("a", MIDTOWN),
        item("b", UPPER_WEST, [leg("SUBWAY", 18)]),
      ]),
    ]);
    expect(data.routes[0]!.color).toBeTruthy();
  });

  it("carries the must-do flag through to the marker", () => {
    const data = buildMapData([
      day(1, [item("a", MIDTOWN, [], { isMustDo: true })]),
    ]);
    expect(data.markers[0]!.isMustDo).toBe(true);
  });

  it("handles an empty itinerary", () => {
    const data = buildMapData([]);
    expect(data.markers).toEqual([]);
    expect(data.routes).toEqual([]);
    expect(data.bounds).toBeNull();
  });

  it("handles a day where nothing can be placed", () => {
    const data = buildMapData([day(1, [item("a", null), item("b", null)])]);
    expect(data.bounds).toBeNull();
    expect(data.unmappedCount).toBe(2);
  });
});

describe("day colours and trip ordering", () => {
  it("numbers stops continuously across the trip", () => {
    // Within a day, numbering restarts. Across the whole trip it must not, or
    // a five-day view shows three 2s and reads as a bug.
    const data = buildMapData([
      day(1, [item("a", MIDTOWN), item("b", UPPER_WEST)]),
      day(2, [item("c", DOWNTOWN), item("d", MIDTOWN)]),
    ]);
    expect(data.markers.map((marker) => marker.tripOrder)).toEqual([1, 2, 3, 4]);
    expect(data.markers.map((marker) => marker.order)).toEqual([1, 2, 1, 2]);
  });

  it("does not advance trip order for a stop it cannot place", () => {
    const data = buildMapData([
      day(1, [item("a", MIDTOWN), item("skip", null), item("b", UPPER_WEST)]),
    ]);
    expect(data.markers.map((marker) => marker.tripOrder)).toEqual([1, 2]);
  });

  it("gives every stop in a day the same colour", () => {
    const data = buildMapData([
      day(1, [item("a", MIDTOWN), item("b", UPPER_WEST)]),
    ]);
    expect(data.markers[0]!.color).toBe(data.markers[1]!.color);
  });

  it("gives different days different colours", () => {
    const data = buildMapData([
      day(1, [item("a", MIDTOWN)]),
      day(2, [item("b", UPPER_WEST)]),
    ]);
    expect(data.markers[0]!.color).not.toBe(data.markers[1]!.color);
  });

  it("carries the day colour onto routes", () => {
    const data = buildMapData([
      day(2, [item("a", MIDTOWN), item("b", UPPER_WEST)]),
    ]);
    expect(data.routes[0]!.dayColor).toBe(dayColor(2));
    // The mode colour is still there; the component decides which to use.
    expect(data.routes[0]!.color).toBeTruthy();
  });

  it("cycles colours rather than running out on a long trip", () => {
    const colors = Array.from({ length: 10 }, (_, index) => dayColor(index + 1));
    expect(colors.every((color) => color.startsWith("#"))).toBe(true);
    expect(dayColor(1)).toBe(dayColor(1 + DAY_COLORS.length));
  });
});
