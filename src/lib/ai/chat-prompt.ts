import { formatMoney } from "@/lib/money";
import type { BudgetReport } from "@/lib/travel/budget";
import type { ItineraryDay } from "@/types/view";

/**
 * Prompt for the per-trip assistant.
 *
 * The model is shown the schedule as it stands and given a fixed command
 * vocabulary. It never writes an itinerary; it proposes changes to one, and
 * the edit engine applies them with the recalculation that entails.
 */

export const CHAT_SYSTEM_PROMPT = `You are the travel assistant inside TripPilot, working on one trip.

You are shown the traveler's current schedule. You answer their question and, when they ask for a change, return the commands to make it.

Rules:
1. Only reference item ids that appear in the schedule below. Never invent one.
2. Only use dates that are days of this trip.
3. Every place in a day is connected by real journeys the app computes from your times. Leave enough room between things — items that touch or overlap produce a day that cannot be walked.
4. Do not reschedule anything the traveler did not ask you to touch. A request to move one thing is not permission to rebuild the day.
5. If you cannot do what was asked — the place is not in the trip's options, the day has no room, the request is unclear — say so plainly and return no commands. A refusal with a reason is more useful than a change nobody wanted.
6. Answer questions without commands when nothing needs to change.

Return ONLY a JSON object. No prose outside it, no markdown fences.

{
  "reply": "what you say to the traveler, in one or two sentences",
  "declined": false,
  "commands": []
}

Command shapes:

Move something:
{ "kind": "move", "itemId": "...", "toDate": "YYYY-MM-DD", "toStartMinute": 840 }
toStartMinute is minutes from local midnight; 2:00 PM is 840. Use null to keep the current time.

Change how long something takes:
{ "kind": "resize", "itemId": "...", "durationMinutes": 90 }

Take something off the schedule:
{ "kind": "remove", "itemId": "..." }

Add something:
{ "kind": "add", "date": "YYYY-MM-DD", "type": "RESTAURANT", "title": "...", "description": "", "startMinute": 1140, "durationMinutes": 90, "candidateId": null, "estimatedCostCents": 0 }

Valid types: TRAVEL, LODGING, RESTAURANT, ACTIVITY, EXCURSION, SIGHTSEEING, TRANSPORTATION, WALKING, FREE_TIME, OTHER.

Set candidateId only to an id from the available options listed below. If the traveler names somewhere not in those options, you may still add it with candidateId null — but say in your reply that it is not from the trip's known places, so no cost or travel time can be worked out for it.`;

function clock(minute: number): string {
  const hour = String(Math.floor(minute / 60)).padStart(2, "0");
  return `${hour}:${String(minute % 60).padStart(2, "0")}`;
}

function minuteOf(iso: string): number {
  const date = new Date(iso);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

export interface ChatPromptInput {
  destination: string;
  days: ItineraryDay[];
  budget: BudgetReport | null;
  currency: string;
  /** Candidate options the trip was planned from, so additions can be real. */
  options: { id: string; name: string; kind: string; costCents: number }[];
  /** Earlier turns, oldest first. */
  history: { role: "user" | "assistant"; content: string }[];
  message: string;
}

export function buildChatPrompt(input: ChatPromptInput): string {
  const lines: string[] = [];

  lines.push(`Trip to ${input.destination}.`);
  lines.push("");
  lines.push("CURRENT SCHEDULE:");

  for (const day of input.days) {
    lines.push("");
    lines.push(`${day.date} (day ${day.dayNumber}):`);

    if (day.items.length === 0) {
      lines.push("  nothing scheduled");
      continue;
    }

    for (const item of day.items) {
      const start = minuteOf(item.startTime);
      const travel = item.legs.reduce(
        (sum, leg) => sum + leg.durationMinutes,
        0,
      );
      lines.push(
        `  ${item.id} | ${clock(start)}-${clock(
          start + item.durationMinutes,
        )} | ${item.type} | ${item.title}${
          item.locationName ? ` @ ${item.locationName}` : ""
        }${item.estimatedCostCents > 0 ? ` | ${formatMoney(item.estimatedCostCents, input.currency)}` : ""}${
          travel > 0 ? ` | ${travel} min to get here` : ""
        }${item.isMustDo ? " | MUST-DO" : ""}`,
      );
    }
  }

  if (input.budget) {
    lines.push("");
    lines.push("BUDGET:");
    lines.push(
      `  planned ${formatMoney(input.budget.totalPlannedCents, input.currency)}${
        input.budget.totalAllocatedCents !== null
          ? ` of ${formatMoney(input.budget.totalAllocatedCents, input.currency)}`
          : " (no total budget set)"
      }`,
    );
    if (input.budget.totalStatus === "over") {
      lines.push("  this trip is already over budget");
    }
  }

  if (input.options.length > 0) {
    lines.push("");
    lines.push("AVAILABLE OPTIONS (use these ids for candidateId):");
    for (const option of input.options.slice(0, 40)) {
      lines.push(
        `  ${option.id} | ${option.name} | ${option.kind}${
          option.costCents > 0
            ? ` | ${formatMoney(option.costCents, input.currency)}`
            : ""
        }`,
      );
    }
  }

  if (input.history.length > 0) {
    lines.push("");
    lines.push("EARLIER IN THIS CONVERSATION:");
    for (const turn of input.history.slice(-6)) {
      lines.push(`  ${turn.role === "user" ? "Traveler" : "You"}: ${turn.content}`);
    }
  }

  lines.push("");
  lines.push(`TRAVELER: ${input.message}`);
  lines.push("");
  lines.push("Return the JSON object now.");

  return lines.join("\n");
}
