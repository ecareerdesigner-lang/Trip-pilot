import { BUDGET_CATEGORIES, type BudgetCategory } from "@/types/domain";
import type { ItineraryDay } from "@/types/view";

/**
 * Budget engine.
 *
 * Answers one question per category: is this trip going to cost more than the
 * traveler said they could spend? Everything is integer cents and every
 * figure is derived, so nothing here can drift out of date with the schedule.
 *
 * Three numbers, deliberately kept apart:
 *   allocated — what the traveler said the category could take
 *   planned   — what the current schedule adds up to
 *   actual    — what has really been paid so far
 */

export interface CategoryAllocations {
  totalBudgetCents: number | null;
  transportationBudgetCents: number | null;
  lodgingBudgetCents: number | null;
  foodBudgetCents: number | null;
  activityBudgetCents: number | null;
  localTransportationBudgetCents: number | null;
}

export interface LedgerRow {
  category: BudgetCategory;
  plannedCents: number;
  actualCents: number;
}

export type BudgetStatus = "under" | "tight" | "over" | "unset";

export interface CategoryBudget {
  category: BudgetCategory;
  /** Null when the traveler did not set an amount for this category. */
  allocatedCents: number | null;
  plannedCents: number;
  actualCents: number;
  /** Allocated minus planned. Null when nothing was allocated. */
  remainingCents: number | null;
  /** Planned minus allocated. Positive means over. Null when unallocated. */
  varianceCents: number | null;
  /** Fraction of the allocation the plan consumes. Null when unallocated. */
  usedFraction: number | null;
  status: BudgetStatus;
}

export interface BudgetWarning {
  severity: "ERROR" | "WARNING" | "INFO";
  category: BudgetCategory | null;
  message: string;
}

export interface BudgetReport {
  categories: CategoryBudget[];
  totalAllocatedCents: number | null;
  totalPlannedCents: number;
  totalActualCents: number;
  /** Total budget minus the sum of category allocations. */
  unallocatedCents: number | null;
  totalRemainingCents: number | null;
  totalStatus: BudgetStatus;
  warnings: BudgetWarning[];
}

/** At this fraction of an allocation, the traveler should know. */
const TIGHT_THRESHOLD = 0.9;

const ALLOCATION_FIELD: Record<BudgetCategory, keyof CategoryAllocations | null> = {
  TRANSPORTATION: "transportationBudgetCents",
  LODGING: "lodgingBudgetCents",
  FOOD: "foodBudgetCents",
  ACTIVITIES: "activityBudgetCents",
  LOCAL_TRANSPORTATION: "localTransportationBudgetCents",
  // Nobody budgets for "everything else" up front; it is measured, not set.
  MISCELLANEOUS: null,
};

function statusFor(
  allocated: number | null,
  planned: number,
): { status: BudgetStatus; usedFraction: number | null } {
  if (allocated === null) return { status: "unset", usedFraction: null };
  if (allocated === 0) {
    return { status: planned > 0 ? "over" : "under", usedFraction: null };
  }

  const usedFraction = planned / allocated;
  if (usedFraction > 1) return { status: "over", usedFraction };
  if (usedFraction >= TIGHT_THRESHOLD) return { status: "tight", usedFraction };
  return { status: "under", usedFraction };
}

function label(category: BudgetCategory): string {
  return category.toLowerCase().replace(/_/g, " ");
}

