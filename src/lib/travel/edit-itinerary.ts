import { planRoute } from "@/lib/travel/routing";
import type { TransportPreference, ItineraryItemType } from "@/types/domain";
import type { ItineraryDay, TimelineItem, TimelineLeg } from "@/types/view";

/**
 * Itinerary edits, as pure functions.
 *
 * Every operation takes a day and returns a new one. Nothing here touches
 * Prisma, and nothing mutates its input — which is the point. The last three
 * regressions in this project all lived in logic buried inside database
 * calls, where they could not be tested. The persistence layer is a thin
 * wrapper over these; the decisions are here.
 *
 * When an item moves, the journeys into and out of it are recomputed. That is
 * the whole reason transportation is first-class data: moving the museum an
 * hour later changes how long it takes to reach dinner, and the traveler
 * should not have to work that out.
 */

export interface EditContext {
  destination: string;
  travelers: number;
  preferences: TransportPreference[];
}

export interface NewItemInput {
  type: ItineraryItemType;
  title: string;
  description?: string;
  /** Minutes from midnight. */
  startMinute: number;
  durationMinutes: number;
  locationName?: string;
  latitude?: number | null;
  longitude?: number | null;
  estimatedCostCents?: number;
  reservationRequired?: boolean;
}

export interface EditResult {
  day: ItineraryDay;
  /** Items whose legs were recomputed, so the caller knows what to persist. */
  recomputedItemIds: string[];
}

const MINUTE = 60_000;

