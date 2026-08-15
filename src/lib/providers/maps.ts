import "server-only";
import { env, providerMode } from "@/lib/env";
import { distanceMeters } from "@/lib/geo";
import { AppError, providerUnavailable } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { MOCK_CITIES, resolveCity } from "@/lib/providers/mock/cities";
import type { GeocodeResult, MapsProvider } from "@/lib/providers/types";
import type { GeoPoint, PlaceRef } from "@/types/domain";

/**
 * Maps provider.
 *
 * Business logic asks this for coordinates and never names a mapping vendor,
 * so swapping Mapbox for Google is a change to this file alone.
 */

function toResult(place: PlaceRef): GeocodeResult {
  return { providerName: "mock", isMock: true, place };
}

export class MockMapsProvider implements MapsProvider {
  async geocode(query: string): Promise<GeocodeResult | null> {
    const city = resolveCity(query);
    if (city) {
      return toResult({
        name: city.name,
        kind: "CITY",
        city: city.name,
        region: city.region,
        country: city.country,
        latitude: city.center.latitude,
        longitude: city.center.longitude,
        timezone: city.timezone,
        providerName: "mock",
        isMock: true,
      });
    }

    // Airports are worth resolving by code even when the query is not a city.
    const needle = query.trim().toLowerCase();
    for (const candidate of MOCK_CITIES) {
      const airport = candidate.airports.find(
        (entry) =>
          entry.code.toLowerCase() === needle ||
          entry.name.toLowerCase() === needle,
      );
      if (airport) {
        return toResult({
          name: airport.name,
          kind: "AIRPORT",
          city: candidate.name,
          region: candidate.region,
          country: candidate.country,
          latitude: airport.point.latitude,
          longitude: airport.point.longitude,
          timezone: candidate.timezone,
          providerName: "mock",
          isMock: true,
        });
      }
    }

    // Unresolvable. Null rather than a guess — a wrong coordinate would
    // silently corrupt every travel time computed from it.
    return null;
  }

  async search(destination: string, query: string): Promise<GeocodeResult[]> {
    const city = resolveCity(destination);
    if (!city) return [];

    const needle = query.trim().toLowerCase();

    const airports = city.airports
      .filter(
        () => needle.includes("airport") || needle.length === 0 || needle === "air",
      )
      .map((airport) =>
        toResult({
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
        }),
      );

    const landmarks = city.landmarks
      .filter((landmark) => landmark.name.toLowerCase().includes(needle))
      .map((landmark) =>
        toResult({
          name: landmark.name,
          kind: "ATTRACTION",
          city: city.name,
          region: city.region,
          country: city.country,
          latitude: landmark.point.latitude,
          longitude: landmark.point.longitude,
          timezone: city.timezone,
          providerName: "mock",
          isMock: true,
        }),
      );

    return [...airports, ...landmarks];
  }

  distanceMeters(from: GeoPoint, to: GeoPoint): number {
    return distanceMeters(from, to);
  }
}

/**
 * Google Places API (New) — Text Search.
 *
 * Deliberately built on Text Search rather than the classic Geocoding API:
 * the key here is restricted to Routes API and Places API (New) only, and
 * Text Search covers both a free-text geocode and a named-place search with
 * one endpoint, so nothing extra needs enabling.
 *
 * https://developers.google.com/maps/documentation/places/web-service/text-search
 */

const PLACES_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.addressComponents";

interface GooglePlace {
  id: string;
  displayName?: { text: string; languageCode?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  types?: string[];
  addressComponents?: {
    longText?: string;
    shortText?: string;
    types?: string[];
  }[];
}

interface TextSearchResponse {
  places?: GooglePlace[];
}

function apiKey(): string {
  const key = (env().GOOGLE_PLACES_API_KEY ?? "").trim();
  if (!key) {
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "GOOGLE_PLACES_API_KEY is not set. Check .env.",
    );
  }
  return key;
}

/** Best-effort city/region extraction from address components. Google does
 * not label these consistently across countries, so this reads the two
 * types most places actually carry rather than assuming a fixed shape. */
function extractCityRegion(place: GooglePlace): {
  city: string | null;
  region: string | null;
} {
  const components = place.addressComponents ?? [];
  const city =
    components.find((c) => c.types?.includes("locality"))?.longText ?? null;
  const region =
    components.find((c) => c.types?.includes("administrative_area_level_1"))
      ?.shortText ?? null;
  return { city, region };
}

function classify(place: GooglePlace): PlaceRef["kind"] {
  const types = place.types ?? [];
  if (types.includes("airport")) return "AIRPORT";
  if (types.includes("locality") || types.includes("political")) return "CITY";
  if (types.includes("lodging")) return "HOTEL";
  if (types.includes("restaurant") || types.includes("food")) return "RESTAURANT";
  return "ATTRACTION";
}

async function searchText(
  textQuery: string,
  timeoutMs = 10_000,
): Promise<GooglePlace[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(PLACES_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey(),
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({ textQuery }),
    });

    if (!response.ok) {
      let detail = "";
      try {
        const body = (await response.json()) as {
          error?: { message?: string };
        };
        detail = body.error?.message ?? "";
      } catch {
        detail = "";
      }
      logger.error("Google Places request failed", {
        status: response.status,
        detail,
      });
      throw providerUnavailable("Google Places");
    }

    const data = (await response.json()) as TextSearchResponse;
    return data.places ?? [];
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw providerUnavailable("Google Places");
    }
    logger.error("Google Places request threw", {
      message: error instanceof Error ? error.message : String(error),
    });
    throw providerUnavailable("Google Places");
  } finally {
    clearTimeout(timeout);
  }
}

function toGeocodeResult(place: GooglePlace): GeocodeResult | null {
  if (!place.location || !place.displayName) return null;
  const { city, region } = extractCityRegion(place);

  return {
    providerName: "google",
    providerRef: place.id,
    isMock: false,
    place: {
      name: place.displayName.text,
      kind: classify(place),
      address: place.formattedAddress ?? null,
      city,
      region,
      country: null,
      latitude: place.location.latitude,
      longitude: place.location.longitude,
      timezone: null,
    },
  };
}

export class GoogleMapsProvider implements MapsProvider {
  async geocode(query: string): Promise<GeocodeResult | null> {
    const places = await searchText(query);
    const first = places[0];
    if (!first) return null;
    return toGeocodeResult(first);
  }

  async search(destination: string, query: string): Promise<GeocodeResult[]> {
    // Text Search takes one free-text string, so the destination is folded
    // into the query rather than passed as a separate parameter — "Empire
    // State Building" alone is ambiguous, "Empire State Building in New
    // York City" is not.
    const places = await searchText(
      query.trim().length > 0 ? `${query} in ${destination}` : destination,
    );
    return places
      .map((place) => toGeocodeResult(place))
      .filter((result): result is GeocodeResult => result !== null);
  }

  distanceMeters(from: GeoPoint, to: GeoPoint): number {
    // Straight-line distance, same as the mock. The Routes API gives a real
    // travel distance for an actual journey; this method is for coarse
    // sorting/filtering, not for anything charged or scheduled — see
    // travel/routing.ts, which is where a real journey's distance comes
    // from regardless of which MapsProvider is active.
    return distanceMeters(from, to);
  }
}

export function getMapsProvider(): MapsProvider {
  switch (providerMode("maps")) {
    case "google":
      return new GoogleMapsProvider();
    // TODO(Phase 23): mapbox implementation lands here.
    default:
      return new MockMapsProvider();
  }
}
