import { describe, it, expect } from "vitest";
import { collectCandidates } from "@/lib/travel/candidates";
import { planHeuristically } from "@/lib/travel/heuristic-planner";
import { buildPlan } from "@/lib/travel/plan-builder";
import { validateItinerary } from "@/lib/travel/validate-itinerary";
import { toItineraryDay } from "@/lib/repositories/mappers";

/**
 * The trip that exposed three defects two runs in a row.
 *
 * Kept as a permanent regression: same destination, same dates, same
 * must-dos, two of which match nothing. If any of these come back, this fails
 * before a screenshot has to.
 */

const DAYS = [
  "2026-12-16",
  "2026-12-17",
  "2026-12-18",
  "2026-12-19",
  "2026-12-20",
];

const MUST_DOS = [
  { title: "Empire State Building", description: "" },
  { title: "Brooklyn DUMBO", description: "" },
  { title: "FAO Shwartz", description: "" },
];

async function build() {
  const candidates = await collectCandidates({
    destination: "New York City",
    startDate: DAYS[0]!,
    endDate: DAYS[4]!,
    travelers: 2,
  });

  const plan = planHeuristically({
    destination: "New York City",
    transportPreferences: [],
    dayDates: DAYS,
    pace: "BALANCED",
    travelers: 2,
    mustDos: MUST_DOS,
    candidates,
    dayStartMinute: 8 * 60,
    dayEndMinute: 22 * 60,
  });

  const built = buildPlan(plan, {
    destination: "New York City",
    travelers: 2,
    preferences: [],
    candidates,
    dayDates: DAYS,
  });

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
              providerRef: item.place.providerRef ?? null,
              providerName: item.place.providerName ?? null,
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

describe("Christmas in the Big Apple", () => {
  it("produces a schedule that can actually be followed", async () => {
    const days = await build();
    const report = validateItinerary(days, {
      pace: "BALANCED",
      dayStartMinute: 8 * 60,
      dayEndMinute: 22 * 60,
    });

    const errors = report.warnings
      .filter((entry) => entry.severity === "ERROR")
      .map((entry) => entry.message);

    expect(errors).toEqual([]);
    expect(report.possible).toBe(true);
  });

  it("gives every day something to do", async () => {
    const days = await build();
    const counts = days.map((day) => day.items.length);
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(3);
  });

  it("never schedules one place twice in a day", async () => {
    const days = await build();
    for (const day of days) {
      const titles = day.items
        .filter((item) => item.type !== "LODGING")
        .map((item) => item.title);
      expect(new Set(titles).size).toBe(titles.length);
    }
  });

  it("schedules the must-do that matches a real place", async () => {
    const days = await build();
    const titles = days.flatMap((day) => day.items.map((item) => item.title));
    expect(titles).toContain("Empire State Building");
  });
});

describe("the planner does not warn about its own work", () => {
  it("leaves at least the pace's buffer between consecutive stops", async () => {
    const days = await build();
    const report = validateItinerary(days, {
      pace: "BALANCED",
      dayStartMinute: 8 * 60,
      dayEndMinute: 22 * 60,
    });

    // A tight connection the planner created itself is a disagreement between
    // two parts of this codebase, not a fact about the trip. Warnings about
    // the traveler's own choices are fine; these are not.
    const selfInflicted = report.warnings
      .filter(
        (entry) =>
          entry.code === "TIGHT_CONNECTION" ||
          entry.code === "INSUFFICIENT_TRAVEL_TIME" ||
          entry.code === "MISSING_TRANSPORTATION" ||
          entry.code === "OVERLAP",
      )
      .map((entry) => `${entry.code}: ${entry.message}`);

    expect(selfInflicted).toEqual([]);
  });
});
