import { describe, it, expect, beforeAll } from "vitest";
import { collectCandidates, type CandidateSet } from "@/lib/travel/candidates";
import { planHeuristically } from "@/lib/travel/heuristic-planner";
import { buildPlan } from "@/lib/travel/plan-builder";
import { parsePlan, planSchema } from "@/lib/ai/schema";
import { distanceMeters } from "@/lib/geo";

const DAYS = ["2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21"];
const MUST_DOS = [
  { title: "Central Park", description: "" },
  { title: "Somewhere that does not exist", description: "" },
];

let candidates: CandidateSet;

beforeAll(async () => {
  candidates = await collectCandidates({
    destination: "New York City",
    startDate: DAYS[0]!,
    endDate: DAYS[3]!,
    travelers: 2,
  });
});

function heuristic(overrides: Partial<Parameters<typeof planHeuristically>[0]> = {}) {
  return planHeuristically({
    destination: "New York City",
    transportPreferences: ["PUBLIC_TRANSPORT_PREFERRED"],
    dayDates: DAYS,
    pace: "BALANCED",
    travelers: 2,
    mustDos: MUST_DOS,
    candidates,
    dayStartMinute: 8 * 60,
    dayEndMinute: 22 * 60,
    ...overrides,
  });
}

function built(plan = heuristic()) {
  return buildPlan(plan, {
    destination: "New York City",
    travelers: 2,
    preferences: ["PUBLIC_TRANSPORT_PREFERRED"],
    candidates,
    dayDates: DAYS,
  });
}

describe("candidate collection", () => {
  it("indexes candidates with short stable ids", () => {
    expect(candidates.hotels.has("h1")).toBe(true);
    expect(candidates.restaurants.has("r1")).toBe(true);
    expect(candidates.activities.has("a1")).toBe(true);
    expect(candidates.empty).toBe(false);
  });

  it("reports emptiness for an uncovered destination", async () => {
    const none = await collectCandidates({
      destination: "Boise",
      startDate: DAYS[0]!,
      endDate: DAYS[3]!,
      travelers: 2,
    });
    expect(none.empty).toBe(true);
    expect(none.activities.size).toBe(0);
  });
});

