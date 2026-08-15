import { describe, it, expect } from "vitest";
import { resolveOverlapsAfter } from "@/lib/travel/edit-itinerary";
import type { EditContext } from "@/lib/travel/edit-itinerary";
import type { ItineraryDay, TimelineItem, TimelineLeg } from "@/types/view";

/**
 * Arrivals must not land on top of what is already there.
 *
 * Moving the museum to Thursday at 10:00 left Central Park starting at
 * 10:07, inside it. The validator reported the collision; nothing prevented
 * it.
 */

const CONTEXT: EditContext = {
  destination: "New York City",
  travelers: 2,
  preferences: ["PUBLIC_TRANSPORT_PREFERRED"],
};

const AMNH = { latitude: 40.7813, longitude: -73.974 };
const PARK = { latitude: 40.7829, longitude: -73.9654 };

function iso(minute: number): string {
  const hours = String(Math.floor(minute / 60)).padStart(2, "0");
  return `2026-08-27T${hours}:${String(minute % 60).padStart(2, "0")}:00.000Z`;
}

function leg(minutes: number): TimelineLeg {
  return {
    id: `leg-${minutes}`,
    mode: "WALK",
    durationMinutes: minutes,
    distanceMeters: 800,
    costCents: 0,
    instructions: "Walk",
    originLabel: null,
    destinationLabel: null,
    departureTime: null,
    arrivalTime: null,
    legOrder: 0,
  };
}

function item(
  id: string,
  startMinute: number,
  durationMinutes: number,
  point: { latitude: number; longitude: number },
  legs: TimelineLeg[] = [],
): TimelineItem {
  return {
    id,
    type: "SIGHTSEEING",
    title: id,
    description: null,
    startTime: iso(startMinute),
    endTime: iso(startMinute + durationMinutes),
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
    legs,
  };
}

function day(items: TimelineItem[]): ItineraryDay {
  return {
    id: "d4",
    dayNumber: 4,
    date: "2026-08-27",
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

function startOf(result: { day: ItineraryDay }, id: string): number {
  const found = result.day.items.find((entry) => entry.id === id)!;
  const date = new Date(found.startTime);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

describe("resolveOverlapsAfter", () => {
  it("clears the overlap that reached a real trip", () => {
    // Museum 10:00-12:10, park at 10:07 — seven minutes into it.
    const result = resolveOverlapsAfter(
      day([
        item("museum", 600, 130, AMNH),
        item("park", 607, 90, PARK, [leg(12)]),
      ]),
      "museum",
      CONTEXT,
    );

    expect(startOf(result, "park")).toBeGreaterThanOrEqual(600 + 130);
  });

  it("leaves room for the journey between them", () => {
    const result = resolveOverlapsAfter(
      day([
        item("museum", 600, 130, AMNH),
        item("park", 607, 90, PARK, [leg(12)]),
      ]),
      "museum",
      CONTEXT,
    );

    const park = result.day.items.find((entry) => entry.id === "park")!;
    const travel = park.legs.reduce((sum, entry) => sum + entry.durationMinutes, 0);
    expect(startOf(result, "park")).toBeGreaterThanOrEqual(600 + 130 + travel);
  });

  it("moves things by the smallest amount that works", () => {
    const result = resolveOverlapsAfter(
      day([
        item("museum", 600, 130, AMNH),
        item("park", 607, 90, PARK),
      ]),
      "museum",
      CONTEXT,
    );
    // No legs, so the park needs to start exactly when the museum ends.
    expect(startOf(result, "park")).toBe(730);
  });

  it("leaves a day alone when nothing overlaps", () => {
    const before = day([
      item("museum", 600, 130, AMNH),
      item("park", 800, 90, PARK),
    ]);
    const result = resolveOverlapsAfter(before, "museum", CONTEXT);
    expect(startOf(result, "park")).toBe(800);
  });

  it("does not touch what comes before the arrival", () => {
    const result = resolveOverlapsAfter(
      day([
        item("breakfast", 521, 60, PARK),
        item("museum", 600, 130, AMNH),
        item("park", 607, 90, PARK),
      ]),
      "museum",
      CONTEXT,
    );
    expect(startOf(result, "breakfast")).toBe(521);
  });

  it("pushes everything after, keeping the order", () => {
    const result = resolveOverlapsAfter(
      day([
        item("museum", 600, 130, AMNH),
        item("park", 607, 90, PARK),
        item("lunch", 720, 70, PARK),
      ]),
      "museum",
      CONTEXT,
    );

    const starts = result.day.items.map((entry) =>
      Date.parse(entry.startTime),
    );
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    expect(startOf(result, "lunch")).toBeGreaterThan(startOf(result, "park"));
  });

  it("loses nothing", () => {
    const result = resolveOverlapsAfter(
      day([
        item("museum", 600, 130, AMNH),
        item("park", 607, 90, PARK),
        item("lunch", 720, 70, PARK),
      ]),
      "museum",
      CONTEXT,
    );
    expect(result.day.items).toHaveLength(3);
  });

  it("handles an arrival at the end of the day", () => {
    const result = resolveOverlapsAfter(
      day([item("park", 600, 90, PARK), item("museum", 800, 130, AMNH)]),
      "museum",
      CONTEXT,
    );
    expect(result.day.items).toHaveLength(2);
    expect(startOf(result, "museum")).toBe(800);
  });

  it("does nothing for an item that is not there", () => {
    const before = day([item("park", 600, 90, PARK)]);
    const result = resolveOverlapsAfter(before, "ghost", CONTEXT);
    expect(result.day).toBe(before);
  });

  it("produces a day with no overlaps at all", () => {
    const result = resolveOverlapsAfter(
      day([
        item("museum", 600, 130, AMNH),
        item("park", 607, 90, PARK, [leg(12)]),
        item("lunch", 700, 70, PARK, [leg(8)]),
      ]),
      "museum",
      CONTEXT,
    );

    const ordered = [...result.day.items].sort(
      (a, b) => Date.parse(a.startTime) - Date.parse(b.startTime),
    );
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1]!;
      const current = ordered[index]!;
      expect(Date.parse(current.startTime)).toBeGreaterThanOrEqual(
        Date.parse(previous.endTime),
      );
    }
  });
});
