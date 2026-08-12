import { describe, it, expect } from "vitest";
import {
  addItem,
  earliestStartMinute,
  moveItem,
  recomputeLegs,
  removeItem,
  resizeItem,
  setCompleted,
  shiftFrom,
  type EditContext,
} from "@/lib/travel/edit-itinerary";
import type { ItineraryDay, TimelineItem } from "@/types/view";

const CONTEXT: EditContext = {
  destination: "New York City",
  travelers: 2,
  preferences: ["PUBLIC_TRANSPORT_PREFERRED"],
};

const MIDTOWN = { latitude: 40.7597, longitude: -73.9897 };
const UPPER_WEST = { latitude: 40.7813, longitude: -73.974 };
const DOWNTOWN = { latitude: 40.7061, longitude: -74.0087 };

const DATE = "2026-09-18";

function iso(minute: number): string {
  return new Date(
    Date.parse(`${DATE}T00:00:00.000Z`) + minute * 60_000,
  ).toISOString();
}

function item(
  id: string,
  startMinute: number,
  durationMinutes: number,
  point: { latitude: number; longitude: number } | null,
  overrides: Partial<TimelineItem> = {},
): TimelineItem {
  return {
    id,
    type: "SIGHTSEEING",
    title: `Item ${id}`,
    description: null,
    startTime: iso(startMinute),
    endTime: iso(startMinute + durationMinutes),
    durationMinutes,
    locationName: `Place ${id}`,
    latitude: point?.latitude ?? null,
    longitude: point?.longitude ?? null,
    estimatedCostCents: 0,
    reservationRequired: false,
    reservationStatus: "NOT_REQUIRED",
    priority: "NORMAL",
    source: "AI_SUGGESTION",
    isMustDo: false,
    completed: false,
    isMock: true,
    legs: [],
    ...overrides,
  };
}

