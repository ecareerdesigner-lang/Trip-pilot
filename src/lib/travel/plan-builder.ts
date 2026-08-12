import { planRoute } from "@/lib/travel/routing";
import { candidatePoint, type CandidateSet } from "@/lib/travel/candidates";
import type { Plan, PlannedItem } from "@/lib/ai/schema";
import type { TransitLeg } from "@/lib/providers/types";
import { PACE_BUFFER_MINUTES } from "@/lib/constants";
import type {
  BudgetCategory,
  GeoPoint,
  ItineraryItemType,
  Pace,
  PlaceRef,
  Priority,
  ReservationStatus,
  TransportPreference,
} from "@/types/domain";

/**
 * Turns a plan into the rows a trip is made of.
 *
 * Two things happen here that are the point of the whole product.
 *
 * First, facts come from candidates, not from the planner. The planner picks
 * `a3`; the price, coordinates, opening hours and booking requirement are
 * read from candidate `a3`. A model that renames a museum or misremembers an
 * admission fee cannot corrupt the itinerary.
 *
 * Second, every move between two places becomes scheduled transportation.
 * The legs are laid backwards from the item they deliver to, so the last leg
 * arrives exactly when the item starts and departure times fall out of the
 * arithmetic rather than being guessed.
 */

export interface BuiltLeg extends TransitLeg {
  departureTime: Date;
  arrivalTime: Date;
}

export interface BuiltItem {
  key: string;
  dayNumber: number;
  date: string;
  type: ItineraryItemType;
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  place: PlaceRef | null;
  estimatedCostCents: number;
  budgetCategory: BudgetCategory;
  reservationRequired: boolean;
  reservationStatus: ReservationStatus;
  priority: Priority;
  satisfiesMustDo: string | null;
  sortOrder: number;
  isMock: boolean;
  legs: BuiltLeg[];
}

export interface BuiltPlan {
  summary: string;
  items: BuiltItem[];
  /** Candidate ids the planner referenced that do not exist. */
  unknownCandidateIds: string[];
  /**
   * Items moved later than the planner asked, because the journey to them
   * did not fit. Reported rather than corrected silently — a schedule that
   * quietly disagrees with what was proposed is worse than one that says so.
   */
  shiftedItems: { title: string; date: string; byMinutes: number }[];
  totalEstimatedCents: number;
}

export interface BuildOptions {
  destination: string;
  travelers: number;
  preferences: TransportPreference[];
  candidates: CandidateSet;
  /** Days the trip covers, in order. Items on other dates are dropped. */
  dayDates: string[];
  /**
   * How much slack to leave beyond the journey itself.
   *
   * Pushing an item to exactly `previous end + travel` is arithmetically
   * correct and practically brittle — it produces a day of connections with
   * zero minutes spare, where one slow train collapses everything after it.
   * The validator judges against this same table, so a builder that ignores
   * it generates warnings about its own output.
   */
  pace?: Pace;
}

const CATEGORY_BY_TYPE: Record<ItineraryItemType, BudgetCategory> = {
  TRAVEL: "TRANSPORTATION",
  LODGING: "LODGING",
  RESTAURANT: "FOOD",
  ACTIVITY: "ACTIVITIES",
  EXCURSION: "ACTIVITIES",
  SIGHTSEEING: "ACTIVITIES",
  TRANSPORTATION: "LOCAL_TRANSPORTATION",
  WALKING: "LOCAL_TRANSPORTATION",
  FREE_TIME: "MISCELLANEOUS",
  OTHER: "MISCELLANEOUS",
};

function at(date: string, minute: number): Date {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + minute * 60_000);
}

interface Resolved {
  place: PlaceRef | null;
  point: GeoPoint | null;
  costCents: number;
  reservationRequired: boolean;
  /** Prefer the candidate's real name over whatever the planner wrote. */
  name: string | null;
}

function resolve(
  item: PlannedItem,
  candidates: CandidateSet,
  travelers: number,
  chargedStays: Set<string>,
): Resolved | "unknown" {
  if (!item.candidateId) {
    return {
      place: null,
      point: null,
      costCents: 0,
      reservationRequired: false,
      name: null,
    };
  }

  const id = item.candidateId;

  const hotel = candidates.hotels.get(id);
  if (hotel) {
    // A stay is charged once. Check-in, check-out and every evening return
    // are all LODGING items pointing at the same hotel; billing each of them
    // would multiply the largest line in the budget by the length of the trip.
    const alreadyCharged = chargedStays.has(id);
    if (!alreadyCharged) chargedStays.add(id);

    return {
      place: hotel.place,
      point: candidatePoint(candidates, id),
      costCents: alreadyCharged ? 0 : hotel.totalRateCents,
      reservationRequired: true,
      name: hotel.name,
    };
  }

  const restaurant = candidates.restaurants.get(id);
  if (restaurant) {
    return {
      place: restaurant.place,
      point: candidatePoint(candidates, id),
      costCents: restaurant.averageMealCents * Math.max(1, travelers),
      reservationRequired: restaurant.reservationRequired,
      name: restaurant.name,
    };
  }

  const activity = candidates.activities.get(id);
  if (activity) {
    return {
      place: activity.place,
      point: candidatePoint(candidates, id),
      costCents: activity.priceCents * Math.max(1, travelers),
      reservationRequired: activity.bookingRequired,
      name: activity.name,
    };
  }

  return "unknown";
}

/** Minutes to travel between two placed stops. */
function journeyMinutes(
  from: { point: GeoPoint; label: string },
  to: { point: GeoPoint; label: string },
  options: BuildOptions,
): number {
  const route = planRoute({
    destination: options.destination,
    origin: from.point,
    destinationPoint: to.point,
    originLabel: from.label,
    destinationLabel: to.label,
    preferences: options.preferences,
    travelers: options.travelers,
  });

  // Matches `legsInto`, which discards a journey too short to be worth
  // scheduling. Reserving time for a leg that is never drawn would push the
  // day later for no reason.
  return route.totalDistanceMeters < 150 ? 0 : route.totalDurationMinutes;
}

