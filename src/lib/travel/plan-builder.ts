import { planRoute } from "@/lib/travel/routing";
import { candidatePoint, type CandidateSet } from "@/lib/travel/candidates";
import type { Plan, PlannedItem } from "@/lib/ai/schema";
import type { TransitLeg } from "@/lib/providers/types";
import type {
  BudgetCategory,
  GeoPoint,
  ItineraryItemType,
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
  totalEstimatedCents: number;
}

export interface BuildOptions {
  destination: string;
  travelers: number;
  preferences: TransportPreference[];
  candidates: CandidateSet;
  /** Days the trip covers, in order. Items on other dates are dropped. */
  dayDates: string[];
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
  const items: BuiltItem[] = [];
  const unknownCandidateIds: string[] = [];
  const chargedStays = new Set<string>();
  const dayIndex = new Map(options.dayDates.map((date, i) => [date, i + 1]));

  for (const day of plan.days) {
    const dayNumber = dayIndex.get(day.date);
    // A day outside the trip's own dates cannot be scheduled.
    if (dayNumber === undefined) continue;

    const ordered = [...day.items].sort((a, b) => a.startMinute - b.startMinute);
    let previous: { point: GeoPoint; label: string } | null = null;
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

      const startTime = at(day.date, planned.startMinute);
      const endTime = new Date(
        startTime.getTime() + planned.durationMinutes * 60_000,
      );

      const here =
        resolved.point && resolved.place
          ? { point: resolved.point, label: resolved.place.name }
          : null;

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
    totalEstimatedCents,
  };
}
