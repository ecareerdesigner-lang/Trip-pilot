import { describe, it, expect } from "vitest";
import { collectCandidates } from "@/lib/travel/candidates";
import {
  findSchedulingProblems,
  planHeuristically,
} from "@/lib/travel/heuristic-planner";

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

describe("must-dos match places despite punctuation and wording", () => {
  it("matches a must-do written without punctuation", async () => {
    // "911 memorial" against "9/11 Memorial & Museum": neither string
    // contains the other, and substring matching missed it entirely.
    const result = await plan([{ title: "911 memorial", description: "" }]);
    const satisfied = result.days
      .flatMap((day) => day.items)
      .filter((item) => item.satisfiesMustDo === "911 memorial");

    expect(satisfied).toHaveLength(1);
    expect(satisfied[0]!.title).toContain("9/11");
  });

  it("matches a shortened name", async () => {
    const result = await plan([
      { title: "Statue of Liberty", description: "" },
    ]);
    const titles = result.days
      .flatMap((day) => day.items)
      .filter((item) => item.satisfiesMustDo !== null)
      .map((item) => item.title);
    expect(titles).toContain("Statue of Liberty");
  });

  it("matches when the traveler adds a filler word", async () => {
    const result = await plan([
      { title: "visit the Empire State Building", description: "" },
    ]);
    const satisfied = result.days
      .flatMap((day) => day.items)
      .filter((item) => item.satisfiesMustDo !== null);
    expect(satisfied.map((item) => item.title)).toContain(
      "Empire State Building",
    );
  });

  it("does not match two unrelated places", async () => {
    // Loose matching that pairs anything with anything is worse than none.
    const result = await plan([
      { title: "a hot air balloon ride", description: "" },
    ]);
    const satisfied = result.days
      .flatMap((day) => day.items)
      .filter((item) => item.satisfiesMustDo === "a hot air balloon ride");
    expect(satisfied).toEqual([]);
  });

  it("does not let one place satisfy two must-dos", async () => {
    const result = await plan([
      { title: "911 memorial", description: "" },
      { title: "9/11 Memorial & Museum", description: "" },
    ]);
    const matched = result.days
      .flatMap((day) => day.items)
      .filter((item) => item.title.includes("9/11"));
    expect(matched).toHaveLength(1);
  });
});

describe("the planner never emits an overlapping schedule", () => {
  /**
   * The catch-all for a class of bug found four times by screenshot: a meal
   * booked at its ideal hour while the traveler was still elsewhere, a
   * check-out clamped in front of the journey to it, an activity running past
   * a mealtime. Each was a different line treating a preferred time as a
   * target rather than the arrival as a floor.
   */
  const CASES: { name: string; mustDos: { title: string; description: string }[] }[] = [
    { name: "no must-dos", mustDos: [] },
    {
      name: "a long must-do that cannot fit between meals",
      mustDos: [{ title: "Statue of Liberty", description: "" }],
    },
    {
      name: "several must-dos",
      mustDos: [
        { title: "Statue of Liberty", description: "" },
        { title: "911 memorial", description: "" },
        { title: "Empire State Building", description: "" },
      ],
    },
    {
      name: "must-dos that match nothing",
      mustDos: [
        { title: "Brooklyn DUMBO", description: "" },
        { title: "FAO Shwartz", description: "" },
      ],
    },
  ];

  it.each(CASES)("with $name", async ({ mustDos }) => {
    const result = await plan(mustDos);
    const problems = findSchedulingProblems(result);
    expect(problems.map((problem) => `${problem.date}: ${problem.message}`)).toEqual(
      [],
    );
  });

  it("holds for every pace", async () => {
    for (const pace of ["RELAXED", "BALANCED", "PACKED"] as const) {
      const candidates = await collectCandidates({
        destination: "New York City",
        startDate: DAYS[0]!,
        endDate: DAYS[4]!,
        travelers: 2,
      });
      const result = planHeuristically({
        destination: "New York City",
        transportPreferences: [],
        dayDates: DAYS,
        pace,
        travelers: 2,
        mustDos: [{ title: "Statue of Liberty", description: "" }],
        candidates,
        dayStartMinute: 8 * 60,
        dayEndMinute: 22 * 60,
      });
      expect(findSchedulingProblems(result), `pace ${pace}`).toEqual([]);
    }
  });

  it("holds in a city with no subway", async () => {
    const candidates = await collectCandidates({
      destination: "Orlando",
      startDate: DAYS[0]!,
      endDate: DAYS[4]!,
      travelers: 2,
    });
    const result = planHeuristically({
      destination: "Orlando",
      transportPreferences: [],
      dayDates: DAYS,
      pace: "BALANCED",
      travelers: 2,
      mustDos: [],
      candidates,
      dayStartMinute: 8 * 60,
      dayEndMinute: 22 * 60,
    });
    expect(findSchedulingProblems(result)).toEqual([]);
  });
});

describe("the planner respects the traveler's stated hours", () => {
  it("finishes everything before the day is meant to end", async () => {
    // "The Seafood trattoria runs until 10:45 PM, later than the 10:00 PM you
    // asked to finish" — a symptom of meals being booked at their ideal hour
    // rather than after the traveler had actually arrived.
    const result = await plan([
      { title: "Statue of Liberty", description: "" },
    ]);

    const late: string[] = [];
    for (const day of result.days) {
      for (const item of day.items) {
        const ends = item.startMinute + item.durationMinutes;
        if (ends > 22 * 60) {
          late.push(`${day.date}: ${item.title} ends at ${ends} minutes`);
        }
      }
    }

    expect(late).toEqual([]);
  });

  it("does not start anything before the day is meant to begin", async () => {
    const result = await plan([]);
    for (const day of result.days) {
      for (const item of day.items) {
        expect(item.startMinute).toBeGreaterThanOrEqual(8 * 60);
      }
    }
  });
});
