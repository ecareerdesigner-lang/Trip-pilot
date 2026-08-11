import { PACE_BUFFER_MINUTES } from "@/lib/constants";
import { distanceMeters } from "@/lib/geo";
import { planRoute } from "@/lib/travel/routing";
import type { Pace, TransportPreference } from "@/types/domain";
import type { ItineraryDay, TimelineItem } from "@/types/view";

/**
 * Optimization engine.
 *
 * Rearranges a day so it can actually be walked. Two rules govern everything
 * here, in this order:
 *
 *   1. A must-do never moves to make room for a suggestion. It can shift in
 *      time, but it is never dropped and never outranked.
 *   2. Anything with a fixed hour — a show, a booked table, a flight — is an
 *      anchor. The day is arranged around anchors, not the other way round.
 *
 * Beyond that it minimises travel: visiting three places in the order they
 * happen to have been suggested can cost an hour of subway that visiting them
 * in geographic order does not.
 *
 * Pure. No database, no network, no clock — `now` is never read, so the same
 * itinerary optimises identically today and next week.
 */

export interface OptimizeOptions {
  destination: string;
  travelers: number;
  pace: Pace;
  transportPreferences: TransportPreference[];
  /** Hours the traveler wants scheduled within, minutes from midnight. */
  dayStartMinute: number;
  dayEndMinute: number;
  /** Item ids whose times are fixed and must not be moved. */
  anchoredItemIds?: string[];
}

export interface Change {
  itemId: string;
  title: string;
  kind: "moved" | "resequenced";
  /** Minutes from midnight, before and after. */
  fromMinute: number;
  toMinute: number;
  reason: string;
}

export interface OptimizedDay {
  date: string;
  dayNumber: number;
  /** Items in their new order, with new start times. */
  items: OptimizedItem[];
  changes: Change[];
  travelMinutesBefore: number;
  travelMinutesAfter: number;
}

export interface OptimizedItem {
  id: string;
  startMinute: number;
  durationMinutes: number;
  /** Journey time into this item under the new order. */
  travelMinutesIn: number;
}

export interface OptimizeResult {
  days: OptimizedDay[];
  changes: Change[];
  travelMinutesSaved: number;
}

interface Node {
  item: TimelineItem;
  latitude: number | null;
  longitude: number | null;
  anchored: boolean;
  startMinute: number;
  durationMinutes: number;
}

const minuteOfDay = (iso: string): number => {
  const date = new Date(iso);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
};

/**
 * An item is anchored when its time is not ours to change: it was explicitly
 * pinned, it needs a confirmed booking, or it is travel with a departure.
 */
function isAnchored(item: TimelineItem, pinned: Set<string>): boolean {
  if (pinned.has(item.id)) return true;
  if (item.type === "TRAVEL") return true;
  if (item.type === "LODGING") return true;
  if (item.reservationStatus === "CONFIRMED") return true;
  return false;
}

function travelBetween(
  from: Node | null,
  to: Node,
  options: OptimizeOptions,
): number {
  if (
    !from ||
    from.latitude == null ||
    from.longitude == null ||
    to.latitude == null ||
    to.longitude == null
  ) {
    return 0;
  }

  return planRoute({
    destination: options.destination,
    origin: { latitude: from.latitude, longitude: from.longitude },
    destinationPoint: { latitude: to.latitude, longitude: to.longitude },
    preferences: options.transportPreferences,
    travelers: options.travelers,
  }).totalDurationMinutes;
}

function totalTravel(order: Node[], options: OptimizeOptions): number {
  let total = 0;
  for (let index = 1; index < order.length; index += 1) {
    total += travelBetween(order[index - 1]!, order[index]!, options);
  }
  return total;
}

/**
 * Order the movable items by proximity, keeping anchors where they are.
 *
 * Nearest-neighbour from each anchor rather than a full tour solve: a day has
 * a handful of stops, the anchors already fix most of the shape, and an exact
 * solution would be slower to compute than the minutes it saves.
 */
function resequence(nodes: Node[], options: OptimizeOptions): Node[] {
  const anchors = nodes.filter((node) => node.anchored);
  const movable = nodes.filter((node) => !node.anchored);
  if (movable.length <= 1) return nodes;

  const result: Node[] = [];
  const remaining = [...movable];

  // Walk the day anchor by anchor, filling the gaps with whatever is nearest
  // to where the traveler already is.
  const sortedAnchors = [...anchors].sort(
    (a, b) => a.startMinute - b.startMinute,
  );

  let current: Node | null = null;

  for (const anchor of sortedAnchors) {
    // Fill everything that has to happen before this anchor.
    const capacity = remaining.length;
    for (let taken = 0; taken < capacity; taken += 1) {
      const next = nearest(current, remaining);
      if (!next) break;

      const wouldStart =
        (current?.startMinute ?? options.dayStartMinute) +
        (current?.durationMinutes ?? 0) +
        travelBetween(current, next, options);

      // Does not fit before the anchor; leave it for afterwards.
      if (wouldStart + next.durationMinutes > anchor.startMinute) break;

      remaining.splice(remaining.indexOf(next), 1);
      result.push(next);
      current = next;
    }

    result.push(anchor);
    current = anchor;
  }

  // Everything left goes after the last anchor, still nearest-first.
  while (remaining.length > 0) {
    const next = nearest(current, remaining);
    if (!next) break;
    remaining.splice(remaining.indexOf(next), 1);
    result.push(next);
    current = next;
  }

  return result;
}