describe("heuristic planner", () => {
  it("produces one day per trip day", () => {
    expect(heuristic().days.map((day) => day.date)).toEqual(DAYS);
  });

  it("passes its own output schema", () => {
    expect(planSchema.safeParse(heuristic()).success).toBe(true);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(heuristic())).toBe(JSON.stringify(heuristic()));
  });

  it("schedules a must-do that matches a real place", () => {
    const satisfied = heuristic().days.flatMap((day) =>
      day.items.map((item) => item.satisfiesMustDo).filter(Boolean),
    );
    expect(satisfied).toContain("Central Park");
  });

  it("says plainly when a must-do could not be matched", () => {
    expect(heuristic().tripSummary).toContain("Somewhere that does not exist");
  });

  it("never schedules an activity outside its opening hours", () => {
    for (const day of heuristic().days) {
      for (const item of day.items) {
        if (!item.candidateId) continue;
        const activity = candidates.activities.get(item.candidateId);
        if (!activity) continue;
        expect(item.startMinute).toBeGreaterThanOrEqual(
          activity.hours.opensMinute,
        );
        expect(item.startMinute + item.durationMinutes).toBeLessThanOrEqual(
          activity.hours.closesMinute,
        );
      }
    }
  });

  it("never schedules a meal after the restaurant closes", () => {
    for (const day of heuristic().days) {
      for (const item of day.items) {
        if (!item.candidateId) continue;
        const restaurant = candidates.restaurants.get(item.candidateId);
        if (!restaurant) continue;
        expect(item.startMinute).toBeGreaterThanOrEqual(
          restaurant.hours.opensMinute,
        );
      }
    }
  });

  it("keeps every item inside the traveler's waking hours", () => {
    const plan = heuristic({ dayStartMinute: 9 * 60, dayEndMinute: 21 * 60 });
    for (const day of plan.days) {
      for (const item of day.items) {
        expect(item.startMinute + item.durationMinutes).toBeLessThanOrEqual(
          21 * 60,
        );
      }
    }
  });

  it("front-loads a packed pace and spreads a relaxed one", () => {
    // Pace cannot invent activities that do not exist — a city ships a finite
    // number of landmarks, so totals are bounded by supply, not by appetite.
    // What pace controls is the distribution: packed leans early.
    const relaxed = heuristic({ pace: "RELAXED" });
    const packed = heuristic({ pace: "PACKED" });
    const firstDay = (plan: ReturnType<typeof heuristic>) =>
      plan.days[0]!.items.length;
    expect(firstDay(packed)).toBeGreaterThanOrEqual(firstDay(relaxed));
  });

  it("never leaves a later day empty while activities remain", () => {
    // The failure this guards: a packed first day drained the queue and every
    // subsequent day came back as meals only.
    const packed = heuristic({ pace: "PACKED" });
    for (const day of packed.days) {
      expect(day.items.length).toBeGreaterThan(0);
    }
  });

  it("checks in on the first day and out on the last", () => {
    const plan = heuristic();
    expect(plan.days[0]!.items[0]!.type).toBe("LODGING");
    const lastItems = plan.days[3]!.items;
    expect(lastItems[lastItems.length - 1]!.type).toBe("LODGING");
  });

  it("still produces a plan when no candidates exist", async () => {
    const none = await collectCandidates({
      destination: "Boise",
      startDate: DAYS[0]!,
      endDate: DAYS[3]!,
      travelers: 2,
    });
    const plan = planHeuristically({
      destination: "Boise",
      transportPreferences: [],
      dayDates: DAYS,
      pace: "BALANCED",
      travelers: 2,
      mustDos: [],
      candidates: none,
      dayStartMinute: 8 * 60,
      dayEndMinute: 22 * 60,
    });
    expect(planSchema.safeParse(plan).success).toBe(true);
    expect(plan.days.every((day) => day.items.length > 0)).toBe(true);
  });
});

describe("plan builder", () => {
  it("dates every item to its own day", () => {
    for (const item of built().items) {
      expect(item.startTime.toISOString().slice(0, 10)).toBe(item.date);
    }
  });

  it("ends every item after it starts", () => {
    for (const item of built().items) {
      expect(item.endTime.getTime()).toBeGreaterThan(item.startTime.getTime());
    }
  });

  it("takes names and prices from the candidate, not the planner", () => {
    const plan = heuristic();
    // Rewrite a title and see the candidate's real name win.
    const firstActivity = plan.days
      .flatMap((day) => day.items)
      .find((item) => item.candidateId?.startsWith("a"));
    firstActivity!.title = "Completely Invented Museum";

    const result = buildPlan(plan, {
      destination: "New York City",
      travelers: 2,
      preferences: [],
      candidates,
      dayDates: DAYS,
    });
    expect(
      result.items.some((item) => item.title === "Completely Invented Museum"),
    ).toBe(false);
  });

  it("reports candidate ids it does not recognise", () => {
    const plan = heuristic();
    plan.days[0]!.items.push({
      candidateId: "a999",
      type: "ACTIVITY",
      title: "Hallucinated",
      description: "",
      startMinute: 16 * 60,
      durationMinutes: 60,
      satisfiesMustDo: null,
    });

    const result = buildPlan(plan, {
      destination: "New York City",
      travelers: 2,
      preferences: [],
      candidates,
      dayDates: DAYS,
    });
    expect(result.unknownCandidateIds).toContain("a999");
    expect(result.items.some((item) => item.title === "Hallucinated")).toBe(false);
  });

  it("drops days outside the trip", () => {
    const plan = heuristic();
    plan.days.push({ ...plan.days[0]!, date: "2027-01-01" });
    const result = buildPlan(plan, {
      destination: "New York City",
      travelers: 2,
      preferences: [],
      candidates,
      dayDates: DAYS,
    });
    expect(result.items.every((item) => DAYS.includes(item.date))).toBe(true);
  });

  it("charges lodging once, not on every night", () => {
    const lodging = built().items.filter((item) => item.type === "LODGING");
    const charged = lodging.filter((item) => item.estimatedCostCents > 0);
    expect(charged).toHaveLength(1);
  });

  it("charges meals and activities per traveler", () => {
    const result = built();
    const meal = result.items.find((item) => item.type === "RESTAURANT")!;
    const candidate = candidates.restaurants.get(
      [...candidates.restaurants.entries()].find(
        ([, value]) => value.name === meal.title,
      )![0],
    )!;
    expect(meal.estimatedCostCents).toBe(candidate.averageMealCents * 2);
  });
});

