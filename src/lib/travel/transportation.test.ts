import { describe, it, expect } from "vitest";
import { buildTransportationReport } from "@/lib/travel/transportation";
import type { ItineraryDay, TimelineItem, TimelineLeg } from "@/types/view";
import type { TransportMode } from "@/types/domain";

function leg(
  mode: TransportMode,
  legOrder: number,
  minutes: number,
  cents = 0,
  meters = 500,
): TimelineLeg {
  return {
    id: `${mode}-${legOrder}`,
    mode,
    durationMinutes: minutes,
    distanceMeters: meters,
    costCents: cents,
    instructions: "",
    originLabel: null,
    destinationLabel: null,
    departureTime: "2026-09-18T12:45:00.000Z",
    arrivalTime: "2026-09-18T13:20:00.000Z",
    legOrder,
  };
}

function item(id: string, legs: TimelineLeg[]): TimelineItem {
  return {
    id,
    type: "SIGHTSEEING",
    title: `Item ${id}`,
    description: null,
    startTime: "2026-09-18T13:20:00.000Z",
    endTime: "2026-09-18T15:00:00.000Z",
    durationMinutes: 100,
    locationName: null,
    latitude: null,
    longitude: null,
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

function day(dayNumber: number, items: TimelineItem[]): ItineraryDay {
  return {
    id: `d${dayNumber}`,
    dayNumber,
    date: `2026-09-${17 + dayNumber}`,
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

const MULTI = [
  leg("WALK", 0, 8),
  leg("SUBWAY", 1, 18, 580, 4_200),
  leg("WALK", 2, 6),
];

describe("buildTransportationReport", () => {
  it("assembles scattered legs into one journey", () => {
    const report = buildTransportationReport([day(1, [item("a", MULTI)])]);
    expect(report.journeyCount).toBe(1);
    const journey = report.days[0]!.journeys[0]!;
    expect(journey.legs).toHaveLength(3);
    expect(journey.totalMinutes).toBe(32);
    expect(journey.totalCostCents).toBe(580);
    expect(journey.totalMeters).toBe(5_200);
  });

  it("describes the shape of a journey in one phrase", () => {
    const report = buildTransportationReport([day(1, [item("a", MULTI)])]);
    expect(report.days[0]!.journeys[0]!.shape).toBe("Walk → Subway → Walk");
  });

  it("collapses consecutive legs of the same mode in the shape", () => {
    const report = buildTransportationReport([
      day(1, [item("a", [leg("SUBWAY", 0, 10), leg("SUBWAY", 1, 12)])]),
    ]);
    expect(report.days[0]!.journeys[0]!.shape).toBe("Subway");
    expect(report.days[0]!.journeys[0]!.legs).toHaveLength(2);
  });

  it("orders legs by legOrder regardless of input order", () => {
    const report = buildTransportationReport([
      day(1, [item("a", [leg("SUBWAY", 1, 18), leg("WALK", 0, 8)])]),
    ]);
    expect(report.days[0]!.journeys[0]!.legs.map((entry) => entry.mode)).toEqual([
      "WALK",
      "SUBWAY",
    ]);
  });

  it("ignores items that need no journey", () => {
    const report = buildTransportationReport([
      day(1, [item("a", []), item("b", MULTI)]),
    ]);
    expect(report.journeyCount).toBe(1);
  });

  it("summarizes by mode, most-used first", () => {
    const report = buildTransportationReport([day(1, [item("a", MULTI)])]);
    expect(report.byMode[0]!.mode).toBe("SUBWAY");
    const walk = report.byMode.find((entry) => entry.mode === "WALK")!;
    expect(walk.legCount).toBe(2);
    expect(walk.totalMinutes).toBe(14);
    expect(walk.totalCostCents).toBe(0);
  });

  it("totals across every day", () => {
    const report = buildTransportationReport([
      day(1, [item("a", MULTI)]),
      day(2, [item("b", MULTI)]),
    ]);
    expect(report.journeyCount).toBe(2);
    expect(report.totalMinutes).toBe(64);
    expect(report.totalCostCents).toBe(1_160);
    expect(report.days).toHaveLength(2);
  });

  it("finds the longest journey", () => {
    const report = buildTransportationReport([
      day(1, [
        item("short", [leg("WALK", 0, 5)]),
        item("long", [leg("TAXI", 0, 45, 3_400, 12_000)]),
      ]),
    ]);
    expect(report.longestJourney?.toItemId).toBe("long");
    expect(report.longestJourney?.totalMinutes).toBe(45);
  });

  it("arrives exactly when the item it serves begins", () => {
    const report = buildTransportationReport([day(1, [item("a", MULTI)])]);
    expect(report.days[0]!.journeys[0]!.arrivalTime).toBe(
      "2026-09-18T13:20:00.000Z",
    );
  });

  it("handles a trip with no journeys at all", () => {
    const report = buildTransportationReport([day(1, [item("a", [])])]);
    expect(report.journeyCount).toBe(0);
    expect(report.byMode).toEqual([]);
    expect(report.longestJourney).toBeNull();
    expect(report.totalMinutes).toBe(0);
  });

  it("handles an empty trip", () => {
    const report = buildTransportationReport([]);
    expect(report.days).toEqual([]);
    expect(report.journeyCount).toBe(0);
  });

  it("tolerates a leg with no distance recorded", () => {
    const noDistance = { ...leg("UBER", 0, 20, 4_200), distanceMeters: null };
    const report = buildTransportationReport([day(1, [item("a", [noDistance])])]);
    expect(report.totalMeters).toBe(0);
    expect(report.totalCostCents).toBe(4_200);
  });
});
