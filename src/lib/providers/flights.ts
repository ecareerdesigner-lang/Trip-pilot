import { providerMode } from "@/lib/env";
import { distanceMeters } from "@/lib/geo";
import { createRng } from "@/lib/providers/mock/rng";
import { resolveCity, type Airport, type City } from "@/lib/providers/mock/cities";
import type {
  FlightCandidate,
  FlightProvider,
  FlightQuery,
} from "@/lib/providers/types";
import type { PlaceRef } from "@/types/domain";

/**
 * Flights.
 *
 * Durations come from the great-circle distance divided by a cruise speed,
 * plus fixed taxi and climb time — not from a table. Fares scale with
 * distance and party size. Everything is marked as sample data.
 */

const CRUISE_METERS_PER_MINUTE = 13_000; // ~780 km/h
const GROUND_MINUTES = 35; // taxi, climb, descent, taxi
const BASE_FARE_CENTS = 6_500;
const FARE_PER_100KM_CENTS = 1_450;

const CARRIERS = [
  { name: "Cardinal Air", prefix: "CA" },
  { name: "Northline", prefix: "NL" },
  { name: "Meridian Airways", prefix: "MD" },
  { name: "Bluewing", prefix: "BW" },
];

function airportPlace(city: City, airport: Airport): PlaceRef {
  return {
    name: airport.name,
    kind: "AIRPORT",
    city: city.name,
    region: city.region,
    country: city.country,
    latitude: airport.point.latitude,
    longitude: airport.point.longitude,
    timezone: city.timezone,
    providerName: "mock",
    providerRef: airport.code,
    isMock: true,
  };
}

function isoAt(date: string, minuteOfDay: number): string {
  const base = Date.parse(`${date}T00:00:00.000Z`);
  return new Date(base + minuteOfDay * 60_000).toISOString();
}

function buildLeg(
  from: City,
  to: City,
  date: string,
  travelers: number,
  isReturn: boolean,
  index: number,
): FlightCandidate | null {
  const origin = from.airports[0];
  const destination = to.airports[index % to.airports.length];
  if (!origin || !destination) return null;

  const rng = createRng(`flight:${from.key}:${to.key}:${date}:${index}`);
  const meters = distanceMeters(origin.point, destination.point);

  const stops = meters > 3_000_000 && rng.bool(0.4) ? 1 : 0;
  const durationMinutes =
    Math.round(meters / CRUISE_METERS_PER_MINUTE) +
    GROUND_MINUTES +
    stops * rng.int(55, 95);

  const departureMinute = rng.int(6 * 60, 19 * 60);
  const perTraveler = Math.round(
    (BASE_FARE_CENTS + (meters / 100_000) * FARE_PER_100KM_CENTS) *
      rng.float(0.85, 1.3) *
      (stops > 0 ? 0.82 : 1),
  );

  const carrier = CARRIERS[index % CARRIERS.length]!;

  return {
    providerName: "mock",
    providerRef: `mock-flight-${from.key}-${to.key}-${index}`,
    isMock: true,
    carrier: carrier.name,
    identifier: `${carrier.prefix}${rng.int(100, 1999)}`,
    originCode: origin.code,
    destinationCode: destination.code,
    originPlace: airportPlace(from, origin),
    destinationPlace: airportPlace(to, destination),
    departureTime: isoAt(date, departureMinute),
    arrivalTime: isoAt(date, departureMinute + durationMinutes),
    durationMinutes,
    priceCents: perTraveler * Math.max(1, travelers),
    stops,
    isReturn,
  };
}

export class MockFlightProvider implements FlightProvider {
  async search(query: FlightQuery): Promise<FlightCandidate[]> {
    const from = resolveCity(query.origin);
    const to = resolveCity(query.destination);
    if (!from || !to || from.key === to.key) return [];

    const limit = query.limit ?? 4;
    const outbound = Array.from({ length: limit }, (_, index) =>
      buildLeg(from, to, query.departDate, query.travelers, false, index),
    ).filter((flight): flight is FlightCandidate => flight !== null);

    const inbound = query.returnDate
      ? Array.from({ length: limit }, (_, index) =>
          buildLeg(to, from, query.returnDate!, query.travelers, true, index),
        ).filter((flight): flight is FlightCandidate => flight !== null)
      : [];

    return [...outbound, ...inbound].sort((a, b) => a.priceCents - b.priceCents);
  }
}

export function getFlightProvider(): FlightProvider {
  switch (providerMode("flights")) {
    default:
      return new MockFlightProvider();
  }
}
