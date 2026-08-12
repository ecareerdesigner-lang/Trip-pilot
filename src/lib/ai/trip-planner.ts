import "server-only";
import { isAiConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";
import { complete } from "@/lib/ai/client";
import { SYSTEM_PROMPT, buildUserPrompt } from "@/lib/ai/prompt";
import { parsePlan, type Plan } from "@/lib/ai/schema";
import { collectCandidates } from "@/lib/travel/candidates";
import { planHeuristically } from "@/lib/travel/heuristic-planner";
import { buildPlan, type BuiltPlan } from "@/lib/travel/plan-builder";
import { buildTripDays } from "@/lib/travel/trip-setup";
import type {
  FoodPreference,
  Pace,
  TransportPreference,
} from "@/types/domain";

/**
 * The generation pipeline.
 *
 *   USER INPUT -> DATA COLLECTION -> REAL OPTIONS -> AI PLANNING
 *   -> VALIDATION -> STRUCTURED ITINERARY
 *
 * Validation here means the Zod schema and the plan builder's candidate
 * resolution. The reality-check engine (Phase 18) runs after this and is what
 * catches a schedule that is well-formed but impossible.
 */

export interface GenerateInput {
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;
  travelers: number;
  pace: Pace;
  foodPreference: FoodPreference;
  transportPreferences: TransportPreference[];
  mustDos: { title: string; description: string }[];
  notes: string;
  totalBudgetCents: number | null;
  lodgingBudgetCents: number | null;
  dayStartMinute?: number;
  dayEndMinute?: number;
}

export interface GenerateResult {
  plan: BuiltPlan;
  /** Which planner produced this, surfaced to the traveler verbatim. */
  plannedBy: "ai" | "heuristic";
  /** True when no provider had data for this destination. */
  destinationUncovered: boolean;
  warnings: string[];
}

export async function generateItinerary(
  input: GenerateInput,
): Promise<GenerateResult> {
  const dayStartMinute = input.dayStartMinute ?? 8 * 60;
  const dayEndMinute = input.dayEndMinute ?? 22 * 60;
  const dayDates = buildTripDays(input.startDate, input.endDate).map((day) =>
    day.date.toISOString().slice(0, 10),
  );

  const nights = Math.max(1, dayDates.length - 1);
  const candidates = await collectCandidates({
    destination: input.destination,
    startDate: input.startDate,
    endDate: input.endDate,
    travelers: input.travelers,
    ...(input.lodgingBudgetCents !== null
      ? { maxNightlyRateCents: Math.floor(input.lodgingBudgetCents / nights) }
      : {}),
  });

  const warnings: string[] = [];

  if (candidates.empty) {
    warnings.push(
      `There is no sample data for ${input.destination}. Connect a travel provider to plan trips there.`,
    );
  }

  const heuristicInput = {
    destination: input.destination,
    transportPreferences: input.transportPreferences,
    dayDates,
    pace: input.pace,
    travelers: input.travelers,
    mustDos: input.mustDos,
    candidates,
    dayStartMinute,
    dayEndMinute,
  };

  let plan: Plan;
  let plannedBy: GenerateResult["plannedBy"] = "heuristic";

  if (isAiConfigured() && !candidates.empty) {
    try {
      const raw = await complete({
        system: SYSTEM_PROMPT,
        prompt: buildUserPrompt({
          origin: input.origin,
          destination: input.destination,
          dayDates,
          travelers: input.travelers,
          pace: input.pace,
          foodPreference: input.foodPreference,
          transportPreferences: input.transportPreferences,
          mustDos: input.mustDos,
          notes: input.notes,
          totalBudgetCents: input.totalBudgetCents,
          dayStartMinute,
          dayEndMinute,
          candidates,
        }),
      });
      plan = parsePlan(raw);
      plannedBy = "ai";
    } catch (error) {
      // A failed model call must not lose the trip. Fall back to the
      // deterministic planner and say so rather than returning nothing.
      logger.warn("AI planning failed, falling back to the heuristic planner", {
        message: error instanceof Error ? error.message : String(error),
      });
      warnings.push(
        "The AI planner was unavailable, so this itinerary was built from a simpler rule-based planner. Regenerating may give a better result.",
      );
      plan = planHeuristically(heuristicInput);
    }
  } else {
    plan = planHeuristically(heuristicInput);
  }

  const built = buildPlan(plan, {
    destination: input.destination,
    travelers: input.travelers,
    preferences: input.transportPreferences,
    candidates,
    dayDates,
    pace: input.pace,
  });

  if (built.unknownCandidateIds.length > 0) {
    logger.warn("Planner referenced unknown candidates", {
      count: built.unknownCandidateIds.length,
    });
    warnings.push(
      `${built.unknownCandidateIds.length} suggested item${
        built.unknownCandidateIds.length === 1 ? " was" : "s were"
      } dropped because they did not match a real place.`,
    );
  }

  if (built.shiftedItems.length > 0) {
    warnings.push(
      `${built.shiftedItems.length} item${
        built.shiftedItems.length === 1 ? " was" : "s were"
      } moved later so there was time to travel between stops.`,
    );
  }

  const scheduled = new Set(
    built.items
      .map((item) => item.satisfiesMustDo)
      .filter((title): title is string => title !== null),
  );
  const missed = input.mustDos.filter(
    (mustDo) => !scheduled.has(mustDo.title),
  );
  if (missed.length > 0) {
    warnings.push(
      `Could not schedule: ${missed.map((mustDo) => mustDo.title).join(", ")}.`,
    );
  }

  return {
    plan: built,
    plannedBy,
    destinationUncovered: candidates.empty,
    warnings,
  };
}
