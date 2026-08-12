import { describe, it, expect, beforeAll } from "vitest";
import { collectCandidates, type CandidateSet } from "@/lib/travel/candidates";
import { buildPlan } from "@/lib/travel/plan-builder";

/**
 * Adding slack to every connection compounds.
 *
 * A day with five tight connections gains five buffers, and the risk is that
 * an itinerary the model ended at 8 PM now ends near midnight. Worth knowing
 * how far it actually pushes before deciding whether the cascade needs a cap.
 */

const DAYS = ["2026-08-24", "2026-08-25"];

let candidates: CandidateSet;

beforeAll(async () => {
  candidates = await collectCandidates({
    destination: "New York City",
    startDate: DAYS[0]!,
    endDate: DAYS[1]!,
    travelers: 2,
  });
});

describe("buffer cascade", () => {
  it("does not push a full day past midnight", () => {
    // Six stops, each requested back to back — the worst case a model
    // realistically produces.
    const plan = {
      tripSummary: "",
      days: [
        {
          date: DAYS[0]!,
          summary: "",
          items: ["a1", "a2", "a3", "a4", "a5", "a6"].map(
            (candidateId, index) => ({
              candidateId,
              type: "SIGHTSEEING" as const,
              title: `Stop ${index + 1}`,
              description: "",
              startMinute: 540 + index * 90,
              durationMinutes: 90,
              satisfiesMustDo: null,
            }),
          ),
        },
      ],
    };

    const result = buildPlan(plan, {
      destination: "New York City",
      travelers: 2,
      preferences: ["PUBLIC_TRANSPORT_PREFERRED"],
      candidates,
      dayDates: DAYS,
      pace: "BALANCED",
    });

    const last = result.items[result.items.length - 1]!;
    const endsAtMinute =
      last.endTime.getUTCHours() * 60 + last.endTime.getUTCMinutes();

    // The day may run late; it must not run into the next one.
    expect(last.endTime.toISOString().slice(0, 10)).toBe(DAYS[0]);
    expect(endsAtMinute).toBeLessThan(24 * 60);
  });

  it("keeps every item on the day it was planned for", () => {
    const plan = {
      tripSummary: "",
      days: [
        {
          date: DAYS[0]!,
          summary: "",
          items: ["a1", "a2", "a3", "a4"].map((candidateId, index) => ({
            candidateId,
            type: "SIGHTSEEING" as const,
            title: `Stop ${index + 1}`,
            description: "",
            startMinute: 1_200 + index * 20,
            durationMinutes: 60,
            satisfiesMustDo: null,
          })),
        },
      ],
    };

    const result = buildPlan(plan, {
      destination: "New York City",
      travelers: 2,
      preferences: ["PUBLIC_TRANSPORT_PREFERRED"],
      candidates,
      dayDates: DAYS,
      pace: "BALANCED",
    });

    // Starting at 8 PM with four stops is a request that cannot be honoured
    // in full. It must still not silently spill onto tomorrow.
    for (const item of result.items) {
      expect(item.startTime.toISOString().slice(0, 10)).toBe(item.date);
    }
  });
});
