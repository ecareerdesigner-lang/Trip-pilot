import { PACE_ACTIVITY_TARGET, PACE_BUFFER_MINUTES } from "@/lib/constants";
import { distanceMeters } from "@/lib/geo";
import type { CandidateSet } from "@/lib/travel/candidates";
import type { Plan, PlannedDay, PlannedItem } from "@/lib/ai/schema";
import type { ActivityCandidate, RestaurantCandidate } from "@/lib/providers/types";
import { planRoute } from "@/lib/travel/routing";
import type { GeoPoint, Pace, TransportPreference } from "@/types/domain";

/**
 * A planner that does not need a model.
 *
 * Two jobs. It is the fallback when no `ANTHROPIC_API_KEY` is configured, so
 * the app produces a real itinerary out of the box. And it is the fixture the
 * validation and optimization engines are developed against, because it is
 * deterministic — the same inputs always give the same schedule, which a
 * model cannot promise.
 *
 * It is a heuristic, not a substitute for the AI planner. It clusters by
 * distance and respects opening hours, must-dos and meal times; it does not
 * understand that a traveler who asked for "somewhere quiet" means it.
 */

export interface HeuristicOptions {
  dayDates: string[];
  pace: Pace;
  travelers: number;
  mustDos: { title: string; description: string }[];
  candidates: CandidateSet;
  /** Earliest and latest minutes the traveler wants scheduled. */
  dayStartMinute: number;
  dayEndMinute: number;
  /** Needed to price and time the journeys between stops. */
  destination: string;
  transportPreferences: TransportPreference[];
}

const MEALS = [
  { name: "Breakfast", minute: 8 * 60, duration: 60 },
  { name: "Lunch", minute: 12 * 60 + 30, duration: 70 },
  { name: "Dinner", minute: 19 * 60, duration: 90 },
] as const;

/**
 * Slack left on top of the real journey time.
 *
 * This is buffer, not travel. Travel is computed per hop by `hopMinutes` — an
 * earlier version used a flat 35 minutes to cover both, which produced
 * schedules the reality-check engine immediately condemned whenever two stops
 * were more than half an hour apart.
 *
 * The amount comes from the same table the validator judges against. A
 * planner that leaves ten minutes while the validator wants twenty-five
 * generates warnings on its own output, which is how "only 2 min spare"
 * reached a real screen.
 */
const MINIMUM_BUFFER_MINUTES = 10;

/**
 * Minutes to get from one point to the next, plus a little slack.
 *
 * The planner has to know this before it decides when the next item starts.
 * Asking the same router the itinerary will later be built with is what keeps
 * the plan and the reality check in agreement.
 */
function hopMinutes(
  from: GeoPoint | null,
  to: GeoPoint | null,
  options: HeuristicOptions,
): number {
  const buffer = Math.max(
    MINIMUM_BUFFER_MINUTES,
    PACE_BUFFER_MINUTES[options.pace],
  );
  if (!from || !to) return buffer;

  const route = planRoute({
    destination: options.destination,
    origin: from,
    destinationPoint: to,
    preferences: options.transportPreferences,
    travelers: options.travelers,
  });

  return route.totalDurationMinutes + buffer;
}

function pointOf(candidate: { place: { latitude?: number | null; longitude?: number | null } }): GeoPoint | null {
  const { latitude, longitude } = candidate.place;
  if (latitude == null || longitude == null) return null;
  return { latitude, longitude };
}

/** Restaurant open at this time and nearest to where the traveler already is. */
function pickRestaurant(
  restaurants: RestaurantCandidate[],
  minute: number,
  near: GeoPoint | null,
  used: Set<string>,
  usedToday: Set<string>,
): RestaurantCandidate | null {
  const openNow = restaurants.filter(
    (restaurant) =>
      restaurant.hours.opensMinute <= minute &&
      restaurant.hours.closesMinute >= minute + 45,
  );
  if (openNow.length === 0) return null;

  // Prefer somewhere new, but a trip with more meals than the city has
  // restaurants should still eat. Running out is not a reason to skip dinner.
  // Never twice in one day, whatever the supply.
  const availableToday = openNow.filter(
    (restaurant) => !usedToday.has(restaurant.name),
  );
  if (availableToday.length === 0) return null;

  const unused = availableToday.filter(
    (restaurant) => !used.has(restaurant.name),
  );
  const open = unused.length > 0 ? unused : availableToday;

  if (!near) return open[0]!;

  return [...open].sort((a, b) => {
    const aPoint = pointOf(a);
    const bPoint = pointOf(b);
    if (!aPoint) return 1;
    if (!bPoint) return -1;
    return distanceMeters(near, aPoint) - distanceMeters(near, bPoint);
  })[0]!;
}

