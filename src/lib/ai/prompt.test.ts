import { describe, it, expect, beforeAll } from "vitest";
import { SYSTEM_PROMPT, buildUserPrompt } from "@/lib/ai/prompt";
import { CHAT_SYSTEM_PROMPT, buildChatPrompt } from "@/lib/ai/chat-prompt";
import type { ItineraryDay } from "@/types/view";

/** A two-day schedule, enough to check how dates are labelled. */
function buildChatPromptForTest(): string {
  const day = (dayNumber: number, date: string): ItineraryDay => ({
    id: `d${dayNumber}`,
    dayNumber,
    date,
    summary: null,
    items: [],
    totals: {
      itemCount: 0,
      plannedCents: 0,
      scheduledMinutes: 0,
      travelMinutes: 0,
      walkingMeters: 0,
      openMinutes: 0,
    },
    startsAt: null,
    endsAt: null,
  });

  return buildChatPrompt({
    destination: "New York City",
    days: [day(1, "2026-12-16"), day(2, "2026-12-17")],
    budget: null,
    currency: "USD",
    options: [],
    history: [],
    message: "move the museum to Thursday",
  });
}
import { collectCandidates, type CandidateSet } from "@/lib/travel/candidates";

let candidates: CandidateSet;

beforeAll(async () => {
  candidates = await collectCandidates({
    destination: "New York City",
    startDate: "2026-09-18",
    endDate: "2026-09-21",
    travelers: 2,
  });
});

function prompt(overrides: Partial<Parameters<typeof buildUserPrompt>[0]> = {}) {
  return buildUserPrompt({
    origin: "Charlotte, NC",
    destination: "New York City",
    dayDates: ["2026-09-18", "2026-09-19"],
    travelers: 2,
    pace: "BALANCED",
    foodPreference: "LOCAL_FAVORITES",
    transportPreferences: ["PUBLIC_TRANSPORT_PREFERRED"],
    mustDos: [{ title: "See a Broadway show", description: "Orchestra seats" }],
    notes: "Anniversary trip.",
    totalBudgetCents: 300_000,
    dayStartMinute: 8 * 60,
    dayEndMinute: 22 * 60,
    candidates,
    ...overrides,
  });
}

describe("system prompt", () => {
  it("forbids inventing facts and demands bare JSON", () => {
    expect(SYSTEM_PROMPT).toMatch(/do not invent/i);
    expect(SYSTEM_PROMPT).toMatch(/ONLY a JSON object/);
    expect(SYSTEM_PROMPT).toMatch(/never write an id that was not given/i);
  });

  it("states the must-do precedence rule", () => {
    expect(SYSTEM_PROMPT).toMatch(/must-dos are requirements/i);
  });
});

describe("user prompt", () => {
  it("includes every candidate id the planner may choose from", () => {
    const text = prompt();
    for (const id of candidates.hotels.keys()) expect(text).toContain(`${id} |`);
    for (const id of candidates.restaurants.keys()) expect(text).toContain(`${id} |`);
    for (const id of candidates.activities.keys()) expect(text).toContain(`${id} |`);
  });

  it("carries the facts the model must not have to recall", () => {
    const text = prompt();
    const activity = [...candidates.activities.values()][0]!;
    expect(text).toContain(activity.name);
    // Opening hours and duration must be present, or the model guesses them.
    expect(text).toMatch(/open \d{2}:\d{2}-\d{2}:\d{2}/);
    expect(text).toMatch(/typical visit \d+ min/);
  });

  it("lists must-dos before the options", () => {
    const text = prompt();
    expect(text.indexOf("MUST-DOS")).toBeLessThan(text.indexOf("LODGING OPTIONS"));
    expect(text).toContain("See a Broadway show");
    expect(text).toContain("Orchestra seats");
  });

  it("says plainly when there are no must-dos", () => {
    expect(prompt({ mustDos: [] })).toContain("MUST-DOS: none given.");
  });

  it("includes traveler notes when given and omits the heading when not", () => {
    expect(prompt()).toContain("Anniversary trip.");
    expect(prompt({ notes: "   " })).not.toContain("TRAVELER NOTES");
  });

  it("states the budget in currency, not cents", () => {
    const text = prompt();
    expect(text).toContain("$3,000");
    expect(text).not.toContain("300000");
  });

  it("omits the budget line when none was set", () => {
    expect(prompt({ totalBudgetCents: null })).not.toMatch(/Total budget/);
  });

  it("renders the scheduling window as clock times", () => {
    expect(prompt()).toContain("08:00 to 22:00");
  });

  it("labels weather as normals rather than a forecast", () => {
    expect(prompt()).toMatch(/seasonal normals, not a forecast/i);
  });

  it("is deterministic", () => {
    expect(prompt()).toBe(prompt());
  });
});

describe("the schedule tells the model which weekday each date is", () => {
  it("labels every day with its weekday", () => {
    // Asked to work out that 2026-08-28 is a Friday, a model answered
    // "Thursday" and moved an item to the wrong day.
    const text = buildChatPromptForTest();
    expect(text).toMatch(/2026-12-16 — Wednesday/);
    expect(text).toMatch(/2026-12-17 — Thursday/);
  });

  it("tells the model to use the supplied weekday", () => {
    expect(CHAT_SYSTEM_PROMPT).toMatch(/listed with its weekday/i);
  });
});