export function computeBudget(
  allocations: CategoryAllocations,
  ledger: LedgerRow[],
): BudgetReport {
  const byCategory = new Map(ledger.map((row) => [row.category, row]));

  const categories: CategoryBudget[] = BUDGET_CATEGORIES.map((category) => {
    const field = ALLOCATION_FIELD[category];
    const allocatedCents = field === null ? null : allocations[field];
    const row = byCategory.get(category);
    const plannedCents = row?.plannedCents ?? 0;
    const actualCents = row?.actualCents ?? 0;
    const { status, usedFraction } = statusFor(allocatedCents, plannedCents);

    return {
      category,
      allocatedCents,
      plannedCents,
      actualCents,
      remainingCents: allocatedCents === null ? null : allocatedCents - plannedCents,
      varianceCents: allocatedCents === null ? null : plannedCents - allocatedCents,
      usedFraction,
      status,
    };
  });

  const totalPlannedCents = categories.reduce(
    (sum, entry) => sum + entry.plannedCents,
    0,
  );
  const totalActualCents = categories.reduce(
    (sum, entry) => sum + entry.actualCents,
    0,
  );
  const totalAllocatedCents = allocations.totalBudgetCents;

  const categorySum = categories.reduce(
    (sum, entry) => sum + (entry.allocatedCents ?? 0),
    0,
  );

  const { status: totalStatus } = statusFor(totalAllocatedCents, totalPlannedCents);

  const warnings: BudgetWarning[] = [];

  if (totalAllocatedCents !== null) {
    const over = totalPlannedCents - totalAllocatedCents;
    if (over > 0) {
      warnings.push({
        severity: "ERROR",
        category: null,
        message: `This trip is planned to cost ${formatDelta(over)} more than the total budget.`,
      });
    } else if (totalStatus === "tight") {
      warnings.push({
        severity: "WARNING",
        category: null,
        message: `The plan uses ${Math.round(
          (totalPlannedCents / totalAllocatedCents) * 100,
        )}% of the total budget, leaving little room for anything unexpected.`,
      });
    }
  } else if (totalPlannedCents > 0) {
    warnings.push({
      severity: "INFO",
      category: null,
      message:
        "No total budget was set, so there is nothing to measure this plan against.",
    });
  }

  for (const entry of categories) {
    if (entry.status === "over" && entry.allocatedCents !== null) {
      warnings.push({
        severity: "WARNING",
        category: entry.category,
        message: `${capitalize(label(entry.category))} is over its allocation by ${formatDelta(
          entry.plannedCents - entry.allocatedCents,
        )}.`,
      });
    }
    if (entry.actualCents > entry.plannedCents && entry.plannedCents > 0) {
      warnings.push({
        severity: "WARNING",
        category: entry.category,
        message: `Actual spend on ${label(entry.category)} has passed what was planned.`,
      });
    }
  }

  if (totalAllocatedCents !== null && categorySum > totalAllocatedCents) {
    warnings.push({
      severity: "ERROR",
      category: null,
      message:
        "The category allocations add up to more than the total budget.",
    });
  }

  return {
    categories,
    totalAllocatedCents,
    totalPlannedCents,
    totalActualCents,
    unallocatedCents:
      totalAllocatedCents === null ? null : totalAllocatedCents - categorySum,
    totalRemainingCents:
      totalAllocatedCents === null ? null : totalAllocatedCents - totalPlannedCents,
    totalStatus,
    warnings,
  };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Cents to a bare currency string for embedding in a sentence. */
function formatDelta(cents: number): string {
  const dollars = Math.abs(cents) / 100;
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Recompute the ledger from the schedule.
 *
 * Planned spend is derived, never stored independently: an item that moves
 * days or a leg that changes mode must be reflected without anybody
 * remembering to update a second number.
 */
export function ledgerFromDays(days: ItineraryDay[]): LedgerRow[] {
  const planned = new Map<BudgetCategory, number>();

  for (const day of days) {
    for (const item of day.items) {
      const category = categoryForType(item.type);
      planned.set(
        category,
        (planned.get(category) ?? 0) + item.estimatedCostCents,
      );

      const fares = item.legs.reduce((sum, leg) => sum + leg.costCents, 0);
      if (fares > 0) {
        planned.set(
          "LOCAL_TRANSPORTATION",
          (planned.get("LOCAL_TRANSPORTATION") ?? 0) + fares,
        );
      }
    }
  }

  return BUDGET_CATEGORIES.map((category) => ({
    category,
    plannedCents: planned.get(category) ?? 0,
    actualCents: 0,
  }));
}

function categoryForType(type: ItineraryDay["items"][number]["type"]): BudgetCategory {
  switch (type) {
    case "TRAVEL":
      return "TRANSPORTATION";
    case "LODGING":
      return "LODGING";
    case "RESTAURANT":
      return "FOOD";
    case "ACTIVITY":
    case "EXCURSION":
    case "SIGHTSEEING":
      return "ACTIVITIES";
    case "TRANSPORTATION":
    case "WALKING":
      return "LOCAL_TRANSPORTATION";
    default:
      return "MISCELLANEOUS";
  }
}
