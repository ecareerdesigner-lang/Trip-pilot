import { providerMode } from "@/lib/env";
import { nightsBetween } from "@/lib/format";
import { resolveCity } from "@/lib/providers/mock/cities";
import { generateHotels } from "@/lib/providers/mock/catalog";
import type { HotelCandidate, HotelProvider, HotelQuery } from "@/lib/providers/types";

export class MockHotelProvider implements HotelProvider {
  async search(query: HotelQuery): Promise<HotelCandidate[]> {
    const city = resolveCity(query.destination);
    // No sample data for this destination. Returning nothing is the honest
    // answer; inventing a plausible hotel would be worse than an empty list.
    if (!city) return [];

    const nights = Math.max(1, nightsBetween(query.dates.start, query.dates.end));
    const rooms = Math.max(1, Math.ceil(query.travelers / 2));

    return generateHotels(city, `${query.dates.start}:${query.travelers}`)
      .map((hotel) => ({
        ...hotel,
        totalRateCents: hotel.nightlyRateCents * nights * rooms,
      }))
      .filter(
        (hotel) =>
          query.maxNightlyRateCents === undefined ||
          hotel.nightlyRateCents <= query.maxNightlyRateCents,
      )
      .sort((a, b) => b.reviewScore - a.reviewScore)
      .slice(0, query.limit ?? 8);
  }
}

export function getHotelProvider(): HotelProvider {
  switch (providerMode("hotels")) {
    // TODO(Phase 23): live hotel implementations land here.
    default:
      return new MockHotelProvider();
  }
}