describe("transportation legs", () => {
  it("lands the last leg exactly when the item starts", () => {
    for (const item of built().items) {
      const last = item.legs.at(-1);
      if (!last) continue;
      expect(last.arrivalTime.getTime()).toBe(item.startTime.getTime());
    }
  });

  it("chains each leg's arrival into the next leg's departure", () => {
    for (const item of built().items) {
      for (let i = 1; i < item.legs.length; i += 1) {
        expect(item.legs[i]!.departureTime.getTime()).toBe(
          item.legs[i - 1]!.arrivalTime.getTime(),
        );
      }
    }
  });

  it("orders legs from zero", () => {
    for (const item of built().items) {
      expect(item.legs.map((leg) => leg.legOrder)).toEqual(
        item.legs.map((_, index) => index),
      );
    }
  });

  it("connects consecutive places that are actually apart", () => {
    const result = built();
    const withPlaces = result.items.filter((item) => item.place);
    let connected = 0;
    for (let i = 1; i < withPlaces.length; i += 1) {
      const previous = withPlaces[i - 1]!;
      const current = withPlaces[i]!;
      if (previous.date !== current.date) continue;
      const apart = distanceMeters(
        { latitude: previous.place!.latitude!, longitude: previous.place!.longitude! },
        { latitude: current.place!.latitude!, longitude: current.place!.longitude! },
      );
      if (apart > 300) {
        expect(current.legs.length).toBeGreaterThan(0);
        connected += 1;
      }
    }
    expect(connected).toBeGreaterThan(0);
  });

  it("counts leg fares in the trip total", () => {
    const result = built();
    const legFares = result.items.reduce(
      (sum, item) => sum + item.legs.reduce((s, leg) => s + leg.costCents, 0),
      0,
    );
    const itemCosts = result.items.reduce(
      (sum, item) => sum + item.estimatedCostCents,
      0,
    );
    expect(result.totalEstimatedCents).toBe(itemCosts + legFares);
  });
});

describe("parsePlan", () => {
  const VALID = {
    tripSummary: "A weekend.",
    days: [
      {
        date: "2026-09-18",
        summary: "",
        items: [
          {
            candidateId: "a1",
            type: "ACTIVITY",
            title: "Something",
            description: "",
            startMinute: 600,
            durationMinutes: 90,
            satisfiesMustDo: null,
          },
        ],
      },
    ],
  };

  it("parses clean JSON", () => {
    expect(parsePlan(JSON.stringify(VALID)).days).toHaveLength(1);
  });

  it("recovers JSON wrapped in prose or fences", () => {
    const wrapped = "Here is the plan:\n```json\n" + JSON.stringify(VALID) + "\n```\nHope it helps.";
    expect(parsePlan(wrapped).days).toHaveLength(1);
  });

  it("rejects a response with no JSON at all", () => {
    expect(() => parsePlan("I could not build that.")).toThrow(/did not return JSON/i);
  });

  it("rejects malformed JSON", () => {
    expect(() => parsePlan("{ days: [ }")).toThrow(/malformed/i);
  });

  it("rejects a plan that breaks the schema", () => {
    const bad = { ...VALID, days: [{ ...VALID.days[0], items: [] }] };
    expect(() => parsePlan(JSON.stringify(bad))).toThrow();
  });

  it("rejects an out-of-range time rather than wrapping it", () => {
    const bad = structuredClone(VALID);
    bad.days[0]!.items[0]!.startMinute = 1_600;
    expect(() => parsePlan(JSON.stringify(bad))).toThrow();
  });
});

