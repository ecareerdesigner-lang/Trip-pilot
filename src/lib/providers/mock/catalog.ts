import { distanceMeters, offsetPoint } from "@/lib/geo";
import { createRng, type Rng } from "@/lib/providers/mock/rng";
import type { City, Neighborhood } from "@/lib/providers/mock/cities";
import type {
  ActivityCandidate,
  HotelCandidate,
  RestaurantCandidate,
} from "@/lib/providers/types";
import type { PlaceRef } from "@/types/domain";

/**
 * Generates sample hotels, restaurants and activities for a city.
 *
 * Deterministic: the same city and seed always produce the same list in the
 * same order, so a re-plan does not silently swap the hotel and tests do not
 * flake.
 *
 * Places are positioned near real neighbourhood coordinates, because every
 * travel time in the system is derived from distance. A restaurant dropped
 * at an arbitrary point would produce a schedule that cannot be walked.
 */

const HOTEL_STYLES = [
  { kind: "boutique hotel", star: 4, rate: 1.15, amenities: ["Wi-Fi", "Bar", "Room service"] },
  { kind: "business hotel", star: 4, rate: 1.0, amenities: ["Wi-Fi", "Gym", "Business center"] },
  { kind: "budget hotel", star: 3, rate: 0.7, amenities: ["Wi-Fi", "Breakfast"] },
  { kind: "luxury hotel", star: 5, rate: 1.75, amenities: ["Wi-Fi", "Spa", "Concierge", "Pool"] },
  { kind: "apartment hotel", star: 4, rate: 0.95, amenities: ["Wi-Fi", "Kitchen", "Laundry"] },
  { kind: "guesthouse", star: 3, rate: 0.65, amenities: ["Wi-Fi", "Breakfast", "Shared lounge"] },
];

const RESTAURANT_STYLES = [
  { kind: "counter", priceLevel: 1, meal: 0.45, reserve: false, opens: 11 * 60, closes: 21 * 60 },
  { kind: "cafe", priceLevel: 1, meal: 0.4, reserve: false, opens: 7 * 60, closes: 16 * 60 },
  { kind: "bistro", priceLevel: 2, meal: 0.85, reserve: false, opens: 11 * 60 + 30, closes: 22 * 60 },
  { kind: "trattoria", priceLevel: 2, meal: 0.9, reserve: true, opens: 12 * 60, closes: 22 * 60 + 30 },
  { kind: "dining room", priceLevel: 3, meal: 1.6, reserve: true, opens: 17 * 60, closes: 22 * 60 + 30 },
  { kind: "tasting room", priceLevel: 4, meal: 3.2, reserve: true, opens: 18 * 60, closes: 22 * 60 },
];

/** Baseline nightly rate in cents before the city and style multipliers. */
const BASE_NIGHTLY_CENTS = 16_000;
/** Baseline cost of one meal for one person, before multipliers. */
const BASE_MEAL_CENTS = 3_200;

function place(
  name: string,
  city: City,
  point: { latitude: number; longitude: number },
  kind: PlaceRef["kind"],
  neighborhood: string,
): PlaceRef {
  return {
    name,
    kind,
    address: neighborhood,
    city: city.name,
    region: city.region,
    country: city.country,
    latitude: point.latitude,
    longitude: point.longitude,
    timezone: city.timezone,
    providerName: "mock",
    isMock: true,
  };
}

/** Scatter a place within a few hundred metres of its neighbourhood centre. */
function scatter(neighborhood: Neighborhood, rng: Rng) {
  return offsetPoint(
    neighborhood.point,
    rng.float(-450, 450),
    rng.float(-450, 450),
  );
}

function reviewScore(rng: Rng, floor: number): number {
  return Math.round(rng.float(floor, 4.9) * 10) / 10;
}

