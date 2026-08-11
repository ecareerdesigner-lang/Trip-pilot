import { z } from "zod";
import { ITINERARY_ITEM_TYPES } from "@/types/domain";

/**
 * The contract the planner must return.
 *
 * Strict on purpose. The model selects and sequences; it does not supply
 * facts. Prices, coordinates, opening hours and names come from the
 * candidate referenced by `candidateId` — so a hallucinated restaurant name
 * cannot reach the itinerary, because an unknown id fails validation and a
 * known id overrides whatever the model wrote.
 */

export const plannedItemSchema = z.object({
  /**
   * Reference to a candidate supplied in the prompt. Null only for items
   * that are not a place: free time, or travel legs the builder computes.
   */
  candidateId: z.string().trim().nullable(),
  type: z.enum(ITINERARY_ITEM_TYPES),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(600).default(""),
  /** Minutes from local midnight. 8:30 AM is 510. */
  startMinute: z.number().int().min(0).max(1_439),
  durationMinutes: z.number().int().min(5).max(720),
  /** Title of the must-do this item satisfies, when it satisfies one. */
  satisfiesMustDo: z.string().trim().nullable().default(null),
});

export const plannedDaySchema = z.object({
  /** Calendar date, YYYY-MM-DD. Must be a day the trip covers. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  summary: z.string().trim().max(300).default(""),
  items: z.array(plannedItemSchema).min(1).max(20),
});

export const planSchema = z.object({
  tripSummary: z.string().trim().max(800).default(""),
  days: z.array(plannedDaySchema).min(1).max(60),
});

export type PlannedItem = z.infer<typeof plannedItemSchema>;
export type PlannedDay = z.infer<typeof plannedDaySchema>;
export type Plan = z.infer<typeof planSchema>;

/**
 * Parse a model response into a plan.
 *
 * Models wrap JSON in prose or fences even when told not to, so the outer
 * braces are located rather than trusting the whole string to be JSON.
 * Anything that still fails the schema is rejected outright — a partially
 * trusted itinerary is worse than none.
 */
export function parsePlan(raw: string): Plan {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("The planner did not return JSON.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new Error("The planner returned malformed JSON.");
  }

  return planSchema.parse(parsed);
}