/**
 * Closest remaining stop by straight-line distance.
 *
 * Deliberately not routed: this runs once per remaining stop per step, and
 * straight-line distance orders candidates the same way routing would while
 * costing nothing. The real journey time is computed once the order is fixed.
 */
function nearest(from: Node | null, candidates: Node[]): Node | null {
  if (candidates.length === 0) return null;
  if (!from || from.latitude == null) return candidates[0] ?? null;

  let best: Node | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (candidate.latitude == null || candidate.longitude == null) continue;
    const apart = distanceMeters(
      { latitude: from.latitude, longitude: from.longitude! },
      { latitude: candidate.latitude, longitude: candidate.longitude },
    );
    if (apart < bestDistance) {
      bestDistance = apart;
      best = candidate;
    }
  }

  return best ?? candidates[0] ?? null;
}

/**
 * Lay the ordered items back onto the clock.
 *
 * Each item starts once the traveler has actually arrived: previous end, plus
 * the journey, plus the pace's buffer. Anchors keep their own times and the
 * schedule flows around them.
 */
function reschedule(order: Node[], options: OptimizeOptions): OptimizedItem[] {
  const buffer = PACE_BUFFER_MINUTES[options.pace];
  const scheduled: OptimizedItem[] = [];

  let cursor = options.dayStartMinute;
  let previous: Node | null = null;

  for (const node of order) {
    const travel = travelBetween(previous, node, options);
    const earliest = previous === null ? cursor : cursor + travel + buffer;

    const startMinute = node.anchored
      ? node.startMinute
      : Math.max(earliest, options.dayStartMinute);

    scheduled.push({
      id: node.item.id,
      startMinute,
      durationMinutes: node.durationMinutes,
      travelMinutesIn: travel,
    });

    cursor = startMinute + node.durationMinutes;
    previous = node;
  }

  return scheduled;
}

export function optimizeItinerary(
  days: ItineraryDay[],
  options: OptimizeOptions,
): OptimizeResult {
  const pinned = new Set(options.anchoredItemIds ?? []);
  const optimizedDays: OptimizedDay[] = [];
  const allChanges: Change[] = [];

  let travelBefore = 0;
  let travelAfter = 0;

  for (const day of days) {
    const nodes: Node[] = day.items.map((item) => ({
      item,
      latitude: item.latitude,
      longitude: item.longitude,
      anchored: isAnchored(item, pinned),
      startMinute: minuteOfDay(item.startTime),
      durationMinutes: item.durationMinutes,
    }));

    const before = totalTravel(nodes, options);
    const ordered = resequence(nodes, options);
    const after = totalTravel(ordered, options);

    // Only accept a new order if it actually helps. An optimizer that shuffles
    // a day for no gain is just churn the traveler has to re-read.
    const accepted = after < before ? ordered : nodes;
    const acceptedTravel = after < before ? after : before;

    const scheduled = reschedule(accepted, options);
    const changes: Change[] = [];

    const originalIndex = new Map(
      nodes.map((node, index) => [node.item.id, index]),
    );

    scheduled.forEach((entry, index) => {
      const node = accepted[index]!;
      const fromMinute = node.startMinute;

      if (fromMinute !== entry.startMinute) {
        changes.push({
          itemId: entry.id,
          title: node.item.title,
          kind: "moved",
          fromMinute,
          toMinute: entry.startMinute,
          reason:
            entry.travelMinutesIn > 0
              ? `Allows ${entry.travelMinutesIn} minutes to get there.`
              : "Keeps the day in order.",
        });
      } else if (originalIndex.get(entry.id) !== index) {
        changes.push({
          itemId: entry.id,
          title: node.item.title,
          kind: "resequenced",
          fromMinute,
          toMinute: entry.startMinute,
          reason: "Grouped with nearby stops to cut travel.",
        });
      }
    });

    travelBefore += before;
    travelAfter += acceptedTravel;
    allChanges.push(...changes);

    optimizedDays.push({
      date: day.date,
      dayNumber: day.dayNumber,
      items: scheduled,
      changes,
      travelMinutesBefore: before,
      travelMinutesAfter: acceptedTravel,
    });
  }

  return {
    days: optimizedDays,
    changes: allChanges,
    travelMinutesSaved: Math.max(0, travelBefore - travelAfter),
  };
}
