import { describe, it, expect, beforeAll } from "vitest";
import { collectCandidates, type CandidateSet } from "@/lib/travel/candidates";
import { planHeuristically } from "@/lib/travel/heuristic-planner";
import { buildPlan } from "@/lib/travel/plan-builder";
import { validateItinerary } from "@/lib/travel/validate-itinerary";
import { toItineraryDay } from "@/lib/repositories/mappers";
import type { ItineraryDay } from "@/types/view";

/**
 * End-to-end: plan, build, validate.
 *
 * This is the test that would have caught the bug the first real run exposed
 * — the planner spacing items by a flat 35 minutes while the router said the
 * journey took 37, so the reality-check engine condemned schedules the
 * planner had just produced. A generated itinerary must survive its own
 * validator.
 */

const DAYS = ["2026-12-16", "2026-12-17", "2026-12-18", "2026-12-19", "2026-12-20"];

const MUST_DOS = [
  { title: "Empire State Building", description: "" },
  { title: "Central Park", description: "" },
  // These match no candidate, exactly like the real trip's "Brooklyn DUMBO"
  // and "FAO Shwartz". They must not be silently dropped or double-placed.
  { title: "Brooklyn DUMBO", description: "" },
  { title: "FAO Shwartz", description: "" },
];

async function runPipeline(
  destination: string,
  mustDos: { title: string; description: string }[] = MUST_DOS,
): Promise<ItineraryDay[]> {
  const candidates: CandidateSet = await collectCandidates({
    destination,
    startDate: DAYS[0]!,
    endDate: DAYS[4]!,
    travelers: 2,
  });

  const plan = planHeuristically({
    destination,
    transportPreferences: ["PUBLIC_TRANSPORT_PREFERRED"],
    dayDates: DAYS,
    pace: "BALANCED",
    travelers: 2,
    mustDos,
    candidates,
    dayStartMinute: 8 * 60,
    dayEndMinute: 22 * 60,
  });

  const built = buildPlan(plan, {
    destination,
    travelers: 2,
    preferences: ["PUBLIC_TRANSPORT_PREFERRED"],
    candidates,
    dayDates: DAYS,
  });

  // Shape into the day rows the validator consumes.
  const byDate = new Map<string, typeof built.items>();
  for (const item of built.items) {
    const list = byDate.get(item.date) ?? [];
    list.push(item);
    byDate.set(item.date, list);
  }

  return DAYS.map((date, index) =>
    toItineraryDay({
      id: `d${index}`,
      dayNumber: index + 1,
      date: new Date(`${date}T00:00:00.000Z`),
      summary: null,
      itineraryItems: (byDate.get(date) ?? []).map((item, position) => ({
        id: item.key,
        type: item.type,
        title: item.title,
        description: item.description || null,
        startTime: item.startTime,
        endTime: item.endTime,
        durationMinutes: item.durationMinutes,
        estimatedCostCents: item.estimatedCostCents,
        reservationRequired: item.reservationRequired,
        reservationStatus: item.reservationStatus,
        priority: item.priority,
        source: item.satisfiesMustDo ? "MUST_DO" : "AI_SUGGESTION",
        completed: false,
        isMock: true,
        sortOrder: position,
        location: item.place
          ? {
              name: item.place.name,
              latitude: item.place.latitude ?? null,
              longitude: item.place.longitude ?? null,
            }
          : null,
        inboundLegs: item.legs.map((leg) => ({
          id: `${item.key}-${leg.legOrder}`,
          mode: leg.mode,
          durationMinutes: leg.durationMinutes,
          distanceMeters: leg.distanceMeters,
          estimatedCostCents: leg.costCents,
          instructions: leg.instructions,
          originLabel: leg.originLabel,
          destinationLabel: leg.destinationLabel,
          originLocation: null,
          destinationLocation: null,
          departureTime: leg.departureTime,
          arrivalTime: leg.arrivalTime,
          legOrder: leg.legOrder,
        })),
      })),
    }),
  );
}

