import "server-only";
import { providerMode } from "@/lib/env";
import { distanceMeters, isValidPoint } from "@/lib/geo";
import { resolveCity } from "@/lib/providers/mock/cities";
import { generateRestaurants } from "@/lib/providers/mock/catalog";
import {
  searchPlacesRich,
  priceLevelToNumber,
  extractHours,
  type GooglePlaceRich,
} from "@/lib/providers/google-places-rich";
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

const CUISINE_TYPES = new Set([
  "italian_restaurant",
  "french_restaurant",
  "japanese_restaurant",
  "chinese_restaurant",
  "mexican_restaurant",
  "indian_restaurant",
  "thai_restaurant",
  "greek_restaurant",
  "spanish_restaurant",
  "korean_restaurant",
  "vietnamese_restaurant",
  "seafood_restaurant",
  "steak_house",
  "sushi_restaurant",
  "pizza_restaurant",
  "cafe",
  "bakery",
]);

/** Average meal cost, in cents, per price level. A real estimate, not a
 * real menu — Google's Places data does not include actual prices. */
const AVERAGE_MEAL_CENTS: Record<number, number> = {
  1: 1_500,
  2: 3_000,
  3: 5_500,
  4: 9_000,
};

function toRestaurantCandidate(place: GooglePlaceRich): RestaurantCandidate | null {
  if (!place.location || !place.displayName) return null;

  const priceLevel = priceLevelToNumber(place.priceLevel);
  const cuisines = (place.types ?? []).filter((type) => CUISINE_TYPES.has(type));

  return {
    providerName: "google",
    providerRef: place.id,
    isMock: false,
    name: place.displayName.text,
    // Google's Places data does not include a real description at this
    // pricing tier (editorialSummary is a pricier SKU) — built from the
    // cuisine type instead of left blank.
    description: cuisines.length > 0
      ? `${cuisines[0]!.replace(/_restaurant$/, "").replace(/_/g, " ")} restaurant.`
      : "Restaurant.",
    place: {
      name: place.displayName.text,
      kind: "RESTAURANT",
      address: place.formattedAddress ?? null,
      city: null,
      region: null,
      country: null,
      latitude: place.location.latitude,
      longitude: place.location.longitude,
      timezone: null,
      providerRef: place.id,
      providerName: "google",
    },
    cuisines: cuisines.length > 0 ? cuisines : ["restaurant"],
    priceLevel,
    averageMealCents: AVERAGE_MEAL_CENTS[priceLevel] ?? 3_000,
    reviewScore: place.rating ?? 0,
    reviewCount: place.userRatingCount ?? 0,
    hours: extractHours(place),
    // Google does not reliably say whether a table needs to be booked.
    // Higher price tiers lean toward "yes" as a reasonable default, not a
    // fact — the traveler should still confirm for anywhere that matters.
    reservationRequired: priceLevel >= 3,
  };
}

export class GoogleRestaurantProvider implements RestaurantProvider {
  async search(query: RestaurantQuery): Promise<RestaurantCandidate[]> {
    const cuisineText =
      query.cuisines && query.cuisines.length > 0
        ? `${query.cuisines.join(" or ")} restaurants`
        : "restaurants";
    const places = await searchPlacesRich(`${cuisineText} in ${query.destination}`);

    let results = places
      .map((place) => toRestaurantCandidate(place))
      .filter((r): r is RestaurantCandidate => r !== null);

    if (query.maxPriceLevel !== undefined) {
      const affordable = results.filter((r) => r.priceLevel <= query.maxPriceLevel!);
      if (affordable.length > 0) results = affordable;
    }

    if (isValidPoint(query.near)) {
      const near = query.near;
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
    case "google":
      return new GoogleRestaurantProvider();
    default:
      return new MockRestaurantProvider();
  }
}
