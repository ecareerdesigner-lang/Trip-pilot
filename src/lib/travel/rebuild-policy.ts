import type { ItemSource } from "@/types/domain";

/**
 * What survives a rebuild.
 *
 * This lived inline in a Prisma `deleteMany` filter, which meant it could not
 * be tested without a database — and it was wrong for three releases. An item
 * satisfying a must-do was being preserved across regenerations, so each
 * rebuild stacked another copy of the same place on the same day.
 *
 * The rule is one sentence: the traveler's own additions survive, everything
 * this app generated is replaced. `MUST_DO` describes why an item was
 * scheduled, not who scheduled it — a must-do item is still generated, and
 * the next generation will place that must-do again.
 */

/** True when a rebuild must leave this item alone. */
export function survivesRebuild(source: ItemSource): boolean {
  return source === "USER";
}

/** Sources a rebuild clears. Kept as the single source of truth for the query. */
export const REPLACED_ON_REBUILD: ItemSource[] = [
  "AI_SUGGESTION",
  "SYSTEM",
  "PROVIDER",
  "MUST_DO",
];

/**
 * Must-dos linked to a rebuilt item point at a row that is about to be
 * deleted, so they return to unscheduled. A must-do the traveler already
 * completed keeps its status — that is a record of what happened, not a plan.
 */
export function resetsOnRebuild(status: string): boolean {
  return status !== "COMPLETED";
}