describe("generated itineraries survive their own validator", () => {
  let days: ItineraryDay[];

  beforeAll(async () => {
    days = await runPipeline("New York City");
  });

  it("produces no blocking errors", () => {
    const report = validateItinerary(days, { pace: "BALANCED" });
    const errors = report.warnings.filter((entry) => entry.severity === "ERROR");
    expect(
      errors.map((entry) => `${entry.code}: ${entry.message}`),
    ).toEqual([]);
    expect(report.possible).toBe(true);
  });

  it("never schedules an item before the traveler could have arrived", () => {
    for (const day of days) {
      for (let index = 1; index < day.items.length; index += 1) {
        const previous = day.items[index - 1]!;
        const current = day.items[index]!;
        const gap =
          (Date.parse(current.startTime) - Date.parse(previous.endTime)) / 60_000;
        const travel = current.legs.reduce(
          (sum, leg) => sum + leg.durationMinutes,
          0,
        );
        expect(gap).toBeGreaterThanOrEqual(travel);
      }
    }
  });

  it("schedules something on every day", () => {
    for (const day of days) {
      expect(day.items.length).toBeGreaterThan(0);
    }
  });

  it("holds up in a city with no subway", async () => {
    const orlando = await runPipeline("Orlando");
    const report = validateItinerary(orlando, { pace: "BALANCED" });
    expect(
      report.warnings.filter((entry) => entry.severity === "ERROR"),
    ).toEqual([]);
  });

  it("holds up on a relaxed pace", async () => {
    const report = validateItinerary(days, { pace: "RELAXED" });
    expect(report.possible).toBe(true);
  });
});

/**
 * Guards for defects the first two real runs exposed. Each of these passed
 * the earlier version of this file, which is why they are stated explicitly
 * rather than left implicit in "no blocking errors".
 */
describe("a generated day is coherent", () => {
  let days: ItineraryDay[];

  beforeAll(async () => {
    days = await runPipeline("New York City");
  });

  it("never visits the same attraction twice", () => {
    // Restaurants may legitimately repeat — a five-day trip needs fifteen
    // meals and a city ships twelve restaurants, so eating somewhere twice
    // beats skipping dinner. Attractions are different: seeing the same
    // museum on two days is the queue misbehaving, not a choice.
    const seen = new Map<string, string[]>();
    for (const day of days) {
      for (const item of day.items) {
        if (!item.locationName) continue;
        if (item.type !== "SIGHTSEEING" && item.type !== "ACTIVITY") continue;
        const dates = seen.get(item.locationName) ?? [];
        dates.push(day.date);
        seen.set(item.locationName, dates);
      }
    }

    const repeated = [...seen.entries()]
      .filter(([, dates]) => dates.length > 1)
      .map(([name, dates]) => `${name} on ${dates.join(", ")}`);

    expect(repeated).toEqual([]);
  });

  it("never schedules the same place twice on one day", () => {
    // Within a single day there is no excuse: eating lunch and dinner at the
    // same counter, or visiting one museum twice, is a scheduling fault.
    for (const day of days) {
      const names = day.items
        .filter((item) => item.type !== "LODGING")
        .map((item) => item.title);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("spreads the trip instead of emptying later days", () => {
    const counts = days.map((day) => day.items.length);
    // A day with one stop next to a day with eight is not a plan, it is the
    // queue draining. No day may hold more than half the trip's stops.
    const total = counts.reduce((sum, count) => sum + count, 0);
    expect(Math.max(...counts)).toBeLessThanOrEqual(Math.ceil(total / 2));
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(2);
  });

  it("returns to the hotel with time to get there", () => {
    for (const day of days) {
      for (let index = 1; index < day.items.length; index += 1) {
        const previous = day.items[index - 1]!;
        const current = day.items[index]!;
        if (current.type !== "LODGING") continue;

        const gap =
          (Date.parse(current.startTime) - Date.parse(previous.endTime)) / 60_000;
        const travel = current.legs.reduce(
          (sum, leg) => sum + leg.durationMinutes,
          0,
        );
        expect(gap).toBeGreaterThanOrEqual(travel);
      }
    }
  });

  it("places every must-do that matches a real place", () => {
    const titles = days.flatMap((day) => day.items.map((item) => item.title));
    expect(titles).toContain("Empire State Building");
    expect(titles).toContain("Central Park");
  });
});