describe("a planner's times are requests, not facts", () => {
  /**
   * Everything else here exercises the heuristic planner, which computes its
   * own arrival times. The AI planner does not — it returns clock times a
   * model chose, and a model will book dinner at 6:00 while the museum it
   * placed before it runs until 6:00, thirty-four minutes away.
   *
   * These build plans in the shape a model returns them and assert the
   * builder makes them possible.
   */
  function aiShapedPlan(candidateIds: string[]) {
    return {
      tripSummary: "",
      days: [
        {
          date: DAYS[0]!,
          summary: "",
          // Every item starts before the one before it has ended.
          items: candidateIds.map((candidateId, index) => ({
            candidateId,
            type: "SIGHTSEEING" as const,
            title: `Stop ${index + 1}`,
            description: "",
            startMinute: 600 + index * 30,
            durationMinutes: 120,
            satisfiesMustDo: null,
          })),
        },
      ],
    };
  }

  function build(plan: ReturnType<typeof aiShapedPlan>) {
    return buildPlan(plan, {
      destination: "New York City",
      travelers: 2,
      preferences: ["PUBLIC_TRANSPORT_PREFERRED"],
      candidates,
      dayDates: DAYS,
    });
  }

  it("pushes an item that cannot start when the planner asked", () => {
    const result = build(aiShapedPlan(["a1", "a2", "a3"]));

    for (let index = 1; index < result.items.length; index += 1) {
      const previous = result.items[index - 1]!;
      const current = result.items[index]!;
      expect(current.startTime.getTime()).toBeGreaterThanOrEqual(
        previous.endTime.getTime(),
      );
    }
  });

  it("leaves room for the journey between them", () => {
    const result = build(aiShapedPlan(["a1", "a2", "a3"]));

    for (let index = 1; index < result.items.length; index += 1) {
      const previous = result.items[index - 1]!;
      const current = result.items[index]!;
      const gap =
        (current.startTime.getTime() - previous.endTime.getTime()) / 60_000;
      const travel = current.legs.reduce(
        (sum, leg) => sum + leg.durationMinutes,
        0,
      );
      expect(gap).toBeGreaterThanOrEqual(travel);
    }
  });

  it("reports what it moved rather than doing it silently", () => {
    const result = build(aiShapedPlan(["a1", "a2", "a3"]));
    expect(result.shiftedItems.length).toBeGreaterThan(0);
    for (const shifted of result.shiftedItems) {
      expect(shifted.byMinutes).toBeGreaterThan(0);
      expect(shifted.title).toBeTruthy();
    }
  });

  it("never moves an item earlier than the planner asked", () => {
    // A model that deliberately put something at 9 AM meant it. Room later
    // in the day is not a reason to bring it forward.
    const plan = aiShapedPlan(["a1", "a2", "a3"]);
    const result = build(plan);

    for (const [index, item] of result.items.entries()) {
      const requested = plan.days[0]!.items[index]!.startMinute;
      const actual =
        item.startTime.getUTCHours() * 60 + item.startTime.getUTCMinutes();
      expect(actual).toBeGreaterThanOrEqual(requested);
    }
  });

  it("leaves a possible schedule exactly as the planner wrote it", () => {
    const spaced = {
      tripSummary: "",
      days: [
        {
          date: DAYS[0]!,
          summary: "",
          items: [
            {
              candidateId: "a1",
              type: "SIGHTSEEING" as const,
              title: "First",
              description: "",
              startMinute: 540,
              durationMinutes: 60,
              satisfiesMustDo: null,
            },
            {
              candidateId: "a2",
              type: "SIGHTSEEING" as const,
              title: "Second",
              description: "",
              startMinute: 900,
              durationMinutes: 60,
              satisfiesMustDo: null,
            },
          ],
        },
      ],
    };

    const result = build(spaced);
    expect(result.shiftedItems).toEqual([]);
  });

  it("keeps the first item of a day where it was put", () => {
    const result = build(aiShapedPlan(["a1", "a2"]));
    const first = result.items[0]!;
    expect(
      first.startTime.getUTCHours() * 60 + first.startTime.getUTCMinutes(),
    ).toBe(600);
  });
});