export function generateHotels(city: City, seed: string, count = 8): HotelCandidate[] {
  const rng = createRng(`hotels:${city.key}:${seed}`);
  const neighborhoods = rng.shuffle(city.neighborhoods);

  return Array.from({ length: count }, (_, index) => {
    const neighborhood = neighborhoods[index % neighborhoods.length]!;
    const style = HOTEL_STYLES[index % HOTEL_STYLES.length]!;
    const point = scatter(neighborhood, rng);

    const nightlyRateCents = Math.round(
      BASE_NIGHTLY_CENTS *
        city.priceIndex *
        neighborhood.priceIndex *
        style.rate *
        rng.float(0.9, 1.12),
    );

    return {
      providerName: "mock",
      providerRef: `mock-hotel-${city.key}-${index}`,
      isMock: true,
      name: `${neighborhood.name} ${style.kind}`,
      description: `A ${style.kind} in ${neighborhood.name}.`,
      place: place(
        `${neighborhood.name} ${style.kind}`,
        city,
        point,
        "HOTEL",
        neighborhood.name,
      ),
      starRating: style.star,
      reviewScore: reviewScore(rng, 3.8),
      reviewCount: rng.int(120, 2_400),
      nightlyRateCents,
      totalRateCents: nightlyRateCents,
      checkInTime: "15:00",
      checkOutTime: "11:00",
      amenities: style.amenities,
      distanceToCenterMeters: distanceMeters(city.center, point),
    };
  });
}

export function generateRestaurants(
  city: City,
  seed: string,
  count = 12,
): RestaurantCandidate[] {
  const rng = createRng(`restaurants:${city.key}:${seed}`);
  const neighborhoods = rng.shuffle(city.neighborhoods);
  const cuisines = rng.shuffle(city.cuisines);

  return Array.from({ length: count }, (_, index) => {
    const neighborhood = neighborhoods[index % neighborhoods.length]!;
    const style = RESTAURANT_STYLES[index % RESTAURANT_STYLES.length]!;
    const cuisine = cuisines[index % cuisines.length]!;
    const point = scatter(neighborhood, rng);
    // "Upper West Side korean cafe" reads like a bug. Put the cuisine where
    // a real name would carry it.
    const name = `The ${cuisine} ${style.kind} on ${neighborhood.name}`;

    return {
      providerName: "mock",
      providerRef: `mock-restaurant-${city.key}-${index}`,
      isMock: true,
      name,
      description: `${cuisine} in ${neighborhood.name}.`,
      place: place(name, city, point, "RESTAURANT", neighborhood.name),
      cuisines: [cuisine],
      priceLevel: style.priceLevel,
      averageMealCents: Math.round(
        BASE_MEAL_CENTS *
          city.priceIndex *
          neighborhood.priceIndex *
          style.meal *
          rng.float(0.9, 1.15),
      ),
      reviewScore: reviewScore(rng, 3.9),
      reviewCount: rng.int(60, 3_100),
      hours: { opensMinute: style.opens, closesMinute: style.closes },
      reservationRequired: style.reserve,
    };
  });
}

/**
 * Activities come from the city's real landmarks rather than being invented.
 * Prices and durations are the landmark's own, so an itinerary built from
 * these is planning around places that exist.
 */
export function generateActivities(
  city: City,
  seed: string,
  count = 10,
): ActivityCandidate[] {
  const rng = createRng(`activities:${city.key}:${seed}`);

  return city.landmarks.slice(0, count).map((landmark, index) => ({
    providerName: "mock",
    providerRef: `mock-activity-${city.key}-${index}`,
    isMock: true,
    name: landmark.name,
    description: `${landmark.category} in ${city.name}.`,
    place: place(landmark.name, city, landmark.point, "ATTRACTION", city.name),
    category: landmark.category,
    durationMinutes: landmark.durationMinutes,
    priceCents: Math.round(landmark.priceCents * city.priceIndex),
    reviewScore: reviewScore(rng, 4.1),
    reviewCount: rng.int(500, 42_000),
    hours: {
      opensMinute: landmark.opensMinute,
      closesMinute: landmark.closesMinute,
    },
    bookingRequired: landmark.bookingRequired,
    tags: [landmark.category.toLowerCase()],
  }));
}
