import { getActivityProvider } from "@/lib/providers/activities";
import { getHotelProvider } from "@/lib/providers/hotels";
import { getRestaurantProvider } from "@/lib/providers/restaurants";
import { getWeatherProvider } from "@/lib/providers/weather";
import type {
  ActivityCandidate,
  HotelCandidate,
  RestaurantCandidate,
  WeatherDay,
} from "@/lib/providers/types";
import type { GeoPoint } from "@/types/domain";

/**
 * Gather the real options a trip will be planned from.
 *
 * The planner never invents a hotel or a fare; it chooses from what this
 * returns. Each candidate is given a short stable id that the planner
 * references, so a selection can always be resolved back to concrete data.
 */

export interface CandidateSet {
  hotels: Map<string, HotelCandidate>;
  restaurants: Map<string, RestaurantCandidate>;
  activities: Map<string, ActivityCandidate>;
  weather: WeatherDay[];
  /** True when no provider had anything for this destination. */
  empty: boolean;
}

export interface CollectOptions {
  destination: string;
  startDate: string;
  endDate: string;
  travelers: number;
  maxNightlyRateCents?: number;
  near?: GeoPoint;
}

/** Short, stable, and readable in a prompt: `h1`, `r7`, `a3`. */
function index<T>(prefix: string, items: T[]): Map<string, T> {
  return new Map(items.map((item, position) => [`${prefix}${position + 1}`, item]));
}

export async function collectCandidates(
  options: CollectOptions,
): Promise<CandidateSet> {
  const dates = { start: options.startDate, end: options.endDate };

  // Providers are independent; one being slow should not serialize the rest.
  const [hotels, restaurants, activities, weather] = await Promise.all([
    getHotelProvider().search({
      destination: options.destination,
      dates,
      travelers: options.travelers,
      ...(options.maxNightlyRateCents !== undefined
        ? { maxNightlyRateCents: options.maxNightlyRateCents }
        : {}),
    }),
    getRestaurantProvider().search({
      destination: options.destination,
      travelers: options.travelers,
      limit: 14,
      ...(options.near ? { near: options.near } : {}),
    }),
    getActivityProvider().search({
      destination: options.destination,
      travelers: options.travelers,
      limit: 12,
    }),
    getWeatherProvider().forecast({ destination: options.destination, dates }),
  ]);

  return {
    hotels: index("h", hotels),
    restaurants: index("r", restaurants),
    activities: index("a", activities),
    weather,
    empty:
      hotels.length === 0 && restaurants.length === 0 && activities.length === 0,
  };
}

/** Coordinates for a candidate id, whichever kind it is. */
export function candidatePoint(
  candidates: CandidateSet,
  candidateId: string,
): GeoPoint | null {
  const place =
    candidates.hotels.get(candidateId)?.place ??
    candidates.restaurants.get(candidateId)?.place ??
    candidates.activities.get(candidateId)?.place;

  if (!place || place.latitude == null || place.longitude == null) return null;
  return { latitude: place.latitude, longitude: place.longitude };
}