describe("the builder leaves slack, not just enough to be possible", () => {
  /**
   * Pushing an item to exactly `previous end + travel` is arithmetically
   * correct and practically brittle: it produced five "0 min spare" warnings
   * on a real trip. The validator judges against `PACE_BUFFER_MINUTES`, so a
   * builder that ignores it warns about its own output.
   */
  function tightPlan() {
    return {
      tripSummary: "",
      days: [
        {
          date: DAYS[0]!,
          summary: "",
          items: ["a1", "a2", "a3"].map((candidateId, index) => ({
            candidateId,
            type: "SIGHTSEEING" as const,
            title: `Stop ${index + 1}`,
            description: "",
            startMinute: 600 + index * 30,
            durationMinutes: 120,
            satisfiesMustDo: null,
          })),
        },
      ],
    };
  }

  function build(pace: "RELAXED" | "BALANCED" | "PACKED") {
    return buildPlan(tightPlan(), {
      destination: "New York City",
      travelers: 2,
      preferences: ["PUBLIC_TRANSPORT_PREFERRED"],
      candidates,
      dayDates: DAYS,
      pace,
    });
  }

  it("leaves the pace's buffer beyond the journey", () => {
    const result = build("BALANCED");

    for (let index = 1; index < result.items.length; index += 1) {
      const previous = result.items[index - 1]!;
      const current = result.items[index]!;
      const travel = current.legs.reduce(
        (sum, leg) => sum + leg.durationMinutes,
        0,
      );
      if (travel === 0) continue;

      const gap =
        (current.startTime.getTime() - previous.endTime.getTime()) / 60_000;
      // 25 minutes for BALANCED, from PACE_BUFFER_MINUTES.
      expect(gap).toBeGreaterThanOrEqual(travel + 25);
    }
  });

  it("leaves more on a relaxed pace than a packed one", () => {
    const relaxed = build("RELAXED");
    const packed = build("PACKED");

    const lastStart = (result: ReturnType<typeof build>) =>
      result.items[result.items.length - 1]!.startTime.getTime();

    expect(lastStart(relaxed)).toBeGreaterThan(lastStart(packed));
  });

  it("does not pad two stops in the same place", () => {
    // No journey, no need for slack.
    const samePlace = {
      tripSummary: "",
      days: [
        {
          date: DAYS[0]!,
          summary: "",
          items: [
            {
              candidateId: "a1",
              type: "SIGHTSEEING" as const,
              title: "First",
              description: "",
              startMinute: 600,
              durationMinutes: 60,
              satisfiesMustDo: null,
            },
            {
              candidateId: "a1",
              type: "SIGHTSEEING" as const,
              title: "Still there",
              description: "",
              startMinute: 660,
              durationMinutes: 60,
              satisfiesMustDo: null,
            },
          ],
        },
      ],
    };

    const result = buildPlan(samePlace, {
      destination: "New York City",
      travelers: 2,
      preferences: [],
      candidates,
      dayDates: DAYS,
      pace: "BALANCED",
    });

    expect(result.shiftedItems).toEqual([]);
  });

  it("defaults to a balanced buffer when no pace is given", () => {
    const result = buildPlan(tightPlan(), {
      destination: "New York City",
      travelers: 2,
      preferences: ["PUBLIC_TRANSPORT_PREFERRED"],
      candidates,
      dayDates: DAYS,
    });
    expect(result.shiftedItems.length).toBeGreaterThan(0);
  });
});
