import "server-only";
import { isAiConfigured, providerMode } from "@/lib/env";
import { logger } from "@/lib/logger";
import { complete } from "@/lib/ai/client";
import { SYSTEM_PROMPT, buildUserPrompt } from "@/lib/ai/prompt";
import { parsePlan, type Plan } from "@/lib/ai/schema";
import { collectCandidates } from "@/lib/travel/candidates";
import { planHeuristically } from "@/lib/travel/heuristic-planner";
import { buildPlan, type BuiltPlan, type BuiltItem, type BuiltLeg } from "@/lib/travel/plan-builder";
import { buildTripDays } from "@/lib/travel/trip-setup";
import { getTransitProvider } from "@/lib/providers/transit";
import type { TransitRoute } from "@/lib/providers/types";
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

/**
 * Replaces estimated leg data with real transit data, once, after the
 * schedule is already decided.
 *
 * `planRoute()` — what `buildPlan` and the optimizer use — stays pure and
 * synchronous on purpose: the optimizer calls it thousands of times while
 * rearranging a day, and a live network call at that rate would be slow and
 * would burn through a free-tier quota fast. So the schedule itself (which
 * items land when) is always decided from the fast estimate.
 *
 * This runs after that decision is final. For each unique origin/destination
 * pair actually in the built itinerary, it calls the live provider once,
 * caches the result for this generation, and re-times the returned legs
 * backward from the item's already-decided start time — the same backward
 * cursor `legsInto()` uses — so the last leg still lands exactly when the
 * item starts. The schedule does not move; only what each leg says about
 * itself does.
 *
 * A single leg's live lookup failing does not fail the whole itinerary — the
 * estimate already on that item stands, which is a real number, just not
 * necessarily today's number.
 *
 * Known gap: this enriches the itinerary generation path only. An item
 * moved later by a drag-and-drop edit or a chat command recomputes its
 * journey through `planRoute()` directly (see `recomputeDayLegs` in
 * `repositories/trips.ts`), so an edited leg reverts to the estimate until
 * that path is enriched too.
 */
async function enrichLegsWithLiveTransit(
  items: BuiltItem[],
  input: { destination: string; travelers: number; transportPreferences: TransportPreference[] },
): Promise<void> {
  if (providerMode("transit") !== "google") return;

  const provider = getTransitProvider();
  const cache = new Map<string, TransitRoute>();

  const byDay = new Map<string, BuiltItem[]>();
  for (const item of items) {
    const list = byDay.get(item.date) ?? [];
    list.push(item);
    byDay.set(item.date, list);
  }

  for (const dayItems of byDay.values()) {
    const ordered = [...dayItems].sort((a, b) => a.sortOrder - b.sortOrder);

    for (let i = 1; i < ordered.length; i += 1) {
      const from = ordered[i - 1]!;
      const to = ordered[i]!;
      if (to.legs.length === 0) continue;

      const originLat = from.place?.latitude;
      const originLng = from.place?.longitude;
      const destLat = to.place?.latitude;
      const destLng = to.place?.longitude;
      if (
        originLat == null ||
        originLng == null ||
        destLat == null ||
        destLng == null
      ) {
        continue;
      }

      const key = `${originLat},${originLng}->${destLat},${destLng}`;
      let route = cache.get(key);

      if (!route) {
        try {
          route = await provider.route({
            destination: input.destination,
            origin: { latitude: originLat, longitude: originLng },
            destinationPoint: { latitude: destLat, longitude: destLng },
            originLabel: from.title,
            destinationLabel: to.title,
            preferences: input.transportPreferences,
            travelers: input.travelers,
          });
          cache.set(key, route);
        } catch (error) {
          logger.warn("Live transit lookup failed, keeping the estimate", {
            message: error instanceof Error ? error.message : String(error),
          });
          continue;
        }
      }

      let cursor = to.startTime.getTime();
      const reTimed: BuiltLeg[] = [];
      for (let j = route.legs.length - 1; j >= 0; j -= 1) {
        const leg = route.legs[j]!;
        const arrivalTime = new Date(cursor);
        cursor -= leg.durationMinutes * 60_000;
        const departureTime = new Date(cursor);
        reTimed.unshift({ ...leg, legOrder: j, departureTime, arrivalTime });
      }
      to.legs = reTimed;
    }
  }
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

  try {
    await enrichLegsWithLiveTransit(built.items, {
      destination: input.destination,
      travelers: input.travelers,
      transportPreferences: input.transportPreferences,
    });
  } catch (error) {
    // The whole point of enriching after the schedule is decided is that a
    // problem here costs accuracy, not the trip. Log it and move on with
    // whatever estimates buildPlan already produced.
    logger.warn("Live transit enrichment failed, itinerary uses estimates", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

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

  if (built.duplicateCandidateIds.length > 0) {
    logger.warn("Planner scheduled the same candidate more than once", {
      count: built.duplicateCandidateIds.length,
    });
    warnings.push(
      `${built.duplicateCandidateIds.length} item${
        built.duplicateCandidateIds.length === 1 ? " was" : "s were"
      } suggested more than once and only scheduled the first time.`,
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