function legsInto(
  from: { point: GeoPoint; label: string } | null,
  to: { point: GeoPoint; label: string } | null,
  startTime: Date,
  options: BuildOptions,
): BuiltLeg[] {
  if (!from || !to) return [];

  const route = planRoute({
    destination: options.destination,
    origin: from.point,
    destinationPoint: to.point,
    originLabel: from.label,
    destinationLabel: to.label,
    preferences: options.preferences,
    travelers: options.travelers,
  });

  // A one-minute hop between two points in the same building is noise.
  if (route.totalDistanceMeters < 150) return [];

  let cursor = startTime.getTime() - route.totalDurationMinutes * 60_000;
  return route.legs.map((leg) => {
    const departureTime = new Date(cursor);
    cursor += leg.durationMinutes * 60_000;
    return { ...leg, departureTime, arrivalTime: new Date(cursor) };
  });
}

export function buildPlan(plan: Plan, options: BuildOptions): BuiltPlan {
  const bufferMinutes = PACE_BUFFER_MINUTES[options.pace ?? "BALANCED"];
  const items: BuiltItem[] = [];
  const unknownCandidateIds: string[] = [];
  const shiftedItems: { title: string; date: string; byMinutes: number }[] = [];
  const chargedStays = new Set<string>();
  const dayIndex = new Map(options.dayDates.map((date, i) => [date, i + 1]));

  for (const day of plan.days) {
    const dayNumber = dayIndex.get(day.date);
    // A day outside the trip's own dates cannot be scheduled.
    if (dayNumber === undefined) continue;

    const ordered = [...day.items].sort((a, b) => a.startMinute - b.startMinute);
    let previous: { point: GeoPoint; label: string } | null = null;
    let previousEnd: number | null = null;
    let sortOrder = 0;

    for (const planned of ordered) {
      const resolved = resolve(
        planned,
        options.candidates,
        options.travelers,
        chargedStays,
      );
      if (resolved === "unknown") {
        unknownCandidateIds.push(planned.candidateId!);
        continue;
      }

      const here =
        resolved.point && resolved.place
          ? { point: resolved.point, label: resolved.place.name }
          : null;

      /**
       * The planner's start time is a request, not a fact.
       *
       * A model is good at deciding what belongs where and poor at arithmetic
       * over clock times — it will book dinner at 6:00 while the museum it
       * put before it runs until 6:00, thirty-four minutes away. Rather than
       * asking it more firmly, the arrival is computed here from the journey
       * that has to happen, and the item cannot start before it.
       *
       * Only ever later, never earlier: an item the planner deliberately
       * placed at 9 AM is not moved to 8 because there is room.
       */
      const requested = at(day.date, planned.startMinute);
      const travelMinutes = previous && here ? journeyMinutes(previous, here, options) : 0;
      // Slack beyond the journey. Only applied where there is a journey —
      // two things in the same building do not need twenty-five minutes
      // between them.
      const buffer = travelMinutes > 0 ? bufferMinutes : 0;

      const earliest: number =
        previousEnd === null
          ? requested.getTime()
          : previousEnd + (travelMinutes + buffer) * 60_000;

      // Pushing cascades: five tight connections gain five buffers. A day
      // that started late enough could be pushed past midnight, where the
      // timestamp silently belongs to tomorrow and the item appears on a day
      // it was never planned for. Held at the boundary instead, and reported
      // as a conflict for the validator rather than moved to another date.
      const dayStart = at(day.date, 0).getTime();
      const lastMinuteOfDay = dayStart + (24 * 60 - 1) * 60_000;

      const startTime: Date = new Date(
        Math.min(Math.max(requested.getTime(), earliest), lastMinuteOfDay),
      );
      const endTime: Date = new Date(
        Math.min(
          startTime.getTime() + planned.durationMinutes * 60_000,
          lastMinuteOfDay,
        ),
      );

      if (startTime.getTime() !== requested.getTime()) {
        shiftedItems.push({
          title: resolved.name ?? planned.title,
          date: day.date,
          byMinutes: Math.round(
            (startTime.getTime() - requested.getTime()) / 60_000,
          ),
        });
      }

      const legs = legsInto(previous, here, startTime, options);

      items.push({
        key: `${day.date}-${sortOrder}`,
        dayNumber,
        date: day.date,
        type: planned.type,
        title: resolved.name ?? planned.title,
        description: planned.description,
        startTime,
        endTime,
        durationMinutes: planned.durationMinutes,
        place: resolved.place,
        estimatedCostCents: resolved.costCents,
        budgetCategory: CATEGORY_BY_TYPE[planned.type],
        reservationRequired: resolved.reservationRequired,
        reservationStatus: resolved.reservationRequired
          ? "NEEDED"
          : "NOT_REQUIRED",
        priority: planned.satisfiesMustDo ? "REQUIRED" : "NORMAL",
        satisfiesMustDo: planned.satisfiesMustDo,
        sortOrder,
        isMock: true,
        legs,
      });

      sortOrder += 1;
      previousEnd = endTime.getTime();
      if (here) previous = here;
    }
  }

  const totalEstimatedCents = items.reduce(
    (sum, item) =>
      sum +
      item.estimatedCostCents +
      item.legs.reduce((legSum, leg) => legSum + leg.costCents, 0),
    0,
  );

  return {
    summary: plan.tripSummary,
    items,
    unknownCandidateIds,
    shiftedItems,
    totalEstimatedCents,
  };
}
