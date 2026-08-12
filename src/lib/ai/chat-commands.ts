import { z } from "zod";
import { ITINERARY_ITEM_TYPES } from "@/types/domain";

/**
 * What the trip assistant is allowed to do.
 *
 * The model does not edit the itinerary. It returns commands from this fixed
 * vocabulary, which the edit engine applies — the same engine the UI controls
 * use, with the same recalculation of transportation and conflicts.
 *
 * Two reasons it works this way. A model asked to emit a whole itinerary will
 * quietly drop the items it was not thinking about. And a fixed vocabulary is
 * reviewable: the traveler sees "move the museum to 2pm on Thursday", not a
 * wall of JSON they have to trust.
 */

const itemRef = z
  .string()
  .trim()
  .min(1)
  .describe("The id of an item already on the schedule.");

export const moveCommandSchema = z.object({
  kind: z.literal("move"),
  itemId: itemRef,
  /** Calendar date to move it to. Same day when unchanged. */
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Minutes from local midnight. Null keeps the current time. */
  toStartMinute: z.number().int().min(0).max(1_439).nullable(),
});

export const resizeCommandSchema = z.object({
  kind: z.literal("resize"),
  itemId: itemRef,
  durationMinutes: z.number().int().min(5).max(720),
});

export const removeCommandSchema = z.object({
  kind: z.literal("remove"),
  itemId: itemRef,
});

export const addCommandSchema = z.object({
  kind: z.literal("add"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(ITINERARY_ITEM_TYPES),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(600).default(""),
  startMinute: z.number().int().min(0).max(1_439),
  durationMinutes: z.number().int().min(5).max(720),
  /**
   * A candidate from the trip's stored options. Null means the traveler
   * named something the providers do not know about — it is scheduled, but
   * without coordinates, so no journey can be computed to it.
   */
  candidateId: z.string().trim().nullable().default(null),
  estimatedCostCents: z.number().int().min(0).default(0),
});

export const commandSchema = z.discriminatedUnion("kind", [
  moveCommandSchema,
  resizeCommandSchema,
  removeCommandSchema,
  addCommandSchema,
]);

export type ChatCommand = z.infer<typeof commandSchema>;

export const chatResponseSchema = z.object({
  /** What the assistant says back. Always present, even with no commands. */
  reply: z.string().trim().min(1).max(1_200),
  commands: z.array(commandSchema).max(20).default([]),
  /**
   * True when the assistant could not do what was asked. The reply explains
   * why, and no commands are returned.
   */
  declined: z.boolean().default(false),
});

export type ChatResponse = z.infer<typeof chatResponseSchema>;

/**
 * Parse a model reply.
 *
 * Same recovery as the planner: models wrap JSON in prose even when told not
 * to, so the braces are located rather than trusting the whole string.
 */
export function parseChatResponse(raw: string): ChatResponse {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("The assistant did not return a usable response.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new Error("The assistant returned malformed JSON.");
  }

  return chatResponseSchema.parse(parsed);
}

/**
 * A sentence the traveler can check before anything is applied.
 *
 * Commands reference ids, which mean nothing on screen. This turns each one
 * into something reviewable — the whole point of previewing rather than
 * applying blind.
 */
export function describeCommand(
  command: ChatCommand,
  titleById: Map<string, string>,
): string {
  const nameOf = (id: string): string => titleById.get(id) ?? "an item";

  switch (command.kind) {
    case "move": {
      const when =
        command.toStartMinute === null
          ? `to ${command.toDate}`
          : `to ${command.toDate} at ${formatClock(command.toStartMinute)}`;
      return `Move ${nameOf(command.itemId)} ${when}`;
    }
    case "resize":
      return `Change ${nameOf(command.itemId)} to ${formatDuration(
        command.durationMinutes,
      )}`;
    case "remove":
      return `Remove ${nameOf(command.itemId)}`;
    case "add":
      return `Add ${command.title} on ${command.date} at ${formatClock(
        command.startMinute,
      )} for ${formatDuration(command.durationMinutes)}`;
    default:
      return "Unrecognised change";
  }
}

function formatClock(minute: number): string {
  const hour24 = Math.floor(minute / 60) % 24;
  const minutes = String(minute % 60).padStart(2, "0");
  const suffix = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minutes} ${suffix}`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/**
 * Reject commands that cannot be applied to this trip.
 *
 * A model that references an item from a day it hallucinated, or a date
 * outside the trip, must not reach the edit engine. Rejections are reported
 * to the traveler rather than dropped silently — a request that half worked
 * is worse than one that plainly did not.
 */
export interface CommandCheck {
  accepted: ChatCommand[];
  rejected: { command: ChatCommand; reason: string }[];
}

export function screenCommands(
  commands: ChatCommand[],
  knownItemIds: Set<string>,
  tripDates: Set<string>,
): CommandCheck {
  const accepted: ChatCommand[] = [];
  const rejected: { command: ChatCommand; reason: string }[] = [];

  for (const command of commands) {
    if (command.kind === "add") {
      if (!tripDates.has(command.date)) {
        rejected.push({
          command,
          reason: `${command.date} is not a day of this trip.`,
        });
        continue;
      }
      accepted.push(command);
      continue;
    }

    if (!knownItemIds.has(command.itemId)) {
      rejected.push({
        command,
        reason: "That item is not on the schedule.",
      });
      continue;
    }

    if (command.kind === "move" && !tripDates.has(command.toDate)) {
      rejected.push({
        command,
        reason: `${command.toDate} is not a day of this trip.`,
      });
      continue;
    }

    accepted.push(command);
  }

  return { accepted, rejected };
}
