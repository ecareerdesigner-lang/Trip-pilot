import { describe, it, expect } from "vitest";
import {
  describeCommand,
  parseChatResponse,
  screenCommands,
  type ChatCommand,
} from "@/lib/ai/chat-commands";

const TITLES = new Map([
  ["i1", "The Metropolitan Museum of Art"],
  ["i2", "Dinner in Chelsea"],
]);

const KNOWN = new Set(["i1", "i2"]);
const DATES = new Set(["2026-12-16", "2026-12-17"]);

const VALID = {
  reply: "Moved the museum to Thursday afternoon.",
  commands: [
    { kind: "move", itemId: "i1", toDate: "2026-12-17", toStartMinute: 840 },
  ],
  declined: false,
};

describe("parseChatResponse", () => {
  it("parses a clean response", () => {
    const result = parseChatResponse(JSON.stringify(VALID));
    expect(result.commands).toHaveLength(1);
    expect(result.declined).toBe(false);
  });

  it("recovers JSON wrapped in prose or fences", () => {
    const wrapped = "Sure!\n```json\n" + JSON.stringify(VALID) + "\n```\nDone.";
    expect(parseChatResponse(wrapped).commands).toHaveLength(1);
  });

  it("accepts a reply with no commands", () => {
    const result = parseChatResponse(
      JSON.stringify({ reply: "Your Friday is already fairly open.", commands: [] }),
    );
    expect(result.commands).toEqual([]);
  });

  it("rejects a response with no reply", () => {
    expect(() =>
      parseChatResponse(JSON.stringify({ reply: "", commands: [] })),
    ).toThrow();
  });

  it("rejects an unknown command kind rather than ignoring it", () => {
    expect(() =>
      parseChatResponse(
        JSON.stringify({
          reply: "ok",
          commands: [{ kind: "teleport", itemId: "i1" }],
        }),
      ),
    ).toThrow();
  });

  it("rejects an out-of-range time", () => {
    expect(() =>
      parseChatResponse(
        JSON.stringify({
          reply: "ok",
          commands: [
            { kind: "move", itemId: "i1", toDate: "2026-12-17", toStartMinute: 2000 },
          ],
        }),
      ),
    ).toThrow();
  });

  it("rejects a zero-length item", () => {
    expect(() =>
      parseChatResponse(
        JSON.stringify({
          reply: "ok",
          commands: [{ kind: "resize", itemId: "i1", durationMinutes: 0 }],
        }),
      ),
    ).toThrow();
  });

  it("rejects text that is not JSON at all", () => {
    expect(() => parseChatResponse("I cannot help with that.")).toThrow(
      /usable response/i,
    );
  });
});

describe("describeCommand", () => {
  it("names the item rather than showing an id", () => {
    const text = describeCommand(
      { kind: "move", itemId: "i1", toDate: "2026-12-17", toStartMinute: 840 },
      TITLES,
    );
    expect(text).toContain("The Metropolitan Museum of Art");
    expect(text).toContain("2:00 PM");
    expect(text).not.toContain("i1");
  });

  it("describes a move that only changes the day", () => {
    const text = describeCommand(
      { kind: "move", itemId: "i2", toDate: "2026-12-17", toStartMinute: null },
      TITLES,
    );
    expect(text).toContain("Dinner in Chelsea");
    expect(text).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("describes a resize in hours and minutes", () => {
    expect(
      describeCommand({ kind: "resize", itemId: "i1", durationMinutes: 95 }, TITLES),
    ).toContain("1h 35m");
  });

  it("describes a removal", () => {
    expect(
      describeCommand({ kind: "remove", itemId: "i2" }, TITLES),
    ).toContain("Remove Dinner in Chelsea");
  });

  it("describes an addition with its own title", () => {
    const text = describeCommand(
      {
        kind: "add",
        date: "2026-12-16",
        type: "RESTAURANT",
        title: "A steakhouse",
        description: "",
        startMinute: 1_140,
        durationMinutes: 90,
        candidateId: null,
        estimatedCostCents: 0,
      },
      TITLES,
    );
    expect(text).toContain("A steakhouse");
    expect(text).toContain("7:00 PM");
  });

  it("copes with an item it has no title for", () => {
    expect(
      describeCommand({ kind: "remove", itemId: "unknown" }, TITLES),
    ).toContain("an item");
  });
});

describe("screenCommands", () => {
  const move = (itemId: string, toDate: string): ChatCommand => ({
    kind: "move",
    itemId,
    toDate,
    toStartMinute: 600,
  });

  it("accepts commands about real items on real days", () => {
    const result = screenCommands([move("i1", "2026-12-17")], KNOWN, DATES);
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toEqual([]);
  });

  it("rejects an item that is not on the schedule", () => {
    const result = screenCommands([move("ghost", "2026-12-17")], KNOWN, DATES);
    expect(result.accepted).toEqual([]);
    expect(result.rejected[0]!.reason).toMatch(/not on the schedule/i);
  });

  it("rejects a move to a day outside the trip", () => {
    const result = screenCommands([move("i1", "2027-01-01")], KNOWN, DATES);
    expect(result.accepted).toEqual([]);
    expect(result.rejected[0]!.reason).toMatch(/not a day of this trip/i);
  });

  it("rejects an addition on a day outside the trip", () => {
    const add: ChatCommand = {
      kind: "add",
      date: "2027-01-01",
      type: "ACTIVITY",
      title: "Something",
      description: "",
      startMinute: 600,
      durationMinutes: 60,
      candidateId: null,
      estimatedCostCents: 0,
    };
    expect(screenCommands([add], KNOWN, DATES).rejected).toHaveLength(1);
  });

  it("keeps the good commands when only some are bad", () => {
    // Partial application is still better than nothing, provided the traveler
    // is told which parts did not happen.
    const result = screenCommands(
      [move("i1", "2026-12-17"), move("ghost", "2026-12-17")],
      KNOWN,
      DATES,
    );
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
  });

  it("does not require an item id for an addition", () => {
    const add: ChatCommand = {
      kind: "add",
      date: "2026-12-16",
      type: "ACTIVITY",
      title: "Something",
      description: "",
      startMinute: 600,
      durationMinutes: 60,
      candidateId: null,
      estimatedCostCents: 0,
    };
    expect(screenCommands([add], new Set(), DATES).accepted).toHaveLength(1);
  });

  it("handles an empty command list", () => {
    const result = screenCommands([], KNOWN, DATES);
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toEqual([]);
  });
});