/**
 * Must-dos first, then whatever is nearest to the last stop.
 *
 * The ordering rule is the one the spec insists on: a must-do outranks an AI
 * suggestion, so suggestions are only considered once every must-do that can
 * be matched to a real place has been placed.
 */
function orderActivities(
  activities: ActivityCandidate[],
  mustDos: { title: string }[],
): { activity: ActivityCandidate; mustDo: string | null }[] {
  const matched: { activity: ActivityCandidate; mustDo: string | null }[] = [];
  const claimed = new Set<string>();

  for (const mustDo of mustDos) {
    const needle = mustDo.title.trim().toLowerCase();
    if (needle.length === 0) continue;

    const hit = activities.find(
      (activity) =>
        !claimed.has(activity.name) &&
        (activity.name.toLowerCase().includes(needle) ||
          needle.includes(activity.name.toLowerCase())),
    );
    if (hit) {
      claimed.add(hit.name);
      matched.push({ activity: hit, mustDo: mustDo.title });
    }
  }

  for (const activity of activities) {
    if (!claimed.has(activity.name)) matched.push({ activity, mustDo: null });
  }

  return matched;
}

export function planHeuristically(options: HeuristicOptions): Plan {
  const { candidates, dayDates } = options;

  const hotel = [...candidates.hotels.entries()][0] ?? null;
  const hotelPoint = hotel ? pointOf(hotel[1]) : null;

  const restaurants = [...candidates.restaurants.entries()];
  const activityQueue = orderActivities(
    [...candidates.activities.values()],
    options.mustDos,
  );

  const activityIdByName = new Map(
    [...candidates.activities.entries()].map(([id, activity]) => [
      activity.name,
      id,
    ]),
  );
  const restaurantIdByName = new Map(
    restaurants.map(([id, restaurant]) => [restaurant.name, id]),
  );

  const perDay = PACE_ACTIVITY_TARGET[options.pace];

  /**
   * How many activities each day may take.
   *
   * The queue is finite — a city ships eight landmarks, not eighty — so an
   * uncapped day empties it and every later day is meals only. Each day is
   * therefore allotted its share up front, weighted by pace: a packed trip
   * front-loads, a relaxed one stays even, and no day is left with nothing.
   */
  const dayCount = Math.max(1, dayDates.length);
  const supply = activityQueue.length;
  const allowance = allotActivities(supply, dayCount, perDay, options.pace);

  const usedRestaurants = new Set<string>();

  /**
   * Activities still unplaced.
   *
   * A list rather than a moving index. An index that advanced whenever a
   * candidate did not fit discarded it permanently — so days one and two
   * burned through the queue on near-misses and days three to five came back
   * with nothing but meals. Candidates leave this list only when scheduled.
   */
  const pending = [...activityQueue];

  const days: PlannedDay[] = dayDates.map((date, dayIndex) => {
    const isFirst = dayIndex === 0;
    const isLast = dayIndex === dayDates.length - 1;
    const items: PlannedItem[] = [];
    const usedToday = new Set<string>();
    let cursor = Math.max(options.dayStartMinute, 8 * 60);
    let here: GeoPoint | null = hotelPoint;

    if (isFirst && hotel) {
      // Arriving before check-in is normal and fine — but say so, rather than
      // scheduling a room that will not be ready and letting the validator
      // report it as a surprise.
      const checkInMinute = parseClock(hotel[1].checkInTime) ?? 15 * 60;
      const early = cursor < checkInMinute;

      items.push({
        candidateId: hotel[0],
        type: "LODGING",
        title: hotel[1].name,
        description: early
          ? `Drop bags. Rooms are usually ready from ${hotel[1].checkInTime}.`
          : "Check in.",
        startMinute: cursor,
        durationMinutes: early ? 20 : 30,
        satisfiesMustDo: null,
      });
      cursor += (early ? 20 : 30) + MINIMUM_BUFFER_MINUTES;
    }

    // Meals anchor the day; activities fill the space between them.
    const mealsToday = MEALS.filter(
      (meal) => meal.minute >= options.dayStartMinute && meal.minute <= options.dayEndMinute,
    );

    const slots = allowance[dayIndex] ?? 0;
    let placedActivities = 0;

    for (const meal of mealsToday) {
      // Activities before this meal.
      while (placedActivities < slots && pending.length > 0) {
        const fitted = takeFitting(
          pending,
          activityIdByName,
          here,
          cursor,
          meal.minute,
          options,
        );
        if (!fitted) break;

        items.push(fitted.item);
        cursor = fitted.finish;
        here = fitted.point ?? here;
        placedActivities += 1;
      }

      const mealStart = Math.max(cursor, meal.minute);
      const restaurant = pickRestaurant(
        restaurants.map(([, value]) => value),
        mealStart,
        here,
        usedRestaurants,
        usedToday,
      );

      if (restaurant) {
        const id = restaurantIdByName.get(restaurant.name);
        if (id) {
          usedRestaurants.add(restaurant.name);
          usedToday.add(restaurant.name);
          const mealTravel = hopMinutes(here, pointOf(restaurant), options);
          const seated = Math.max(mealStart + mealTravel, meal.minute);

          // Past the traveler's stated hours by the time they would sit down.
          // On the last day the journey back to the hotel and check-out have
          // to fit too, or the day ends with an impossible dash across town.
          const reserve = isLast
            ? hopMinutes(pointOf(restaurant), hotelPoint, options) + 30
            : 0;
          if (seated + meal.duration + reserve > options.dayEndMinute) continue;

          items.push({
            candidateId: id,
            type: "RESTAURANT",
            title: restaurant.name,
            description: restaurant.description,
            startMinute: seated,
            durationMinutes: meal.duration,
            satisfiesMustDo: null,
          });
          cursor = seated + meal.duration;
          here = pointOf(restaurant) ?? here;
        }
      }
    }

    // Anything left in the evening.
    while (placedActivities < slots && pending.length > 0) {
      const fitted = takeFitting(
        pending,
        activityIdByName,
        here,
        cursor,
        options.dayEndMinute,
        options,
      );
      if (!fitted) break;

      items.push(fitted.item);
      cursor = fitted.finish;
      here = fitted.point ?? here;
      placedActivities += 1;
    }

    if (isLast && hotel) {
      // Getting back to the hotel takes as long as any other journey. Using
      // `cursor` directly here scheduled check-out for the moment dinner
      // ended, on the other side of the city.
      // Two constraints, both real: the traveler cannot check out before
      // they have travelled back, and they do not want the day running past
      // their stated end. When the last item is late enough that both cannot
      // hold, arrival wins — a schedule that requires being in two places at
      // once is worse than one that ends half an hour late.
      const backToHotel = hopMinutes(here, hotelPoint, options);
      const arrival = cursor + backToHotel;
      const latest = options.dayEndMinute - 30;
      const startMinute = Math.min(Math.max(arrival, checkOutFloor(options)), latest);

      items.push({
        candidateId: hotel[0],
        type: "LODGING",
        title: `Check out of ${hotel[1].name}`,
        description: `Check-out is ${hotel[1].checkOutTime}.`,
        startMinute,
        durationMinutes: 30,
        satisfiesMustDo: null,
      });
    }

    // A day with nothing in it would fail the schema, and is not a plan.
    if (items.length === 0) {
      items.push({
        candidateId: null,
        type: "FREE_TIME",
        title: "Open day",
        description: "Nothing scheduled. Add something, or leave it open.",
        startMinute: Math.max(options.dayStartMinute, 10 * 60),
        durationMinutes: 120,
        satisfiesMustDo: null,
      });
    }

    return {
      date,
      summary: isFirst ? "Arrival and settling in." : "",
      items,
    };
  });

  const placedMustDos = new Set(
    days.flatMap((day) =>
      day.items
        .map((item) => item.satisfiesMustDo)
        .filter((title): title is string => title !== null),
    ),
  );
  const missed = options.mustDos
    .map((mustDo) => mustDo.title)
    .filter((title) => !placedMustDos.has(title));

  return {
    tripSummary:
      missed.length > 0
        ? `Built from sample data. These must-dos could not be matched to a known place: ${missed.join(", ")}.`
        : "Built from sample data.",
    days,
  };
}

