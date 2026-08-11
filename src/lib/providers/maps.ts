import { providerMode } from "@/lib/env";
import { distanceMeters } from "@/lib/geo";
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

export function getMapsProvider(): MapsProvider {
  switch (providerMode("maps")) {
    // TODO(Phase 21/23): mapbox and google implementations land here.
    default:
      return new MockMapsProvider();
  }
}
