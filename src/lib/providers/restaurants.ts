import { providerMode } from "@/lib/env";
import { distanceMeters, isValidPoint } from "@/lib/geo";
import { resolveCity } from "@/lib/providers/mock/cities";
import { generateRestaurants } from "@/lib/providers/mock/catalog";
import type {
  RestaurantCandidate,
  RestaurantProvider,
  RestaurantQuery,
} from "@/lib/providers/types";

export class MockRestaurantProvider implements RestaurantProvider {
  async search(query: RestaurantQuery): Promise<RestaurantCandidate[]> {
    const city = resolveCity(query.destination);
    if (!city) return [];

    const near = query.near;
    let results = generateRestaurants(city, String(query.travelers));

    if (query.cuisines && query.cuisines.length > 0) {
      const wanted = query.cuisines.map((cuisine) => cuisine.toLowerCase());
      const matching = results.filter((restaurant) =>
        restaurant.cuisines.some((cuisine) =>
          wanted.includes(cuisine.toLowerCase()),
        ),
      );
      // A cuisine filter that matches nothing should not empty the trip of
      // food; fall back to everything rather than returning no options.
      if (matching.length > 0) results = matching;
    }

    if (query.maxPriceLevel !== undefined) {
      const affordable = results.filter(
        (restaurant) => restaurant.priceLevel <= query.maxPriceLevel!,
      );
      if (affordable.length > 0) results = affordable;
    }

    // Nearest first when a location is given, best-reviewed otherwise.
    if (isValidPoint(near)) {
      results = [...results].sort((a, b) => {
        const aPoint = { latitude: a.place.latitude!, longitude: a.place.longitude! };
        const bPoint = { latitude: b.place.latitude!, longitude: b.place.longitude! };
        return distanceMeters(near, aPoint) - distanceMeters(near, bPoint);
      });
    } else {
      results = [...results].sort((a, b) => b.reviewScore - a.reviewScore);
    }

    return results.slice(0, query.limit ?? 10);
  }
}

export function getRestaurantProvider(): RestaurantProvider {
  switch (providerMode("restaurants")) {
    default:
      return new MockRestaurantProvider();
  }
}
