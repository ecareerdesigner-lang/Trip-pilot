import { streetDistanceMeters } from "@/lib/geo";
import { resolveCity, type City } from "@/lib/providers/mock/cities";
import type {
  TransitLeg,
  TransitQuery,
  TransitRoute,
} from "@/lib/providers/types";
import type { TransportMode, TransportPreference } from "@/types/domain";

/**
 * Transit routing engine.
 *
 * Pure: no env, no `server-only`, no I/O. It lives here rather than in the
 * provider module because the optimizer calls it thousands of times while
 * rearranging a day, and because a routing engine that cannot be unit tested
 * is a routing engine nobody can trust.
 *
 * This is the interface the product rests on. A subway trip is a walk, a
 * ride and another walk, and the two walks are where itineraries usually
 * break — so multi-leg is the normal case here, not an edge case.
 *
 * No travel time is hardcoded. Every duration is a distance divided by a
 * speed below, which means moving a hotel on the map moves the schedule.
 */

/** Metres per minute. Door-to-door averages, not vehicle top speeds. */
const SPEED = {
  WALK: 80, // 4.8 km/h — an unhurried adult pace
  SUBWAY: 500, // 30 km/h including stops
  BUS: 280, // 17 km/h in traffic, including stops
  RIDESHARE: 400, // 24 km/h urban average
  CAR: 420,
  BIKE: 200,
} as const;

/** Minutes spent not moving: waiting on a platform, waiting for a pickup. */
const OVERHEAD_MINUTES = {
  SUBWAY_WAIT: 5,
  BUS_WAIT: 8,
  RIDESHARE_PICKUP: 4,
} as const;

/** Straight-line metres to the nearest station or stop, each end. */
const ACCESS_METERS = {
  SUBWAY: 350,
  BUS: 200,
} as const;

/** Below this, walking beats anything with a wait attached. */
const ALWAYS_WALK_METERS = 1_000;
/** Above this, walking stops being reasonable however much you like it. */
const MAX_WALK_METERS = 3_000;
/** Beyond this, local transit is the wrong tool. */
const MAX_TRANSIT_METERS = 30_000;

const minutesFor = (meters: number, metersPerMinute: number): number =>
  Math.max(1, Math.round(meters / metersPerMinute));

function has(
  preferences: TransportPreference[],
  preference: TransportPreference,
): boolean {
  return preferences.includes(preference);
}

function rideshareCostCents(city: City, meters: number): number {
  return Math.round(
    city.rideshareBaseCents + (meters / 1_000) * city.ridesharePerKmCents,
  );
}

/** Fares are per person; a rideshare is per car. */
function transitFareCents(city: City, travelers: number): number {
  return city.transitFareCents * Math.max(1, travelers);
}

const MOCK_SOURCE = { providerName: "mock-transit", isMock: true } as const;

function leg(
  mode: TransportMode,
  legOrder: number,
  originLabel: string,
  destinationLabel: string,
  distanceMeters: number,
  durationMinutes: number,
  costCents: number,
  instructions: string,
): TransitLeg {
  return {
    ...MOCK_SOURCE,
    mode,
    legOrder,
    originLabel,
    destinationLabel,
    distanceMeters,
    durationMinutes,
    costCents,
    instructions,
  };
}

function assemble(legs: TransitLeg[]): TransitRoute {
  return {
    ...MOCK_SOURCE,
    legs,
    totalDurationMinutes: legs.reduce((sum, l) => sum + l.durationMinutes, 0),
    totalCostCents: legs.reduce((sum, l) => sum + l.costCents, 0),
    totalDistanceMeters: legs.reduce((sum, l) => sum + l.distanceMeters, 0),
  };
}

/**
 * Plan a journey.
 *
 * Pure and synchronous so the optimizer can call it thousands of times while
 * rearranging a day, and so it can be tested exhaustively.
 */
