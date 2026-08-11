import { describe, it, expect } from "vitest";
import { collectCandidates } from "@/lib/travel/candidates";
import { planHeuristically } from "@/lib/travel/heuristic-planner";

/**
 * Invariants on the planner's own output.
 *
 * No pipeline, no hand-built rows, no mappers. Earlier regressions slipped
 * through because the tests around them reconstructed the pipeline by hand
 * and diverged from it. These assert what `planHeuristically` returns and
 * nothing else.
 */

const DAYS = [
  "2026-12-16",
  "2026-12-17",
  "2026-12-18",
  "2026-12-19",
  "2026-12-20",
];

async function plan(mustDos: { title: string; description: string }[]) {
  const candidates = await collectCandidates({
    destination: "New York City",
    startDate: DAYS[0]!,
    endDate: DAYS[4]!,
    travelers: 2,
  });

  return planHeuristically({
    destination: "New York City",
    transportPreferences: [],
    dayDates: DAYS,
    pace: "BALANCED",
    travelers: 2,
    mustDos,
    candidates,
    dayStartMinute: 8 * 60,
    dayEndMinute: 22 * 60,
  });
}

const CHRISTMAS_MUST_DOS = [
  { title: "Empire State Building", description: "" },
  { title: "Brooklyn DUMBO", description: "" },
  { title: "FAO Shwartz", description: "" },
];

describe("no candidate is scheduled twice", () => {
  it("uses each activity at most once across the whole trip", async () => {
    const result = await plan(CHRISTMAS_MUST_DOS);

    const counts = new Map<string, number>();
    for (const day of result.days) {
      for (const item of day.items) {
        if (item.type !== "ACTIVITY" && item.type !== "SIGHTSEEING") continue;
        counts.set(item.title, (counts.get(item.title) ?? 0) + 1);
      }
    }

    const repeated = [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([title, count]) => `${title} x${count}`);

    expect(repeated).toEqual([]);
  });

  it("uses each candidate id at most once", async () => {
    const result = await plan(CHRISTMAS_MUST_DOS);

    const ids = result.days
      .flatMap((day) => day.items)
      .map((item) => item.candidateId)
      .filter((id): id is string => id !== null && id.startsWith("a"));

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("holds when a must-do title matches an activity name exactly", async () => {
    // "Empire State Building" is both a must-do and a candidate name. That
    // overlap is what produced three copies of it on one day.
    const result = await plan([
      { title: "Empire State Building", description: "" },
    ]);

    const appearances = result.days
      .flatMap((day) => day.items)
      .filter((item) => item.title === "Empire State Building");

    expect(appearances).toHaveLength(1);
  });

  it("holds when two must-dos match the same activity", async () => {
    const result = await plan([
      { title: "Empire State Building", description: "" },
      { title: "Empire State", description: "" },
    ]);

    const appearances = result.days
      .flatMap((day) => day.items)
      .filter((item) => item.title === "Empire State Building");

    expect(appearances).toHaveLength(1);
  });

  it("holds with no must-dos at all", async () => {
    const result = await plan([]);
    const ids = result.days
      .flatMap((day) => day.items)
      .map((item) => item.candidateId)
      .filter((id): id is string => id !== null && id.startsWith("a"));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("no item overlaps another on the same day", () => {
  it("leaves each item finished before the next begins", async () => {
    const result = await plan(CHRISTMAS_MUST_DOS);

    for (const day of result.days) {
      const ordered = [...day.items].sort(
        (a, b) => a.startMinute - b.startMinute,
      );
      for (let index = 1; index < ordered.length; index += 1) {
        const previous = ordered[index - 1]!;
        const current = ordered[index]!;
        const previousEnd = previous.startMinute + previous.durationMinutes;
        expect(
          current.startMinute,
          `${current.title} starts before ${previous.title} ends on ${day.date}`,
        ).toBeGreaterThanOrEqual(previousEnd);
      }
    }
  });
});
