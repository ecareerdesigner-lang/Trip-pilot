import "server-only";
import { providerMode, env } from "@/lib/env";
import { distanceMeters } from "@/lib/geo";
import { createRng } from "@/lib/providers/mock/rng";
import { resolveCity, type Airport, type City } from "@/lib/providers/mock/cities";
import { AppError, providerUnavailable } from "@/lib/errors";
import { logger } from "@/lib/logger";
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

/**
 * Duffel Flights — real airline inventory (300+ airlines), replacing
 * Amadeus after its self-service portal was fully decommissioned on
 * July 17, 2026.
 * https://duffel.com/docs/api/v2/offer-requests
 *
 * Needs a real IATA airport code for both ends, not a city name — resolved
 * here through the same mock city data the rest of the app already uses,
 * since that already carries a real airport code per city. A destination
 * outside that known list returns no flights rather than a guess, same
 * reasoning the mock itself already uses for an unrecognized city.
 *
 * ⚠️ The request shape (slices, passengers, cabin_class) is confirmed
 * against Duffel's own published example. The exact path through a
 * returned offer's `slices[].segments[]` — specifically how a connecting
 * flight's segments come back — is a best effort from documentation, not a
 * live response. Test a real round-trip search and compare the raw JSON
 * before trusting stop counts on anything but a direct flight.
 */

const DUFFEL_BASE = "https://api.duffel.com";
const DUFFEL_VERSION = "v2";

function apiKey(): string {
  const key = (env().FLIGHT_API_KEY ?? "").trim();
  if (!key) {
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "FLIGHT_API_KEY is not set. Check .env.",
    );
  }
  return key;
}