function dayStartMs(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

function minuteOf(iso: string): number {
  const date = new Date(iso);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function isoAt(date: string, minute: number): string {
  return new Date(dayStartMs(date) + minute * MINUTE).toISOString();
}

function byStart(a: TimelineItem, b: TimelineItem): number {
  return Date.parse(a.startTime) - Date.parse(b.startTime);
}

/**
 * Recompute the journeys into every item on a day.
 *
 * Legs are laid backwards from the item they serve, so the last one arrives
 * exactly as the item begins — the same rule the plan builder uses. Keeping
 * one rule for this means an edited day and a generated day are indis-
 * tinguishable downstream.
 */
export function recomputeLegs(
  day: ItineraryDay,
  context: EditContext,
): EditResult {
  const ordered = [...day.items].sort(byStart);
  const recomputedItemIds: string[] = [];

  const items = ordered.map((item, index) => {
    const previous = ordered[index - 1];

    const canRoute =
      previous &&
      previous.latitude != null &&
      previous.longitude != null &&
      item.latitude != null &&
      item.longitude != null;

    if (!canRoute) {
      // Nothing to route from, or nowhere to route to. An item with no
      // coordinates keeps whatever legs it had rather than losing them.
      return item;
    }

    const route = planRoute({
      destination: context.destination,
      origin: { latitude: previous.latitude!, longitude: previous.longitude! },
      destinationPoint: { latitude: item.latitude!, longitude: item.longitude! },
      originLabel: previous.locationName ?? previous.title,
      destinationLabel: item.locationName ?? item.title,
      preferences: context.preferences,
      travelers: context.travelers,
    });

    // Two points in the same building do not need a journey between them.
    if (route.totalDistanceMeters < 150) {
      if (item.legs.length === 0) return item;
      recomputedItemIds.push(item.id);
      return { ...item, legs: [] };
    }

    const arrival = Date.parse(item.startTime);
    let cursor = arrival - route.totalDurationMinutes * MINUTE;

    const legs: TimelineLeg[] = route.legs.map((leg, legOrder) => {
      const departureTime = new Date(cursor).toISOString();
      cursor += leg.durationMinutes * MINUTE;
      return {
        id: `${item.id}-leg-${legOrder}`,
        mode: leg.mode,
        durationMinutes: leg.durationMinutes,
        distanceMeters: leg.distanceMeters,
        costCents: leg.costCents,
        instructions: leg.instructions,
        originLabel: leg.originLabel,
        destinationLabel: leg.destinationLabel,
        departureTime,
        arrivalTime: new Date(cursor).toISOString(),
        legOrder,
      };
    });

    recomputedItemIds.push(item.id);
    return { ...item, legs };
  });

  return { day: { ...day, items }, recomputedItemIds };
}

/** Move one item to a new start time, keeping its duration. */
export function moveItem(
  day: ItineraryDay,
  itemId: string,
  startMinute: number,
  context: EditContext,
): EditResult {
  const target = day.items.find((item) => item.id === itemId);
  if (!target) return { day, recomputedItemIds: [] };

  const items = day.items.map((item) =>
    item.id === itemId
      ? {
          ...item,
          startTime: isoAt(day.date, startMinute),
          endTime: isoAt(day.date, startMinute + item.durationMinutes),
        }
      : item,
  );

  return recomputeLegs({ ...day, items }, context);
}

/** Change how long an item takes, leaving its start where it is. */
export function resizeItem(
  day: ItineraryDay,
  itemId: string,
  durationMinutes: number,
  context: EditContext,
): EditResult {
  if (durationMinutes < 5) return { day, recomputedItemIds: [] };

  const items = day.items.map((item) =>
    item.id === itemId
      ? {
          ...item,
          durationMinutes,
          endTime: new Date(
            Date.parse(item.startTime) + durationMinutes * MINUTE,
          ).toISOString(),
        }
      : item,
  );

  return recomputeLegs({ ...day, items }, context);
}

/**
 * Remove an item and the journeys that led to it.
 *
 * The following item's journey is recomputed from whatever now precedes it —
 * deleting the museum means dinner is reached from lunch, not from a place
 * the traveler is no longer visiting.
 */
export function removeItem(
  day: ItineraryDay,
  itemId: string,
  context: EditContext,
): EditResult {
  const items = day.items.filter((item) => item.id !== itemId);
  if (items.length === day.items.length) return { day, recomputedItemIds: [] };
  return recomputeLegs({ ...day, items }, context);
}

/**
 * Add an item the traveler asked for.
 *
 * Marked `USER`, which is what protects it from being cleared the next time
 * the trip is regenerated.
 */
export function addItem(
  day: ItineraryDay,
  input: NewItemInput,
  context: EditContext,
  id: string,
): EditResult {
  const item: TimelineItem = {
    id,
    type: input.type,
    title: input.title,
    description: input.description ?? null,
    startTime: isoAt(day.date, input.startMinute),
    endTime: isoAt(day.date, input.startMinute + input.durationMinutes),
    durationMinutes: input.durationMinutes,
    locationName: input.locationName ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    estimatedCostCents: input.estimatedCostCents ?? 0,
    reservationRequired: input.reservationRequired ?? false,
    reservationStatus: input.reservationRequired ? "NEEDED" : "NOT_REQUIRED",
    priority: "NORMAL",
    source: "USER",
    isMustDo: false,
    completed: false,
    isMock: false,
    legs: [],
  };

  return recomputeLegs({ ...day, items: [...day.items, item] }, context);
}

export function setCompleted(
  day: ItineraryDay,
  itemId: string,
  completed: boolean,
): EditResult {
  const items = day.items.map((item) =>
    item.id === itemId ? { ...item, completed } : item,
  );
  // Marking something done changes no times, so nothing needs rerouting.
  return { day: { ...day, items }, recomputedItemIds: [] };
}

/**
 * Push everything after an item later by `minutes`, keeping the day's shape.
 *
 * What "the museum ran long" actually means: the rest of the day slides
 * rather than every item needing to be dragged one at a time.
 */
export function shiftFrom(
  day: ItineraryDay,
  itemId: string,
  minutes: number,
  context: EditContext,
): EditResult {
  const ordered = [...day.items].sort(byStart);
  const index = ordered.findIndex((item) => item.id === itemId);
  if (index === -1 || minutes === 0) return { day, recomputedItemIds: [] };

  const items = ordered.map((item, position) => {
    if (position < index) return item;
    const start = Date.parse(item.startTime) + minutes * MINUTE;
    return {
      ...item,
      startTime: new Date(start).toISOString(),
      endTime: new Date(start + item.durationMinutes * MINUTE).toISOString(),
    };
  });

  return recomputeLegs({ ...day, items }, context);
}

/**
 * The earliest an item could start given what precedes it.
 *
 * Used by the UI to say "you cannot put it there" before the traveler drops
 * it, rather than letting the validator complain afterwards.
 */
export function earliestStartMinute(
  day: ItineraryDay,
  itemId: string,
  context: EditContext,
): number | null {
  const ordered = [...day.items].sort(byStart);
  const index = ordered.findIndex((item) => item.id === itemId);
  if (index <= 0) return null;

  const previous = ordered[index - 1]!;
  const item = ordered[index]!;

  if (
    previous.latitude == null ||
    previous.longitude == null ||
    item.latitude == null ||
    item.longitude == null
  ) {
    return minuteOf(previous.endTime);
  }

  const route = planRoute({
    destination: context.destination,
    origin: { latitude: previous.latitude, longitude: previous.longitude },
    destinationPoint: { latitude: item.latitude, longitude: item.longitude },
    preferences: context.preferences,
    travelers: context.travelers,
  });

  return minuteOf(previous.endTime) + route.totalDurationMinutes;
}
