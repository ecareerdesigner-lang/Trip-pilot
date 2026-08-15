import { describe, it, expect } from "vitest";
import {
  computeBudget,
  ledgerFromDays,
  type CategoryAllocations,
  type LedgerRow,
} from "@/lib/travel/budget";
import { BUDGET_CATEGORIES } from "@/types/domain";
import type { ItineraryDay, TimelineItem, TimelineLeg } from "@/types/view";

const NO_ALLOCATIONS: CategoryAllocations = {
  totalBudgetCents: null,
  transportationBudgetCents: null,
  lodgingBudgetCents: null,
  foodBudgetCents: null,
  activityBudgetCents: null,
  localTransportationBudgetCents: null,
};

const ALLOCATED: CategoryAllocations = {
  totalBudgetCents: 320_000,
  transportationBudgetCents: 50_000,
  lodgingBudgetCents: 90_000,
  foodBudgetCents: 95_000,
  activityBudgetCents: 55_000,
  localTransportationBudgetCents: 20_000,
};

function ledger(overrides: Partial<Record<string, number>> = {}): LedgerRow[] {
  return BUDGET_CATEGORIES.map((category) => ({
    category,
    plannedCents: overrides[category] ?? 0,
    actualCents: 0,
  }));
}

function find(report: ReturnType<typeof computeBudget>, category: string) {
  return report.categories.find((entry) => entry.category === category)!;
}

describe("computeBudget", () => {
  it("reports one row per category", () => {
    const report = computeBudget(ALLOCATED, ledger());
    expect(report.categories).toHaveLength(BUDGET_CATEGORIES.length);
  });

  it("computes remaining and variance from the allocation", () => {
    const report = computeBudget(ALLOCATED, ledger({ LODGING: 86_700 }));
    const lodging = find(report, "LODGING");
    expect(lodging.remainingCents).toBe(3_300);
    expect(lodging.varianceCents).toBe(-3_300);
    expect(lodging.status).toBe("tight");
  });

  it("flags a category that exceeds its allocation", () => {
    const report = computeBudget(ALLOCATED, ledger({ FOOD: 120_000 }));
    const food = find(report, "FOOD");
    expect(food.status).toBe("over");
    expect(food.varianceCents).toBe(25_000);
    expect(
      report.warnings.some(
        (warning) => warning.category === "FOOD" && warning.severity === "WARNING",
      ),
    ).toBe(true);
  });

  it("calls a comfortable category under", () => {
    const report = computeBudget(ALLOCATED, ledger({ FOOD: 40_000 }));
    expect(find(report, "FOOD").status).toBe("under");
  });

  it("leaves an unallocated category unset rather than at zero", () => {
    const report = computeBudget(ALLOCATED, ledger({ MISCELLANEOUS: 12_000 }));
    const misc = find(report, "MISCELLANEOUS");
    expect(misc.allocatedCents).toBeNull();
    expect(misc.status).toBe("unset");
    expect(misc.remainingCents).toBeNull();
    expect(misc.varianceCents).toBeNull();
  });

  it("counts unallocated spend toward the trip total", () => {
    const report = computeBudget(ALLOCATED, ledger({ MISCELLANEOUS: 12_000 }));
    expect(report.totalPlannedCents).toBe(12_000);
  });

  it("errors when the plan exceeds the total budget", () => {
    const report = computeBudget(ALLOCATED, ledger({ LODGING: 400_000 }));
    expect(report.totalStatus).toBe("over");
    expect(
      report.warnings.some((warning) => warning.severity === "ERROR"),
    ).toBe(true);
    expect(report.totalRemainingCents).toBe(-80_000);
  });

  it("warns before the total is breached, not only after", () => {
    const report = computeBudget(ALLOCATED, ledger({ LODGING: 300_000 }));
    expect(report.totalStatus).toBe("tight");
    expect(
      report.warnings.some(
        (warning) => warning.severity === "WARNING" && warning.category === null,
      ),
    ).toBe(true);
  });

  it("says plainly when there is no budget to measure against", () => {
    const report = computeBudget(NO_ALLOCATIONS, ledger({ FOOD: 40_000 }));
    expect(report.totalStatus).toBe("unset");
    expect(report.totalRemainingCents).toBeNull();
    expect(
      report.warnings.some((warning) => warning.severity === "INFO"),
    ).toBe(true);
  });

  it("stays quiet when nothing is planned and nothing is set", () => {
    expect(computeBudget(NO_ALLOCATIONS, ledger()).warnings).toEqual([]);
  });

  it("reports what is left unallocated across categories", () => {
    const report = computeBudget(ALLOCATED, ledger());
    // 320,000 total minus 310,000 across five categories.
    expect(report.unallocatedCents).toBe(10_000);
  });

  it("errors when category allocations exceed the total", () => {
    const report = computeBudget(
      { ...ALLOCATED, totalBudgetCents: 100_000 },
      ledger(),
    );
    expect(
      report.warnings.some(
        (warning) =>
          warning.severity === "ERROR" &&
          warning.message.includes("add up to more"),
      ),
    ).toBe(true);
  });

  it("warns when real spend passes the plan", () => {
    const rows = ledger({ FOOD: 40_000 }).map((row) =>
      row.category === "FOOD" ? { ...row, actualCents: 55_000 } : row,
    );
    const report = computeBudget(ALLOCATED, rows);
    expect(
      report.warnings.some((warning) =>
        warning.message.includes("passed what was planned"),
      ),
    ).toBe(true);
    expect(report.totalActualCents).toBe(55_000);
  });

  it("treats a zero allocation with spend against it as over", () => {
    const report = computeBudget(
      { ...ALLOCATED, foodBudgetCents: 0 },
      ledger({ FOOD: 100 }),
    );
    expect(find(report, "FOOD").status).toBe("over");
  });

  it("does not divide by zero on a zero allocation", () => {
    const report = computeBudget(
      { ...ALLOCATED, foodBudgetCents: 0 },
      ledger({ FOOD: 0 }),
    );
    expect(find(report, "FOOD").usedFraction).toBeNull();
    expect(find(report, "FOOD").status).toBe("under");
  });

  it("keeps every figure a whole number of cents", () => {
    const report = computeBudget(ALLOCATED, ledger({ FOOD: 33_333 }));
    for (const entry of report.categories) {
      expect(Number.isInteger(entry.plannedCents)).toBe(true);
      if (entry.remainingCents !== null) {
        expect(Number.isInteger(entry.remainingCents)).toBe(true);
      }
    }
  });
});