export function planRoute(query: TransitQuery): TransitRoute {
  const city = resolveCity(query.destination);
  const from = query.originLabel ?? "your location";
  const to = query.destinationLabel ?? "your destination";

  const meters = streetDistanceMeters(query.origin, query.destinationPoint);
  const prefs = query.preferences;

  const walkOnly = (): TransitRoute =>
    assemble([
      leg(
        "WALK",
        0,
        from,
        to,
        meters,
        minutesFor(meters, SPEED.WALK),
        0,
        `Walk to ${to}.`,
      ),
    ]);

  // Same place, or near enough that a route would be noise.
  if (meters < 120) {
    return assemble([leg("WALK", 0, from, to, meters, 1, 0, `Walk to ${to}.`)]);
  }

  // Without city data there are no fares and no transit network to reason
  // about, so fall back to walking or a generic car ride rather than
  // inventing a subway line.
  if (!city) {
    if (meters <= MAX_WALK_METERS) return walkOnly();
    return assemble([
      leg(
        "CAR",
        0,
        from,
        to,
        meters,
        minutesFor(meters, SPEED.CAR) + OVERHEAD_MINUTES.RIDESHARE_PICKUP,
        0,
        `Travel to ${to}. No local fare data for this destination.`,
      ),
    ]);
  }

  const walkPreferred = has(prefs, "WALKING_PREFERRED");
  const transitPreferred = has(prefs, "PUBLIC_TRANSPORT_PREFERRED");
  const ridesharePreferred = has(prefs, "RIDESHARE_PREFERRED");
  const carPreferred = has(prefs, "RENTAL_CAR_PREFERRED");
  const cheapest = has(prefs, "CHEAPEST");
  const fastest = has(prefs, "FASTEST");

  const walkLimit = walkPreferred ? MAX_WALK_METERS : ALWAYS_WALK_METERS;
  if (meters <= walkLimit) return walkOnly();

  const rideshare = (): TransitRoute => {
    const mode: TransportMode = carPreferred ? "CAR" : "UBER";
    const cost = carPreferred ? 0 : rideshareCostCents(city, meters);
    return assemble([
      leg(
        mode,
        0,
        from,
        to,
        meters,
        minutesFor(meters, SPEED.RIDESHARE) + OVERHEAD_MINUTES.RIDESHARE_PICKUP,
        cost,
        carPreferred
          ? `Drive to ${to}. Parking is not included in the estimate.`
          : `Rideshare to ${to}.`,
      ),
    ]);
  };

  const subwayAvailable = city.hasSubway && meters <= MAX_TRANSIT_METERS;
  const busAvailable = city.hasBus && meters <= 15_000;

  const publicRoute = (): TransitRoute | null => {
    const useSubway = subwayAvailable;
    if (!useSubway && !busAvailable) return null;

    const access = useSubway ? ACCESS_METERS.SUBWAY : ACCESS_METERS.BUS;
    const rideMeters = meters - access * 2;

    // Too short to be worth the walk to a station and the wait on it.
    if (rideMeters < 600) return null;

    const mode: TransportMode = useSubway ? "SUBWAY" : "BUS";
    const speed = useSubway ? SPEED.SUBWAY : SPEED.BUS;
    const wait = useSubway
      ? OVERHEAD_MINUTES.SUBWAY_WAIT
      : OVERHEAD_MINUTES.BUS_WAIT;
    const stopName = useSubway ? "the station" : "the stop";

    return assemble([
      leg(
        "WALK",
        0,
        from,
        stopName,
        access,
        minutesFor(access, SPEED.WALK),
        0,
        `Walk to ${stopName}.`,
      ),
      leg(
        mode,
        1,
        stopName,
        stopName,
        rideMeters,
        minutesFor(rideMeters, speed) + wait,
        transitFareCents(city, query.travelers),
        useSubway
          ? `Take the subway toward ${to}.`
          : `Take the bus toward ${to}.`,
      ),
      leg(
        "WALK",
        2,
        stopName,
        to,
        access,
        minutesFor(access, SPEED.WALK),
        0,
        `Walk to ${to}.`,
      ),
    ]);
  };

  if (ridesharePreferred || carPreferred) return rideshare();

  const publicOption = publicRoute();
  if (!publicOption) return rideshare();

  if (transitPreferred || cheapest) return publicOption;

  const car = rideshare();

  if (fastest) {
    return car.totalDurationMinutes < publicOption.totalDurationMinutes
      ? car
      : publicOption;
  }

  // No strong preference: take transit unless a car saves a real chunk of
  // time. Fifteen minutes is the threshold where the fare stops mattering.
  return car.totalDurationMinutes + 15 <= publicOption.totalDurationMinutes
    ? car
    : publicOption;
}
