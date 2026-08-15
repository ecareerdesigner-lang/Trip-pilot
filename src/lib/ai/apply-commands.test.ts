import { describe, it, expect } from "vitest";
import { applyCommands } from "@/lib/ai/apply-commands";
import type { ChatCommand } from "@/lib/ai/chat-commands";
import type { EditContext } from "@/lib/travel/edit-itinerary";
import type { ItineraryDay, TimelineItem } from "@/types/view";

const CONTEXT: EditContext = {
  destination: "New York City",
  travelers: 2,
  preferences: ["PUBLIC_TRANSPORT_PREFERRED"],
};

const MIDTOWN = { latitude: 40.7597, longitude: -73.9897 };
const UPPER_WEST = { latitude: 40.7813, longitude: -73.974 };

function iso(date: string, minute: number): string {
  const hours = String(Math.floor(minute / 60)).padStart(2, "0");
  return `${date}T${hours}:${String(minute % 60).padStart(2, "0")}:00.000Z`;
}

function item(
  id: string,
  date: string,
  startMinute: number,
  durationMinutes: number,
  point = MIDTOWN,
): TimelineItem {
  return {
    id,
    type: "SIGHTSEEING",
    title: `Item ${id}`,
    description: null,
    startTime: iso(date, startMinute),
    endTime: iso(date, startMinute + durationMinutes),
    durationMinutes,
    locationName: `Place ${id}`,
    latitude: point.latitude,
    longitude: point.longitude,
    placeLink: null,
    estimatedCostCents: 1_000,
    reservationRequired: false,
    reservationStatus: "NOT_REQUIRED",
    priority: "NORMAL",
    source: "AI_SUGGESTION",
    isMustDo: false,
    completed: false,
    isMock: true,
    legs: [],
  };
}