function day(items: TimelineItem[]): ItineraryDay {
  return {
    id: "d1",
    dayNumber: 1,
    date: DATE,
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

const BASE = day([
  item("a", 540, 60, MIDTOWN),
  item("b", 720, 90, UPPER_WEST),
  item("c", 960, 60, DOWNTOWN),
]);

function minuteOf(isoString: string): number {
  const date = new Date(isoString);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

describe("purity", () => {
  it("never mutates the day it was given", () => {
    const snapshot = JSON.stringify(BASE);
    moveItem(BASE, "b", 800, CONTEXT);
    removeItem(BASE, "b", CONTEXT);
    resizeItem(BASE, "b", 120, CONTEXT);
    expect(JSON.stringify(BASE)).toBe(snapshot);
  });

  it("returns a new day object", () => {
    const result = moveItem(BASE, "b", 800, CONTEXT);
    expect(result.day).not.toBe(BASE);
  });
});

describe("recomputeLegs", () => {
  it("lands the last leg exactly when the item starts", () => {
    const { day: updated } = recomputeLegs(BASE, CONTEXT);
    for (const entry of updated.items) {
      const last = entry.legs.at(-1);
      if (!last) continue;
      expect(last.arrivalTime).toBe(entry.startTime);
    }
  });

  it("chains each leg's arrival into the next departure", () => {
    const { day: updated } = recomputeLegs(BASE, CONTEXT);
    for (const entry of updated.items) {
      for (let index = 1; index < entry.legs.length; index += 1) {
        expect(entry.legs[index]!.departureTime).toBe(
          entry.legs[index - 1]!.arrivalTime,
        );
      }
    }
  });

  it("leaves the first item of the day with no inbound journey", () => {
    const { day: updated } = recomputeLegs(BASE, CONTEXT);
    expect(updated.items[0]!.legs).toEqual([]);
  });

  it("orders legs from zero", () => {
    const { day: updated } = recomputeLegs(BASE, CONTEXT);
    for (const entry of updated.items) {
      expect(entry.legs.map((leg) => leg.legOrder)).toEqual(
        entry.legs.map((_, index) => index),
      );
    }
  });

  it("adds no journey between two points in the same place", () => {
    const together = day([
      item("a", 540, 60, MIDTOWN),
      item("b", 660, 60, MIDTOWN),
    ]);
    const { day: updated } = recomputeLegs(together, CONTEXT);
    expect(updated.items[1]!.legs).toEqual([]);
  });

  it("keeps an item that has no coordinates", () => {
    const partial = day([item("a", 540, 60, MIDTOWN), item("b", 720, 60, null)]);
    const { day: updated } = recomputeLegs(partial, CONTEXT);
    expect(updated.items).toHaveLength(2);
  });
});

describe("moveItem", () => {
  it("moves the item and keeps its duration", () => {
    const { day: updated } = moveItem(BASE, "b", 800, CONTEXT);
    const moved = updated.items.find((entry) => entry.id === "b")!;
    expect(minuteOf(moved.startTime)).toBe(800);
    expect(moved.durationMinutes).toBe(90);
    expect(minuteOf(moved.endTime)).toBe(890);
  });

  it("recomputes the journey into the item that follows it", () => {
    const { day: updated } = moveItem(BASE, "b", 800, CONTEXT);
    const following = updated.items.find((entry) => entry.id === "c")!;
    const last = following.legs.at(-1);
    expect(last?.arrivalTime).toBe(following.startTime);
  });

  it("re-sorts when an item moves past another", () => {
    const { day: updated } = moveItem(BASE, "a", 1_100, CONTEXT);
    const starts = updated.items.map((entry) => minuteOf(entry.startTime));
    expect([...starts].sort((x, y) => x - y)).toEqual(starts);
  });

  it("does nothing for an unknown item", () => {
    const { day: updated, recomputedItemIds } = moveItem(
      BASE,
      "nope",
      800,
      CONTEXT,
    );
    expect(updated).toBe(BASE);
    expect(recomputedItemIds).toEqual([]);
  });
});

describe("resizeItem", () => {
  it("extends the item and moves its end", () => {
    const { day: updated } = resizeItem(BASE, "b", 150, CONTEXT);
    const resized = updated.items.find((entry) => entry.id === "b")!;
    expect(resized.durationMinutes).toBe(150);
    expect(minuteOf(resized.endTime)).toBe(minuteOf(resized.startTime) + 150);
  });

  it("refuses a duration too short to be real", () => {
    const { day: updated } = resizeItem(BASE, "b", 2, CONTEXT);
    expect(updated).toBe(BASE);
  });
});

describe("removeItem", () => {
  it("removes the item", () => {
    const { day: updated } = removeItem(BASE, "b", CONTEXT);
    expect(updated.items.map((entry) => entry.id)).toEqual(["a", "c"]);
  });

  it("reroutes the following item from what now precedes it", () => {
    const before = recomputeLegs(BASE, CONTEXT).day;
    const fromUpperWest = before.items.find((entry) => entry.id === "c")!;

    const { day: updated } = removeItem(BASE, "b", CONTEXT);
    const fromMidtown = updated.items.find((entry) => entry.id === "c")!;

    // Reached from a different place, so the journey is a different journey.
    expect(fromMidtown.legs).not.toEqual(fromUpperWest.legs);
    expect(fromMidtown.legs.at(-1)?.arrivalTime).toBe(fromMidtown.startTime);
  });

  it("does nothing for an unknown item", () => {
    const { day: updated } = removeItem(BASE, "nope", CONTEXT);
    expect(updated).toBe(BASE);
  });

  it("handles removing the only item", () => {
    const single = day([item("a", 540, 60, MIDTOWN)]);
    const { day: updated } = removeItem(single, "a", CONTEXT);
    expect(updated.items).toEqual([]);
  });
});

describe("addItem", () => {
  it("marks what the traveler added as theirs", () => {
    const { day: updated } = addItem(
      BASE,
      {
        type: "RESTAURANT",
        title: "Dinner",
        startMinute: 1_140,
        durationMinutes: 90,
        latitude: DOWNTOWN.latitude,
        longitude: DOWNTOWN.longitude,
      },
      CONTEXT,
      "new-1",
    );

    const added = updated.items.find((entry) => entry.id === "new-1")!;
    // USER is what protects it from being cleared on the next regeneration.
    expect(added.source).toBe("USER");
    expect(added.isMock).toBe(false);
  });

  it("routes the traveler to the new item", () => {
    // Somewhere genuinely elsewhere: the last item of BASE is downtown, and
    // adding dinner next door correctly produces no journey at all.
    const { day: updated } = addItem(
      BASE,
      {
        type: "RESTAURANT",
        title: "Dinner",
        startMinute: 1_140,
        durationMinutes: 90,
        latitude: UPPER_WEST.latitude,
        longitude: UPPER_WEST.longitude,
      },
      CONTEXT,
      "new-1",
    );
    const added = updated.items.find((entry) => entry.id === "new-1")!;
    expect(added.legs.length).toBeGreaterThan(0);
    expect(added.legs.at(-1)!.arrivalTime).toBe(added.startTime);
  });

  it("adds no journey when the new item is where the traveler already is", () => {
    const { day: updated } = addItem(
      BASE,
      {
        type: "RESTAURANT",
        title: "Dinner nearby",
        startMinute: 1_140,
        durationMinutes: 90,
        latitude: DOWNTOWN.latitude,
        longitude: DOWNTOWN.longitude,
      },
      CONTEXT,
      "new-2",
    );
    expect(updated.items.find((entry) => entry.id === "new-2")!.legs).toEqual([]);
  });

  it("flags a booking when one is needed", () => {
    const { day: updated } = addItem(
      BASE,
      {
        type: "RESTAURANT",
        title: "Dinner",
        startMinute: 1_140,
        durationMinutes: 90,
        reservationRequired: true,
      },
      CONTEXT,
      "new-1",
    );
    const added = updated.items.find((entry) => entry.id === "new-1")!;
    expect(added.reservationStatus).toBe("NEEDED");
  });
});

describe("setCompleted", () => {
  it("marks an item done without touching the schedule", () => {
    const { day: updated, recomputedItemIds } = setCompleted(BASE, "a", true);
    expect(updated.items.find((entry) => entry.id === "a")!.completed).toBe(true);
    expect(recomputedItemIds).toEqual([]);
    expect(updated.items.map((entry) => entry.startTime)).toEqual(
      BASE.items.map((entry) => entry.startTime),
    );
  });
});

describe("shiftFrom", () => {
  it("pushes the item and everything after it", () => {
    const { day: updated } = shiftFrom(BASE, "b", 30, CONTEXT);
    expect(minuteOf(updated.items.find((e) => e.id === "b")!.startTime)).toBe(750);
    expect(minuteOf(updated.items.find((e) => e.id === "c")!.startTime)).toBe(990);
  });

  it("leaves earlier items alone", () => {
    const { day: updated } = shiftFrom(BASE, "b", 30, CONTEXT);
    expect(minuteOf(updated.items.find((e) => e.id === "a")!.startTime)).toBe(540);
  });

  it("can pull a day earlier", () => {
    const { day: updated } = shiftFrom(BASE, "b", -30, CONTEXT);
    expect(minuteOf(updated.items.find((e) => e.id === "b")!.startTime)).toBe(690);
  });

  it("does nothing for a zero shift", () => {
    expect(shiftFrom(BASE, "b", 0, CONTEXT).day).toBe(BASE);
  });
});

describe("earliestStartMinute", () => {
  it("accounts for the journey from the previous item", () => {
    const earliest = earliestStartMinute(BASE, "b", CONTEXT);
    // Item a ends at 600; reaching Upper West Side takes real time.
    expect(earliest).toBeGreaterThan(600);
  });

  it("has no answer for the first item of the day", () => {
    expect(earliestStartMinute(BASE, "a", CONTEXT)).toBeNull();
  });

  it("falls back to the previous end when a place is unknown", () => {
    const partial = day([item("a", 540, 60, MIDTOWN), item("b", 720, 60, null)]);
    expect(earliestStartMinute(partial, "b", CONTEXT)).toBe(600);
  });
});
