import {
  addItem,
  moveItem,
  removeItem,
  resizeItem,
  type EditContext,
} from "@/lib/travel/edit-itinerary";
import type { ChatCommand } from "@/lib/ai/chat-commands";
import type { ItineraryDay } from "@/types/view";

/**
 * Applies chat commands to an itinerary.
 *
 * Pure: days in, days out. The persistence layer diffs the result and writes
 * it. Keeping this separate from the database is deliberate — the last three
 * regressions all lived in code that could only be exercised through Prisma,
 * and this is the layer where a wrong answer silently rearranges someone's
 * holiday.
 *
 * Commands run through the same edit engine the UI controls use, so a change
 * made by chat recalculates transportation and conflicts exactly as a change
 * made by hand does.
 */

export interface ApplyResult {
  days: ItineraryDay[];
  /** Days that actually changed, so only those need writing. */
  changedDates: string[];
  /** Items whose legs were recomputed. */
  recomputedItemIds: string[];
  /** Ids of items created, in command order. */
  addedItemIds: string[];
  /** Ids of items deleted. */
  removedItemIds: string[];
}

/** Deterministic ids so a preview and its application agree. */
function newItemId(index: number): string {
  return `chat-${index}`;
}

function dayOf(days: ItineraryDay[], date: string): ItineraryDay | undefined {
  return days.find((day) => day.date === date);
}

function dayContaining(
  days: ItineraryDay[],
  itemId: string,
): ItineraryDay | undefined {
  return days.find((day) => day.items.some((item) => item.id === itemId));
}

export function applyCommands(
  days: ItineraryDay[],
  commands: ChatCommand[],
  context: EditContext,
): ApplyResult {
  let working = days.map((day) => ({ ...day, items: [...day.items] }));

  const changed = new Set<string>();
  const recomputed = new Set<string>();
  const addedItemIds: string[] = [];
  const removedItemIds: string[] = [];

  const replace = (updated: ItineraryDay): void => {
    working = working.map((day) => (day.date === updated.date ? updated : day));
    changed.add(updated.date);
  };

  commands.forEach((command, index) => {
    switch (command.kind) {
      case "move": {
        const source = dayContaining(working, command.itemId);
        if (!source) return;

        const item = source.items.find((entry) => entry.id === command.itemId);
        if (!item) return;

        const startMinute =
          command.toStartMinute ?? minuteOf(item.startTime);

        if (source.date === command.toDate) {
          const result = moveItem(source, command.itemId, startMinute, context);
          replace(result.day);
          result.recomputedItemIds.forEach((id) => recomputed.add(id));
          return;
        }

        // Across days: take it off one and put it on the other, so both are
        // recalculated. A move is two edits, not one.
        const target = dayOf(working, command.toDate);
        if (!target) return;

        const removal = removeItem(source, command.itemId, context);
        replace(removal.day);
        removal.recomputedItemIds.forEach((id) => recomputed.add(id));

        const addition = addItem(
          dayOf(working, command.toDate) ?? target,
          {
            type: item.type,
            title: item.title,
            description: item.description ?? "",
            startMinute,
            durationMinutes: item.durationMinutes,
            locationName: item.locationName ?? undefined,
            latitude: item.latitude,
            longitude: item.longitude,
            estimatedCostCents: item.estimatedCostCents,
            reservationRequired: item.reservationRequired,
          },
          context,
          command.itemId,
        );
        replace(addition.day);
        addition.recomputedItemIds.forEach((id) => recomputed.add(id));
        return;
      }

      case "resize": {
        const source = dayContaining(working, command.itemId);
        if (!source) return;
        const result = resizeItem(
          source,
          command.itemId,
          command.durationMinutes,
          context,
        );
        replace(result.day);
        result.recomputedItemIds.forEach((id) => recomputed.add(id));
        return;
      }

      case "remove": {
        const source = dayContaining(working, command.itemId);
        if (!source) return;
        const result = removeItem(source, command.itemId, context);
        replace(result.day);
        result.recomputedItemIds.forEach((id) => recomputed.add(id));
        removedItemIds.push(command.itemId);
        return;
      }

      case "add": {
        const target = dayOf(working, command.date);
        if (!target) return;

        const id = newItemId(index);
        const result = addItem(
          target,
          {
            type: command.type,
            title: command.title,
            description: command.description,
            startMinute: command.startMinute,
            durationMinutes: command.durationMinutes,
            estimatedCostCents: command.estimatedCostCents,
          },
          context,
          id,
        );
        replace(result.day);
        result.recomputedItemIds.forEach((entry) => recomputed.add(entry));
        addedItemIds.push(id);
        return;
      }

      default:
        return;
    }
  });

  return {
    days: working,
    changedDates: [...changed],
    recomputedItemIds: [...recomputed],
    addedItemIds,
    removedItemIds,
  };
}

function minuteOf(iso: string): number {
  const date = new Date(iso);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}