async function duffelGet<T>(
  path: string,
  key: string,
  timeoutMs = 10_000,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${DUFFEL_BASE}${path}`, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        "Duffel-Version": DUFFEL_VERSION,
      },
    });

    const json = (await response.json().catch(() => null)) as
      | (T & { errors?: { message?: string }[] })
      | null;

    if (!response.ok) {
      const detail = json?.errors?.map((e) => e.message).join("; ") ?? "";
      logger.error("Duffel request failed", { path, status: response.status, detail });
      throw providerUnavailable("Duffel");
    }

    if (!json) throw providerUnavailable("Duffel");
    return json;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw providerUnavailable("Duffel");
    }
    logger.error("Duffel request threw", {
      path,
      message: error instanceof Error ? error.message : String(error),
    });
    throw providerUnavailable("Duffel");
  } finally {
    clearTimeout(timeout);
  }
}

interface DuffelPlace {
  type: "airport" | "city";
  name: string;
  iata_code?: string;
}

interface DuffelPlacesResponse {
  data?: DuffelPlace[];
}

/**
 * Resolves a plain destination name to a real IATA code — an airport or a
 * city code, both of which Duffel's flight search accepts directly. This
 * replaces looking the destination up in the same small hardcoded city list
 * the mock provider uses: that list has 8 entries, and Rome was not one of
 * them, which is why "no flights found" was actually "never asked Duffel
 * anything" — the airport code lookup failed silently before the search
 * ever ran.
 *
 * https://duffel.com/docs/api/places/get-place-suggestions
 */
async function resolveAirportCode(
  query: string,
  key: string,
): Promise<string | null> {
  const response = await duffelGet<DuffelPlacesResponse>(
    `/places/suggestions?query=${encodeURIComponent(query)}`,
    key,
  );
  const first = response.data?.[0];
  return first?.iata_code ?? null;
}


interface DuffelAirportRef {
  iata_code?: string;
  name?: string;
  city_name?: string;
  iata_country_code?: string;
  latitude?: number;
  longitude?: number;
  time_zone?: string;
}

interface DuffelSegment {
  origin?: DuffelAirportRef;
  destination?: DuffelAirportRef;
  departing_at?: string;
  arriving_at?: string;
  marketing_carrier?: { name?: string };
  marketing_carrier_flight_number?: string;
}

interface DuffelSlice {
  duration?: string;
  segments?: DuffelSegment[];
}

interface DuffelOffer {
  id: string;
  total_amount?: string;
  total_currency?: string;
  slices?: DuffelSlice[];
}

interface DuffelOfferRequestResponse {
  data?: { offers?: DuffelOffer[] };
  errors?: { message?: string }[];
}

async function duffelPost<T>(
  path: string,
  body: unknown,
  key: string,
  timeoutMs = 15_000,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${DUFFEL_BASE}${path}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Duffel-Version": DUFFEL_VERSION,
      },
      body: JSON.stringify({ data: body }),
    });

    const json = (await response.json().catch(() => null)) as
      | (T & { errors?: { message?: string }[] })
      | null;

    if (!response.ok) {
      const detail = json?.errors?.map((e) => e.message).join("; ") ?? "";
      logger.error("Duffel request failed", { path, status: response.status, detail });
      throw providerUnavailable("Duffel");
    }

    if (!json) throw providerUnavailable("Duffel");
    return json;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw providerUnavailable("Duffel");
    }
    logger.error("Duffel request threw", {
      path,
      message: error instanceof Error ? error.message : String(error),
    });
    throw providerUnavailable("Duffel");
  } finally {
    clearTimeout(timeout);
  }
}

function toCents(amount: string | undefined): number {
  if (!amount) return 0;
  const value = Number.parseFloat(amount);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

/** "PT7H30M" -> 450. Missing hour or minute component is treated as 0. */
function parseIsoDurationMinutes(duration: string | undefined): number {
  if (!duration) return 0;
  const match = /PT(?:(\d+)H)?(?:(\d+)M)?/.exec(duration);
  const hours = match?.[1] ? Number.parseInt(match[1], 10) : 0;
  const minutes = match?.[2] ? Number.parseInt(match[2], 10) : 0;
  return hours * 60 + minutes;
}

/**
 * Duffel's own offer response already carries full airport detail
 * (name, city, country, coordinates, timezone) on every segment's origin
 * and destination — no separate lookup needed to build a real PlaceRef,
 * unlike the mock provider's airports which only exist inside the 8-city
 * list and need `airportPlace()` above to fill in the rest.
 */
function placeFor(airport: DuffelAirportRef | undefined): PlaceRef {
  return {
    name: airport?.name ?? airport?.iata_code ?? "Unknown airport",
    kind: "AIRPORT",
    city: airport?.city_name ?? null,
    region: null,
    country: airport?.iata_country_code ?? null,
    latitude: airport?.latitude ?? null,
    longitude: airport?.longitude ?? null,
    timezone: airport?.time_zone ?? null,
    providerRef: airport?.iata_code,
    providerName: "duffel",
  };
}

function offerToCandidates(offer: DuffelOffer): FlightCandidate[] {
  const totalCents = toCents(offer.total_amount);

  return (offer.slices ?? []).map((slice, sliceIndex): FlightCandidate => {
    const segments = slice.segments ?? [];
    const first = segments[0];
    const last = segments[segments.length - 1];

    return {
      providerName: "duffel",
      providerRef: offer.id,
      isMock: false,
      carrier: first?.marketing_carrier?.name ?? "Unknown carrier",
      identifier: first?.marketing_carrier_flight_number ?? "",
      originCode: first?.origin?.iata_code ?? "",
      destinationCode: last?.destination?.iata_code ?? "",
      originPlace: placeFor(first?.origin),
      destinationPlace: placeFor(last?.destination),
      departureTime: first?.departing_at ?? "",
      arrivalTime: last?.arriving_at ?? "",
      durationMinutes: parseIsoDurationMinutes(slice.duration),
      priceCents: sliceIndex === 0 ? totalCents : 0, // total is per-offer, not per-slice; only counted once
      stops: Math.max(0, segments.length - 1),
      isReturn: sliceIndex > 0,
    };
  });
}

export class DuffelFlightProvider implements FlightProvider {
  async search(query: FlightQuery): Promise<FlightCandidate[]> {
    const key = apiKey();

    // Real lookup, not the mock provider's 8-city list — resolves any
    // airport or city name Duffel knows about, worldwide.
    const [originCode, destinationCode] = await Promise.all([
      resolveAirportCode(query.origin, key),
      resolveAirportCode(query.destination, key),
    ]);
    if (!originCode || !destinationCode) {
      // Silent before this — "no flights found" and "we never actually
      // asked Duffel anything because we couldn't resolve an airport" look
      // identical to the traveler. They are not the same problem, and only
      // one of them is fixable by picking different dates.
      logger.warn("Could not resolve an airport code, skipping flight search", {
        origin: query.origin,
        originResolved: originCode,
        destination: query.destination,
        destinationResolved: destinationCode,
      });
      return [];
    }

    const slices = [
      { origin: originCode, destination: destinationCode, departure_date: query.departDate },
    ];
    if (query.returnDate) {
      slices.push({
        origin: destinationCode,
        destination: originCode,
        departure_date: query.returnDate,
      });
    }

    const response = await duffelPost<DuffelOfferRequestResponse>(
      "/air/offer_requests?return_offers=true",
      {
        slices,
        passengers: Array.from({ length: Math.max(1, query.travelers) }, () => ({
          type: "adult",
        })),
        cabin_class: "economy",
      },
      key,
    );

    const offers = response.data?.offers ?? [];
    const limit = query.limit ?? 4;

    if (offers.length === 0) {
      logger.warn("Duffel returned zero flight offers for a resolved route", {
        originCode,
        destinationCode,
        departDate: query.departDate,
        returnDate: query.returnDate,
      });
    }

    return offers
      .slice(0, limit)
      .flatMap((offer) => offerToCandidates(offer))
      .sort((a, b) => a.priceCents - b.priceCents);
  }
}

export function getFlightProvider(): FlightProvider {
  switch (providerMode("flights")) {
    case "duffel":
      return new DuffelFlightProvider();
    default:
      return new MockFlightProvider();
  }
}
