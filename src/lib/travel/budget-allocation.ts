import { DEFAULT_BUDGET_WEIGHTS } from "@/lib/constants";
import { allocateCents } from "@/lib/money";
import { BUDGET_CATEGORIES, type BudgetCategory } from "@/types/domain";

/**
 * Budget allocation.
 *
 * When a traveler gives a total but no category amounts, the categories are
 * derived from it. When they give some, the rest share what is left — a
 * traveler who says "lodging is $900" has told us something real, and the
 * suggestion should respect it rather than override it.
 *
 * Pure and exact: every allocation sums to the input total, no rounding drift.
 */

export type CategoryAmounts = Record<BudgetCategory, number>;

export type PartialCategoryAmounts = Partial<
  Record<BudgetCategory, number | null>
>;

export interface AllocationResult {
  amounts: CategoryAmounts;
  /** Categories the traveler set explicitly, left untouched. */
  fixed: BudgetCategory[];
  /** Categories filled in from the remaining budget. */
  derived: BudgetCategory[];
  /** Cents left over after fixed amounts. Negative means over-allocated. */
  remainingCents: number;
}

function emptyAmounts(): CategoryAmounts {
  return {
    TRANSPORTATION: 0,
    LODGING: 0,
    FOOD: 0,
    ACTIVITIES: 0,
    LOCAL_TRANSPORTATION: 0,
    MISCELLANEOUS: 0,
  };
}

/**
 * Split `totalCents` across the categories, honouring any explicit amounts.
 *
 * Over-allocation is reported rather than corrected — silently shrinking an
 * amount the traveler typed would be worse than telling them it does not fit.
 */
export function allocateBudget(
  totalCents: number,
  explicit: PartialCategoryAmounts = {},
): AllocationResult {
  const amounts = emptyAmounts();
  const fixed: BudgetCategory[] = [];
  const derived: BudgetCategory[] = [];

  let fixedTotal = 0;
  for (const category of BUDGET_CATEGORIES) {
    const value = explicit[category];
    if (value !== null && value !== undefined) {
      amounts[category] = value;
      fixedTotal += value;
      fixed.push(category);
    } else {
      derived.push(category);
    }
  }

  const remainingCents = totalCents - fixedTotal;

  if (derived.length > 0 && remainingCents > 0) {
    const weights = derived.map((category) => DEFAULT_BUDGET_WEIGHTS[category]);
    const split = allocateCents(remainingCents, weights);
    derived.forEach((category, index) => {
      amounts[category] = split[index] ?? 0;
    });
  }

  return { amounts, fixed, derived, remainingCents };
}

export interface BudgetSummary {
  totalCents: number;
  allocatedCents: number;
  /** Total minus allocated. Negative when categories exceed the total. */
  unallocatedCents: number;
  overAllocated: boolean;
}

export function summarizeBudget(
  totalCents: number | null,
  explicit: PartialCategoryAmounts,
): BudgetSummary {
  const allocatedCents = BUDGET_CATEGORIES.reduce((sum, category) => {
    const value = explicit[category];
    return sum + (value ?? 0);
  }, 0);

  const total = totalCents ?? 0;
  return {
    totalCents: total,
    allocatedCents,
    unallocatedCents: total - allocatedCents,
    overAllocated: totalCents !== null && allocatedCents > totalCents,
  };
}

/**
 * A rough per-day, per-traveler figure, for telling someone their $400 week
 * in London is going to be tight before they spend an hour on the wizard.
 */
export function dailyPerTravelerCents(
  totalCents: number,
  days: number,
  travelers: number,
): number {
  if (days <= 0 || travelers <= 0) return 0;
  return Math.floor(totalCents / days / travelers);
}