/**
 * Divide a finite pool of activities across the days of a trip.
 *
 * Relaxed spreads evenly. Packed leans earlier, because that is what asking
 * for a packed trip means — but every day still gets at least one thing while
 * any remain, so the last day of a packed trip is not empty.
 */
function allotActivities(
  supply: number,
  dayCount: number,
  perDay: number,
  pace: Pace,
): number[] {
  const allowance = new Array<number>(dayCount).fill(0);
  if (supply <= 0) return allowance;

  // One each first, so no day starts out empty.
  let remaining = supply;
  for (let index = 0; index < dayCount && remaining > 0; index += 1) {
    allowance[index] = 1;
    remaining -= 1;
  }

  // Then hand out the rest, earliest first for a packed trip and in even
  // passes otherwise.
  const order =
    pace === "PACKED"
      ? Array.from({ length: dayCount }, (_, index) => index)
      : Array.from({ length: dayCount }, (_, index) => index);

  let guard = 0;
  while (remaining > 0 && guard < supply * 2) {
    let placed = false;
    for (const index of order) {
      if (remaining <= 0) break;
      if ((allowance[index] ?? 0) >= perDay) continue;
      allowance[index] = (allowance[index] ?? 0) + 1;
      remaining -= 1;
      placed = true;
      if (pace === "PACKED") break; // refill from the front each pass
    }
    if (!placed) break;
    guard += 1;
  }

  return allowance;
}