describe("ledgerFromDays", () => {
  const leg = (costCents: number): TimelineLeg => ({
    id: "l1",
    mode: "SUBWAY",
    durationMinutes: 18,
    distanceMeters: 4_000,
    costCents,
    instructions: "Take the C",
    originLabel: null,
    destinationLabel: null,
    departureTime: null,
    arrivalTime: null,
    legOrder: 0,
  });

  const item = (overrides: Partial<TimelineItem>): TimelineItem => ({
    id: "i1",
    type: "RESTAURANT",
    title: "Lunch",
    description: null,
    startTime: "2026-09-18T11:00:00.000Z",
    endTime: "2026-09-18T12:00:00.000Z",
    durationMinutes: 60,
    locationName: null,
    latitude: null,
    longitude: null,
    placeLink: null,
    estimatedCostCents: 8_400,
    reservationRequired: false,
    reservationStatus: "NOT_REQUIRED",
    priority: "NORMAL",
    source: "AI_SUGGESTION",
    isMustDo: false,
    completed: false,
    isMock: true,
    legs: [],
    ...overrides,
  });

  const day = (items: TimelineItem[]): ItineraryDay => ({
    id: "d1",
    dayNumber: 1,
    date: "2026-09-18",
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
  });

  function get(rows: LedgerRow[], category: string) {
    return rows.find((row) => row.category === category)!.plannedCents;
  }

  it("routes each item type to its category", () => {
    const rows = ledgerFromDays([
      day([
        item({ type: "RESTAURANT", estimatedCostCents: 8_400 }),
        item({ id: "i2", type: "LODGING", estimatedCostCents: 86_700 }),
        item({ id: "i3", type: "SIGHTSEEING", estimatedCostCents: 6_000 }),
        item({ id: "i4", type: "TRAVEL", estimatedCostCents: 21_400 }),
      ]),
    ]);
    expect(get(rows, "FOOD")).toBe(8_400);
    expect(get(rows, "LODGING")).toBe(86_700);
    expect(get(rows, "ACTIVITIES")).toBe(6_000);
    expect(get(rows, "TRANSPORTATION")).toBe(21_400);
  });

  it("counts leg fares as local transportation", () => {
    const rows = ledgerFromDays([
      day([item({ legs: [leg(580)], estimatedCostCents: 0 })]),
    ]);
    expect(get(rows, "LOCAL_TRANSPORTATION")).toBe(580);
  });

  it("adds fares on top of the item they lead to, not instead of it", () => {
    const rows = ledgerFromDays([
      day([item({ estimatedCostCents: 8_400, legs: [leg(580)] })]),
    ]);
    expect(get(rows, "FOOD")).toBe(8_400);
    expect(get(rows, "LOCAL_TRANSPORTATION")).toBe(580);
  });

  it("sums across days", () => {
    const rows = ledgerFromDays([
      day([item({ estimatedCostCents: 8_400 })]),
      day([item({ estimatedCostCents: 6_600 })]),
    ]);
    expect(get(rows, "FOOD")).toBe(15_000);
  });

  it("returns a full set of rows even for an empty trip", () => {
    const rows = ledgerFromDays([]);
    expect(rows).toHaveLength(BUDGET_CATEGORIES.length);
    expect(rows.every((row) => row.plannedCents === 0)).toBe(true);
  });

  it("feeds straight into computeBudget", () => {
    const rows = ledgerFromDays([
      day([item({ estimatedCostCents: 8_400, legs: [leg(580)] })]),
    ]);
    const report = computeBudget(ALLOCATED, rows);
    expect(report.totalPlannedCents).toBe(8_980);
  });
});
