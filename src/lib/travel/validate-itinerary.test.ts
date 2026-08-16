import { describe, it, expect } from "vitest";
import { validateItinerary, type ValidationCode } from "@/lib/travel/validate-itinerary";
import type { ItineraryDay, TimelineItem, TimelineLeg } from "@/types/view";

const DAY = "2026-09-18";
const at = (hour: number, minute = 0): string =>
  `${DAY}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;

function leg(minutes: number, overrides: Partial<TimelineLeg> = {}): TimelineLeg {
  return {
    id: `leg-${Math.random()}`,
    mode: "SUBWAY",
    durationMinutes: minutes,
    distanceMeters: 4_000,
    costCents: 580,
    instructions: "",
    originLabel: null,
    destinationLabel: null,
    departureTime: null,
    arrivalTime: null,
    legOrder: 0,
    ...overrides,
  };
}

function item(overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: "i1",
    type: "SIGHTSEEING",
    title: "Museum",
    description: null,
    startTime: at(13),
    endTime: at(15),
    durationMinutes: 120,
    locationName: null,
    latitude: null,
    longitude: null,
    placeLink: null,
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

function day(items: TimelineItem[], dayNumber = 1): ItineraryDay {
  return {
    id: `d${dayNumber}`,
    dayNumber,
    date: DAY,
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

function codes(report: ReturnType<typeof validateItinerary>): ValidationCode[] {
  return report.warnings.map((warning) => warning.code);
}

describe("the case this engine exists for", () => {
  it("catches a museum that ends too late to reach the show", () => {
    const museum = item({
      id: "museum",
      title: "Museum visit",
      startTime: at(15, 30),
      endTime: at(17, 30),
      durationMinutes: 120,
    });
    const show = item({
      id: "show",
      title: "Broadway show",
      type: "ACTIVITY",
      startTime: at(18),
      endTime: at(20, 45),
      durationMinutes: 165,
      legs: [leg(35)],
    });

    const report = validateItinerary([day([museum, show])]);
    const failure = report.warnings.find(
      (warning) => warning.code === "INSUFFICIENT_TRAVEL_TIME",
    );

    expect(failure).toBeDefined();
    expect(failure!.severity).toBe("ERROR");
    expect(failure!.message).toContain("5:30 PM");
    expect(failure!.message).toContain("6:00 PM");
    expect(failure!.message).toContain("35 min");
    expect(failure!.itemIds).toEqual(["museum", "show"]);
    expect(failure!.suggestion).toContain("5:25 PM");
    expect(report.possible).toBe(false);
  });

  it("accepts the same day once there is enough time", () => {
    const museum = item({ id: "m", startTime: at(15), endTime: at(17), durationMinutes: 120 });
    const show = item({
      id: "s",
      startTime: at(18),
      endTime: at(20),
      durationMinutes: 120,
      legs: [leg(35)],
    });
    const report = validateItinerary([day([museum, show])]);
    expect(codes(report)).not.toContain("INSUFFICIENT_TRAVEL_TIME");
    expect(report.possible).toBe(true);
  });
});

describe("overlaps", () => {
  it("errors when one item starts before the previous ends", () => {
    const report = validateItinerary([
      day([
        item({ id: "a", startTime: at(13), endTime: at(15), durationMinutes: 120 }),
        item({ id: "b", startTime: at(14), endTime: at(16), durationMinutes: 120 }),
      ]),
    ]);
    const overlap = report.warnings.find((warning) => warning.code === "OVERLAP");
    expect(overlap?.severity).toBe("ERROR");
    expect(overlap?.itemIds).toEqual(["a", "b"]);
  });

  it("does not report travel problems on top of an overlap", () => {
    const report = validateItinerary([
      day([
        item({ id: "a", startTime: at(13), endTime: at(15), durationMinutes: 120 }),
        item({ id: "b", startTime: at(14), endTime: at(16), durationMinutes: 120, legs: [leg(30)] }),
      ]),
    ]);
    expect(codes(report)).toContain("OVERLAP");
    expect(codes(report)).not.toContain("INSUFFICIENT_TRAVEL_TIME");
  });

  it("allows two items that touch exactly", () => {
    const report = validateItinerary([
      day([
        item({ id: "a", startTime: at(13), endTime: at(14), durationMinutes: 60 }),
        item({ id: "b", startTime: at(14), endTime: at(15), durationMinutes: 60 }),
      ]),
    ]);
    expect(codes(report)).not.toContain("OVERLAP");
  });
});

describe("missing transportation", () => {
  it("errors when two distant places have no journey between them", () => {
    const report = validateItinerary([
      day([
        item({
          id: "a",
          startTime: at(10),
          endTime: at(11),
          durationMinutes: 60,
          latitude: 40.7597,
          longitude: -73.9897,
        }),
        item({
          id: "b",
          startTime: at(12),
          endTime: at(13),
          durationMinutes: 60,
          latitude: 40.6892,
          longitude: -74.0445,
        }),
      ]),
    ]);
    expect(codes(report)).toContain("MISSING_TRANSPORTATION");
  });

  it("stays quiet for two things in the same place", () => {
    const report = validateItinerary([
      day([
        item({ id: "a", startTime: at(10), endTime: at(11), durationMinutes: 60, latitude: 40.7597, longitude: -73.9897 }),
        item({ id: "b", startTime: at(12), endTime: at(13), durationMinutes: 60, latitude: 40.7598, longitude: -73.9898 }),
      ]),
    ]);
    expect(codes(report)).not.toContain("MISSING_TRANSPORTATION");
  });

  it("says nothing when coordinates are unknown", () => {
    const report = validateItinerary([
      day([
        item({ id: "a", startTime: at(10), endTime: at(11), durationMinutes: 60 }),
        item({ id: "b", startTime: at(12), endTime: at(13), durationMinutes: 60 }),
      ]),
    ]);
    expect(codes(report)).not.toContain("MISSING_TRANSPORTATION");
  });
});

describe("implausible legs", () => {
  it("errors on a walk nobody could walk", () => {
    const report = validateItinerary([
      day([
        item({
          id: "a",
          startTime: at(13),
          legs: [leg(5, { mode: "WALK", distanceMeters: 4_000 })],
        }),
      ]),
    ]);
    expect(codes(report)).toContain("IMPLAUSIBLE_TRAVEL_SPEED");
  });

  it("accepts the same distance by subway", () => {
    const report = validateItinerary([
      day([item({ id: "a", startTime: at(13), legs: [leg(18, { mode: "SUBWAY", distanceMeters: 4_000 })] })]),
    ]);
    expect(codes(report)).not.toContain("IMPLAUSIBLE_TRAVEL_SPEED");
  });
});

describe("opening hours", () => {
  const hours = new Map([["m", { opensMinute: 10 * 60, closesMinute: 17 * 60 }]]);

  it("errors when a visit runs past closing", () => {
    const report = validateItinerary(
      [day([item({ id: "m", title: "The Met", startTime: at(16), endTime: at(18), durationMinutes: 120 })])],
      { hoursByItemId: hours },
    );
    const warning = report.warnings.find((entry) => entry.code === "AFTER_CLOSING");
    expect(warning?.severity).toBe("ERROR");
    expect(warning?.message).toContain("5:00 PM");
    expect(warning?.suggestion).toContain("3:00 PM");
  });

  it("errors when a visit starts before opening", () => {
    const report = validateItinerary(
      [day([item({ id: "m", startTime: at(8), endTime: at(9), durationMinutes: 60 })])],
      { hoursByItemId: hours },
    );
    expect(codes(report)).toContain("BEFORE_OPENING");
  });

  it("accepts a visit inside the hours", () => {
    const report = validateItinerary(
      [day([item({ id: "m", startTime: at(11), endTime: at(13), durationMinutes: 120 })])],
      { hoursByItemId: hours },
    );
    expect(codes(report)).not.toContain("AFTER_CLOSING");
    expect(codes(report)).not.toContain("BEFORE_OPENING");
  });

  it("says nothing when hours are unknown", () => {
    const report = validateItinerary([
      day([item({ id: "m", startTime: at(23), endTime: at(23, 30), durationMinutes: 30 })]),
    ]);
    expect(codes(report)).not.toContain("AFTER_CLOSING");
  });
});

describe("meals", () => {
  it("warns about a meal too short to eat", () => {
    const report = validateItinerary([
      day([item({ id: "r", type: "RESTAURANT", title: "Dinner", startTime: at(19), endTime: at(19, 15), durationMinutes: 15 })]),
    ]);
    expect(codes(report)).toContain("SHORT_MEAL");
  });

  it("warns about a full day with no meal at all", () => {
    const report = validateItinerary([
      day([
        item({ id: "a", startTime: at(9), endTime: at(13), durationMinutes: 240 }),
        item({ id: "b", startTime: at(14), endTime: at(18), durationMinutes: 240 }),
      ]),
    ]);
    expect(codes(report)).toContain("NO_MEAL");
  });

  it("stays quiet when a meal is scheduled", () => {
    const report = validateItinerary([
      day([
        item({ id: "a", startTime: at(9), endTime: at(13), durationMinutes: 240 }),
        item({ id: "r", type: "RESTAURANT", startTime: at(13, 30), endTime: at(14, 30), durationMinutes: 60 }),
        item({ id: "b", startTime: at(15), endTime: at(18), durationMinutes: 180 }),
      ]),
    ]);
    expect(codes(report)).not.toContain("NO_MEAL");
  });

  // The exact shape of a real bug: a five-day trip where one day's entire
  // schedule was lunch, a five-hour gap, then dinner — nothing else. Two
  // meals is a correctly-formed day by every other check (it has a meal,
  // it is not too long), which is exactly why this needed its own check.
  it("warns about a day that is only meals", () => {
    const report = validateItinerary([
      day([
        item({ id: "lunch", type: "RESTAURANT", title: "CiPasso", startTime: at(12, 30), endTime: at(14), durationMinutes: 90 }),
        item({ id: "dinner", type: "RESTAURANT", title: "Tonnarello", startTime: at(21), endTime: at(22, 30), durationMinutes: 90 }),
      ]),
    ]);
    expect(codes(report)).toContain("ONLY_MEALS");
  });

  it("stays quiet when a day has one meal among other things", () => {
    const report = validateItinerary([
      day([
        item({ id: "a", type: "RESTAURANT", startTime: at(12), endTime: at(13), durationMinutes: 60 }),
        item({ id: "b", startTime: at(14), endTime: at(16), durationMinutes: 120 }),
      ]),
    ]);
    expect(codes(report)).not.toContain("ONLY_MEALS");
  });

  it("does not flag a single meal alone as only-meals", () => {
    // items.length >= 2 is deliberate: one restaurant on an otherwise
    // empty day is a different, already-covered problem (EMPTY_DAY), not
    // this one.
    const report = validateItinerary([
      day([item({ id: "a", type: "RESTAURANT", startTime: at(19), endTime: at(20, 30), durationMinutes: 90 })]),
    ]);
    expect(codes(report)).not.toContain("ONLY_MEALS");
  });
});

describe("description time mismatch", () => {
  // This is the exact shape of a real bug: the AI wrote "Enjoy the Red Clay
  // Strays concert at 8PM" as the item's description, and scheduled the
  // same item to start at 11:59 PM in the same response. Both values are
  // individually valid — nothing in the schema catches a model's own
  // narrative disagreeing with its own structured output.
  it("flags an item whose description names a time far from its schedule", () => {
    const report = validateItinerary([
      day([
        item({
          id: "concert",
          title: "ICON Park",
          description: "Enjoy the Red Clay Strays concert at 8PM, the main event of your trip.",
          startTime: at(23, 59),
          endTime: at(23, 59),
          durationMinutes: 0,
        }),
      ]),
    ]);
    const warning = report.warnings.find(
      (w) => w.code === "DESCRIPTION_TIME_MISMATCH",
    );
    expect(warning).toBeDefined();
    expect(warning?.message).toMatch(/8:00 PM/);
  });

  it("says nothing when the description matches the schedule", () => {
    const report = validateItinerary([
      day([
        item({
          id: "concert",
          title: "Concert",
          description: "The show starts at 8PM.",
          startTime: at(20),
          endTime: at(22),
          durationMinutes: 120,
        }),
      ]),
    ]);
    expect(codes(report)).not.toContain("DESCRIPTION_TIME_MISMATCH");
  });

  it("says nothing when a description mentions no time at all", () => {
    const report = validateItinerary([
      day([
        item({
          id: "a",
          title: "Museum",
          description: "A quiet afternoon among the exhibits.",
          startTime: at(23, 59),
          endTime: at(23, 59),
          durationMinutes: 0,
        }),
      ]),
    ]);
    expect(codes(report)).not.toContain("DESCRIPTION_TIME_MISMATCH");
  });

  it("does not mistake a year or a plain number for a time", () => {
    const report = validateItinerary([
      day([
        item({
          id: "a",
          title: "Historic Hall",
          description: "Built in 1900, this hall has hosted 1904 events since opening.",
          startTime: at(23, 59),
          endTime: at(23, 59),
          durationMinutes: 0,
        }),
      ]),
    ]);
    expect(codes(report)).not.toContain("DESCRIPTION_TIME_MISMATCH");
  });

  it("tolerates a small, reasonable gap between description and schedule", () => {
    const report = validateItinerary([
      day([
        item({
          id: "a",
          title: "Dinner",
          description: "A table around 7PM.",
          // 40 minutes off — comfortably inside the tolerance a real
          // pacing adjustment would produce.
          startTime: at(19, 40),
          endTime: at(21),
          durationMinutes: 80,
        }),
      ]),
    ]);
    expect(codes(report)).not.toContain("DESCRIPTION_TIME_MISMATCH");
  });
});

describe("flights and lodging", () => {
  it("warns when there is no time for check-in and security", () => {
    const report = validateItinerary([
      day([
        item({ id: "brunch", type: "RESTAURANT", startTime: at(11), endTime: at(12), durationMinutes: 60 }),
        item({ id: "flight", type: "TRAVEL", title: "Fly home", startTime: at(13), endTime: at(15), durationMinutes: 120, legs: [leg(40)] }),
      ]),
    ]);
    expect(codes(report)).toContain("AIRPORT_ARRIVAL_BUFFER");
  });

  it("accepts a flight with a proper buffer", () => {
    const report = validateItinerary([
      day([
        item({ id: "brunch", type: "RESTAURANT", startTime: at(8), endTime: at(9), durationMinutes: 60 }),
        item({ id: "flight", type: "TRAVEL", startTime: at(13), endTime: at(15), durationMinutes: 120, legs: [leg(40)] }),
      ]),
    ]);
    expect(codes(report)).not.toContain("AIRPORT_ARRIVAL_BUFFER");
  });

  it("notes an early check-in without calling it a problem", () => {
    const report = validateItinerary([
      day([item({ id: "h", type: "LODGING", title: "Hotel", startTime: at(10), endTime: at(10, 30), durationMinutes: 30 })]),
    ]);
    const warning = report.warnings.find((entry) => entry.code === "EARLY_CHECK_IN");
    expect(warning?.severity).toBe("INFO");
    expect(report.possible).toBe(true);
  });

  it("warns about a late check-out", () => {
    const report = validateItinerary([
      day([item({ id: "h", type: "LODGING", title: "Check out of the hotel", startTime: at(13), endTime: at(13, 30), durationMinutes: 30 })], 4),
    ]);
    expect(codes(report)).toContain("LATE_CHECK_OUT");
  });
});

describe("pace and hours", () => {
  it("warns about a connection with no slack", () => {
    const report = validateItinerary(
      [
        day([
          item({ id: "a", startTime: at(13), endTime: at(14), durationMinutes: 60 }),
          item({ id: "b", startTime: at(14, 35), endTime: at(15), durationMinutes: 25, legs: [leg(30)] }),
        ]),
      ],
      { pace: "RELAXED" },
    );
    expect(codes(report)).toContain("TIGHT_CONNECTION");
  });

  it("is more forgiving on a packed pace", () => {
    const build = (pace: "RELAXED" | "PACKED") =>
      validateItinerary(
        [
          day([
            item({ id: "a", startTime: at(13), endTime: at(14), durationMinutes: 60 }),
            item({ id: "b", startTime: at(14, 50), endTime: at(15, 30), durationMinutes: 40, legs: [leg(30)] }),
          ]),
        ],
        { pace },
      );
    expect(codes(build("RELAXED"))).toContain("TIGHT_CONNECTION");
    expect(codes(build("PACKED"))).not.toContain("TIGHT_CONNECTION");
  });

  it("warns when something falls outside the traveler's hours", () => {
    const report = validateItinerary(
      [day([item({ id: "a", startTime: at(6), endTime: at(7), durationMinutes: 60 })])],
      { dayStartMinute: 8 * 60, dayEndMinute: 22 * 60 },
    );
    expect(codes(report)).toContain("OUTSIDE_TRAVEL_HOURS");
  });

  it("warns about an exhausting day", () => {
    const report = validateItinerary([
      day([
        item({ id: "a", startTime: at(6), endTime: at(7), durationMinutes: 60 }),
        item({ id: "b", startTime: at(21), endTime: at(23), durationMinutes: 120 }),
      ]),
    ]);
    expect(codes(report)).toContain("LONG_DAY");
  });
});

describe("report shape", () => {
  it("counts by severity and reports possibility", () => {
    const report = validateItinerary([
      day([
        item({ id: "a", startTime: at(13), endTime: at(15), durationMinutes: 120 }),
        item({ id: "b", startTime: at(14), endTime: at(16), durationMinutes: 120 }),
      ]),
    ]);
    expect(report.counts.ERROR).toBeGreaterThan(0);
    expect(report.possible).toBe(false);
    expect(
      report.counts.ERROR + report.counts.WARNING + report.counts.INFO,
    ).toBe(report.warnings.length);
  });

  it("notes an empty day without calling it broken", () => {
    const report = validateItinerary([day([])]);
    expect(codes(report)).toEqual(["EMPTY_DAY"]);
    expect(report.possible).toBe(true);
  });

  it("passes a clean itinerary with nothing to say", () => {
    const report = validateItinerary([
      day([
        item({ id: "a", startTime: at(10), endTime: at(11), durationMinutes: 60 }),
        item({ id: "r", type: "RESTAURANT", startTime: at(12), endTime: at(13), durationMinutes: 60, legs: [leg(20)] }),
      ]),
    ]);
    expect(report.warnings).toEqual([]);
    expect(report.possible).toBe(true);
  });

  it("folds budget warnings into the same report", () => {
    const report = validateItinerary([day([item()])], {
      budgetWarnings: [{ severity: "ERROR", message: "Over budget by $200." }],
    });
    expect(codes(report)).toContain("BUDGET_OVERRUN");
    expect(report.possible).toBe(false);
  });

  it("handles a trip with no days", () => {
    const report = validateItinerary([]);
    expect(report.warnings).toEqual([]);
    expect(report.possible).toBe(true);
  });
});

describe("unscheduled must-dos", () => {
  it("reports a must-do that never made it onto the schedule", () => {
    const report = validateItinerary([], {
      unscheduledMustDos: ["See a Broadway show"],
    });
    const warning = report.warnings.find(
      (entry) => entry.code === "UNSCHEDULED_MUST_DO",
    );
    expect(warning).toBeDefined();
    expect(warning!.severity).toBe("WARNING");
    expect(warning!.message).toContain("See a Broadway show");
    expect(warning!.suggestion).toBeTruthy();
  });

  it("reports each one separately so none is buried", () => {
    const report = validateItinerary([], {
      unscheduledMustDos: ["The Met", "Statue of Liberty"],
    });
    expect(
      report.warnings.filter((entry) => entry.code === "UNSCHEDULED_MUST_DO"),
    ).toHaveLength(2);
  });

  it("does not make the trip impossible, only incomplete", () => {
    const report = validateItinerary([], {
      unscheduledMustDos: ["The Met"],
    });
    expect(report.possible).toBe(true);
  });

  it("stays quiet when every must-do was placed", () => {
    const report = validateItinerary([], { unscheduledMustDos: [] });
    expect(
      report.warnings.some((entry) => entry.code === "UNSCHEDULED_MUST_DO"),
    ).toBe(false);
  });
});