/** "15:00" to minutes from midnight. Null when it is not a clock time. */
function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

interface Fitted {
  item: PlannedItem;
  finish: number;
  point: GeoPoint | null;
}

/**
 * Take the first pending activity that fits before `deadline`, and remove it.
 *
 * Scans rather than taking the head: one awkward candidate — a long visit, or
 * somewhere that has not opened yet — should not block the ones behind it.
 * Anything that does not fit stays in the list for a later slot or a later
 * day, which is what keeps the back half of a trip from emptying out.
 */
function takeFitting(
  pending: { activity: ActivityCandidate; mustDo: string | null }[],
  idByName: Map<string, string>,
  here: GeoPoint | null,
  cursor: number,
  deadline: number,
  options: HeuristicOptions,
): Fitted | null {
  for (let index = 0; index < pending.length; index += 1) {
    const entry = pending[index]!;
    const { activity } = entry;

    const id = idByName.get(activity.name);
    if (!id) {
      pending.splice(index, 1);
      index -= 1;
      continue;
    }

    const travel = hopMinutes(here, pointOf(activity), options);
    const start = Math.max(cursor + travel, activity.hours.opensMinute);
    const finish = start + activity.durationMinutes;

    if (finish > activity.hours.closesMinute || finish > deadline) continue;

    pending.splice(index, 1);

    return {
      item: {
        candidateId: id,
        type: activity.category === "Museum" ? "SIGHTSEEING" : "ACTIVITY",
        title: activity.name,
        description: activity.description,
        startMinute: start,
        durationMinutes: activity.durationMinutes,
        satisfiesMustDo: entry.mustDo,
      },
      finish,
      point: pointOf(activity),
    };
  }

  return null;
}

/** Earliest the traveler would reasonably check out. */
function checkOutFloor(options: HeuristicOptions): number {
  return options.dayStartMinute;
}
