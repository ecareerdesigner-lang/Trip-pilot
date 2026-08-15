import "server-only";
import { providerMode } from "@/lib/env";
import { resolveCity } from "@/lib/providers/mock/cities";
import { generateActivities } from "@/lib/providers/mock/catalog";
import {
  searchPlacesRich,
  priceLevelToNumber,
  extractHours,
  type GooglePlaceRich,
} from "@/lib/providers/google-places-rich";
import type {
  ActivityCandidate,
  ActivityProvider,
  ActivityQuery,
} from "@/lib/providers/types";

export class MockActivityProvider implements ActivityProvider {
  async search(query: ActivityQuery): Promise<ActivityCandidate[]> {
    const city = resolveCity(query.destination);
    if (!city) return [];

    let results = generateActivities(city, String(query.travelers));

    if (query.categories && query.categories.length > 0) {
      const wanted = query.categories.map((category) => category.toLowerCase());
      const matching = results.filter((activity) =>
        wanted.includes(activity.category.toLowerCase()),
      );
      if (matching.length > 0) results = matching;
    }

    if (query.maxPriceCents !== undefined) {
      results = results.filter(
        (activity) => activity.priceCents <= query.maxPriceCents!,
      );
    }

    return results
      .sort((a, b) => b.reviewScore - a.reviewScore)
      .slice(0, query.limit ?? 10);
  }
}

/** Typical visit length, in minutes, by place type. A real estimate, not a
 * fact — Google's Places data does not say how long people stay. */
const DURATION_BY_TYPE: Record<string, number> = {
  museum: 120,
  art_gallery: 90,
  amusement_park: 240,
  aquarium: 120,
  zoo: 150,
  park: 90,
  national_park: 180,
  tourist_attraction: 90,
  historical_landmark: 60,
  church: 45,
  hindu_temple: 45,
  mosque: 45,
  synagogue: 45,
  monument: 30,
  observation_deck: 60,
  garden: 60,
};

function categoryOf(types: string[]): string {
  for (const type of types) {
    if (type in DURATION_BY_TYPE) return type;
  }
  return types[0] ?? "attraction";
}

function toActivityCandidate(place: GooglePlaceRich): ActivityCandidate | null {
  if (!place.location || !place.displayName) return null;

  const types = place.types ?? [];
  const category = categoryOf(types);
  const priceLevel = priceLevelToNumber(place.priceLevel);

  return {
    providerName: "google",
    providerRef: place.id,
    isMock: false,
    name: place.displayName.text,
    description: `${category.replace(/_/g, " ")}.`,
    place: {
      name: place.displayName.text,
      kind: "ATTRACTION",
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
    category,
    durationMinutes: DURATION_BY_TYPE[category] ?? 90,
    // Google's Places data does not include ticket prices. 0 rather than a
    // guess — many attractions genuinely are free, and the budget engine
    // already treats an unpriced item as "unknown", not "confirmed free".
    priceCents: priceLevel > 1 ? AVERAGE_PRICE_CENTS[priceLevel] ?? 0 : 0,
    reviewScore: place.rating ?? 0,
    reviewCount: place.userRatingCount ?? 0,
    hours: extractHours(place),
    bookingRequired: false,
    tags: types.slice(0, 5),
  };
}

/** Same reasoning as restaurants' AVERAGE_MEAL_CENTS — a real estimate
 * banded off Google's coarse price level, not a real ticket price. */
const AVERAGE_PRICE_CENTS: Record<number, number> = {
  2: 2_000,
  3: 4_000,
  4: 7_000,
};

export class GoogleActivityProvider implements ActivityProvider {
  async search(query: ActivityQuery): Promise<ActivityCandidate[]> {
    const categoryText =
      query.categories && query.categories.length > 0
        ? query.categories.join(" or ")
        : "things to do";
    const places = await searchPlacesRich(`${categoryText} in ${query.destination}`);

    let results = places
      .map((place) => toActivityCandidate(place))
      .filter((a): a is ActivityCandidate => a !== null);

    if (query.maxPriceCents !== undefined) {
      results = results.filter((a) => a.priceCents <= query.maxPriceCents!);
    }

    return results
      .sort((a, b) => b.reviewScore - a.reviewScore)
      .slice(0, query.limit ?? 10);
  }
}

export function getActivityProvider(): ActivityProvider {
  switch (providerMode("activities")) {
    case "google":
      return new GoogleActivityProvider();
    default:
      return new MockActivityProvider();
  }
}