function day(date: string, dayNumber: number, items: TimelineItem[]): ItineraryDay {
  return {
    id: `d${dayNumber}`,
    dayNumber,
    date,
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

function fixture(): ItineraryDay[] {
  return [
    day("2026-12-16", 1, [
      item("a", "2026-12-16", 540, 90),
      item("b", "2026-12-16", 780, 60, UPPER_WEST),
    ]),
    day("2026-12-17", 2, [item("c", "2026-12-17", 600, 120)]),
  ];
}

function count(days: ItineraryDay[]): number {
  return days.reduce((sum, entry) => sum + entry.items.length, 0);
}

describe("move", () => {
  it("changes the time within a day", () => {
    const result = applyCommands(
      fixture(),
      [{ kind: "move", itemId: "a", toDate: "2026-12-16", toStartMinute: 660 }],
      CONTEXT,
    );
    const moved = result.days[0]!.items.find((entry) => entry.id === "a")!;
    expect(moved.startTime).toBe(iso("2026-12-16", 660));
    expect(result.changedDates).toContain("2026-12-16");
  });

  it("moves an item to another day without losing it", () => {
    const result = applyCommands(
      fixture(),
      [{ kind: "move", itemId: "a", toDate: "2026-12-17", toStartMinute: 900 }],
      CONTEXT,
    );

    expect(count(result.days)).toBe(3);
    expect(result.days[0]!.items.some((entry) => entry.id === "a")).toBe(false);
    expect(result.days[1]!.items.some((entry) => entry.id === "a")).toBe(true);
    expect(result.changedDates).toHaveLength(2);
  });

  it("keeps the item's own details when it moves days", () => {
    const result = applyCommands(
      fixture(),
      [{ kind: "move", itemId: "a", toDate: "2026-12-17", toStartMinute: 900 }],
      CONTEXT,
    );
    const moved = result.days[1]!.items.find((entry) => entry.id === "a")!;
    expect(moved.title).toBe("Item a");
    expect(moved.estimatedCostCents).toBe(1_000);
    expect(moved.durationMinutes).toBe(90);
  });

  it("keeps the current time when none is given", () => {
    const result = applyCommands(
      fixture(),
      [{ kind: "move", itemId: "a", toDate: "2026-12-17", toStartMinute: null }],
      CONTEXT,
    );
    const moved = result.days[1]!.items.find((entry) => entry.id === "a")!;
    expect(moved.startTime).toBe(iso("2026-12-17", 540));
  });

  it("ignores an item that does not exist", () => {
    const result = applyCommands(
      fixture(),
      [{ kind: "move", itemId: "ghost", toDate: "2026-12-16", toStartMinute: 600 }],
      CONTEXT,
    );
    expect(count(result.days)).toBe(3);
    expect(result.changedDates).toEqual([]);
  });
});

describe("resize, remove, add", () => {
  it("changes a duration and its end time together", () => {
    const result = applyCommands(
      fixture(),
      [{ kind: "resize", itemId: "a", durationMinutes: 150 }],
      CONTEXT,
    );
    const resized = result.days[0]!.items.find((entry) => entry.id === "a")!;
    expect(resized.durationMinutes).toBe(150);
    expect(resized.endTime).toBe(iso("2026-12-16", 690));
  });

  it("removes an item and reports it", () => {
    const result = applyCommands(
      fixture(),
      [{ kind: "remove", itemId: "b" }],
      CONTEXT,
    );
    expect(count(result.days)).toBe(2);
    expect(result.removedItemIds).toEqual(["b"]);
  });

  it("adds an item and reports its id", () => {
    const add: ChatCommand = {
      kind: "add",
      date: "2026-12-17",
      type: "RESTAURANT",
      title: "A steakhouse",
      description: "",
      startMinute: 1_140,
      durationMinutes: 90,
      candidateId: null,
      estimatedCostCents: 12_000,
    };
    const result = applyCommands(fixture(), [add], CONTEXT);

    expect(count(result.days)).toBe(4);
    expect(result.addedItemIds).toHaveLength(1);

    const added = result.days[1]!.items.find(
      (entry) => entry.id === result.addedItemIds[0],
    )!;
    expect(added.title).toBe("A steakhouse");
    expect(added.estimatedCostCents).toBe(12_000);
  });

  it("keeps a day's items in time order after an addition", () => {
    const add: ChatCommand = {
      kind: "add",
      date: "2026-12-16",
      type: "RESTAURANT",
      title: "Lunch",
      description: "",
      startMinute: 700,
      durationMinutes: 60,
      candidateId: null,
      estimatedCostCents: 0,
    };
    const result = applyCommands(fixture(), [add], CONTEXT);
    const starts = result.days[0]!.items.map((entry) =>
      Date.parse(entry.startTime),
    );
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });
});

describe("safety", () => {
  it("does not mutate the itinerary it was given", () => {
    const original = fixture();
    const snapshot = JSON.stringify(original);
    applyCommands(original, [{ kind: "remove", itemId: "a" }], CONTEXT);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it("touches only the days a command names", () => {
    const result = applyCommands(
      fixture(),
      [{ kind: "resize", itemId: "c", durationMinutes: 90 }],
      CONTEXT,
    );
    expect(result.changedDates).toEqual(["2026-12-17"]);
  });

  it("applies several commands in order", () => {
    const result = applyCommands(
      fixture(),
      [
        { kind: "remove", itemId: "b" },
        { kind: "resize", itemId: "a", durationMinutes: 120 },
      ],
      CONTEXT,
    );
    expect(count(result.days)).toBe(2);
    expect(
      result.days[0]!.items.find((entry) => entry.id === "a")!.durationMinutes,
    ).toBe(120);
  });

  it("changes nothing when given no commands", () => {
    const result = applyCommands(fixture(), [], CONTEXT);
    expect(result.changedDates).toEqual([]);
    expect(count(result.days)).toBe(3);
  });

  it("is deterministic", () => {
    const commands: ChatCommand[] = [
      { kind: "move", itemId: "a", toDate: "2026-12-17", toStartMinute: 900 },
    ];
    expect(JSON.stringify(applyCommands(fixture(), commands, CONTEXT))).toBe(
      JSON.stringify(applyCommands(fixture(), commands, CONTEXT)),
    );
  });
});

describe("cross-day moves recalculate both days", () => {
  it("rebuilds journeys on the day the item left", () => {
    // Removing a stop changes what the following stop is travelling from, so
    // the day it left needs recalculating as much as the day it joined.
    const before = fixture();
    const result = applyCommands(
      before,
      [{ kind: "move", itemId: "a", toDate: "2026-12-17", toStartMinute: 900 }],
      CONTEXT,
    );

    expect(result.changedDates).toContain("2026-12-16");
    expect(result.changedDates).toContain("2026-12-17");
  });

  it("leaves the origin day coherent", () => {
    const result = applyCommands(
      fixture(),
      [{ kind: "move", itemId: "a", toDate: "2026-12-17", toStartMinute: 900 }],
      CONTEXT,
    );

    for (const day of result.days) {
      for (let index = 1; index < day.items.length; index += 1) {
        const previous = day.items[index - 1]!;
        const current = day.items[index]!;
        expect(Date.parse(current.startTime)).toBeGreaterThanOrEqual(
          Date.parse(previous.endTime),
        );
      }
    }
  });

  it("does not leave the item on both days", () => {
    const result = applyCommands(
      fixture(),
      [{ kind: "move", itemId: "a", toDate: "2026-12-17", toStartMinute: 900 }],
      CONTEXT,
    );

    const appearances = result.days.flatMap((day) =>
      day.items.filter((item) => item.id === "a"),
    );
    expect(appearances).toHaveLength(1);
  });

  it("moves back again without loss", () => {
    const there = applyCommands(
      fixture(),
      [{ kind: "move", itemId: "a", toDate: "2026-12-17", toStartMinute: 900 }],
      CONTEXT,
    );
    const back = applyCommands(
      there.days,
      [{ kind: "move", itemId: "a", toDate: "2026-12-16", toStartMinute: 540 }],
      CONTEXT,
    );

    expect(count(back.days)).toBe(3);
    const moved = back.days[0]!.items.find((item) => item.id === "a")!;
    expect(moved.title).toBe("Item a");
    expect(moved.estimatedCostCents).toBe(1_000);
  });

  it("keeps the trip's total item count", () => {
    const result = applyCommands(
      fixture(),
      [
        { kind: "move", itemId: "a", toDate: "2026-12-17", toStartMinute: 900 },
        { kind: "move", itemId: "b", toDate: "2026-12-17", toStartMinute: 1_020 },
      ],
      CONTEXT,
    );
    expect(count(result.days)).toBe(3);
    expect(result.days[0]!.items).toHaveLength(0);
    expect(result.days[1]!.items).toHaveLength(3);
  });
});
