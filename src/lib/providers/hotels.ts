import "server-only";
import { providerMode, env } from "@/lib/env";
import { nightsBetween } from "@/lib/format";
import { resolveCity } from "@/lib/providers/mock/cities";
import { generateHotels } from "@/lib/providers/mock/catalog";
import { getMapsProvider } from "@/lib/providers/maps";
import { AppError, providerUnavailable } from "@/lib/errors";
import { logger } from "@/lib/logger";
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

/**
 * Duffel Stays — real hotel inventory (2M+ properties), replacing Amadeus
 * after its self-service portal was fully decommissioned July 17, 2026.
 * https://duffel.com/docs/guides/getting-started-with-stays
 *
 * ⚠️ Built from documentation and Duffel's own published examples, not a
 * live response to check field names against. The request shape (location
 * + radius, check-in/out dates, guests) is well-documented and I'm
 * confident in it. The exact nesting inside a search result's
 * `accommodation` object — specifically star rating and amenities field
 * names — is a best effort. Test against a real search and compare the raw
 * JSON before trusting star ratings and amenities specifically; a wrong
 * field name there just comes back undefined/empty rather than throwing,
 * so a mapping mistake would not be obvious without looking.
 */

const DUFFEL_BASE = "https://api.duffel.com";
const DUFFEL_VERSION = "v2";

function apiKey(): string {
  const key = (env().HOTEL_API_KEY ?? "").trim();
  if (!key) {
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "HOTEL_API_KEY is not set. Check .env.",
    );
  }
  return key;
}

interface DuffelAccommodation {
  id: string;
  name: string;
  location?: {
    address?: { line_one?: string; city_name?: string; country_code?: string };
    geographic_coordinates?: { latitude: number; longitude: number };
  };
  rating?: number;
  review_score?: number;
  amenities?: { type?: string; description?: string }[];
  check_in_information?: { check_in_after_time?: string; check_out_before_time?: string };
}

interface DuffelStaysResult {
  accommodation: DuffelAccommodation;
  cheapest_rate_total_amount?: string;
  cheapest_rate_currency?: string;
}

interface DuffelStaysResponse {
  data?: { results?: DuffelStaysResult[] };
  errors?: { message?: string }[];
}

async function duffelPost<T>(
  path: string,
  body: unknown,
  key: string,
  timeoutMs = 12_000,
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

/** Cents from a Duffel decimal-string amount ("142.50"). Amounts come back
 * as strings specifically so JSON floating point never touches money. */
function toCents(amount: string | undefined): number {
  if (!amount) return 0;
  const value = Number.parseFloat(amount);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

function parseTimeOfDay(text: string | undefined, fallback: string): string {
  // check_in_after_time comes back as "HH:MM:SS" or similar; this app's
  // HotelCandidate wants a short display string like "3:00 PM".
  if (!text) return fallback;
  const [hourStr, minuteStr] = text.split(":");
  const hour = Number.parseInt(hourStr ?? "", 10);
  const minute = Number.parseInt(minuteStr ?? "0", 10);
  if (!Number.isFinite(hour)) return fallback;
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

export class DuffelHotelProvider implements HotelProvider {
  async search(query: HotelQuery): Promise<HotelCandidate[]> {
    const geocoded = await getMapsProvider().geocode(query.destination);
    if (!geocoded) return [];
    const { latitude, longitude } = geocoded.place;
    if (latitude == null || longitude == null) return [];

    const key = apiKey();
    const rooms = Math.max(1, Math.ceil(query.travelers / 2));
    const nights = Math.max(1, nightsBetween(query.dates.start, query.dates.end));

    const response = await duffelPost<DuffelStaysResponse>(
      "/stays/search",
      {
        location: {
          geographic_coordinates: { latitude, longitude },
          radius: 15,
        },
        check_in_date: query.dates.start,
        check_out_date: query.dates.end,
        guests: Array.from({ length: query.travelers }, () => ({ type: "adult" })),
        rooms,
      },
      key,
    );

    const results = response.data?.results ?? [];

    const candidates: HotelCandidate[] = results
      .map((result): HotelCandidate | null => {
        const place = result.accommodation.location;
        if (!place?.geographic_coordinates) return null;

        const nightlyTotal = toCents(result.cheapest_rate_total_amount);
        // cheapest_rate_total_amount is for the whole stay, at whatever
        // room count Duffel priced against the guest count sent above.
        const nightlyRateCents = Math.round(nightlyTotal / nights / rooms) || 0;

        return {
          providerName: "duffel",
          providerRef: result.accommodation.id,
          isMock: false,
          name: result.accommodation.name,
          description: "",
          place: {
            name: result.accommodation.name,
            kind: "HOTEL",
            address: place.address?.line_one ?? null,
            city: place.address?.city_name ?? null,
            region: null,
            country: place.address?.country_code ?? null,
            latitude: place.geographic_coordinates.latitude,
            longitude: place.geographic_coordinates.longitude,
            timezone: null,
            providerRef: result.accommodation.id,
            providerName: "duffel",
          },
          starRating: result.accommodation.rating ?? 0,
          reviewScore: result.accommodation.review_score ?? 0,
          reviewCount: 0,
          nightlyRateCents,
          totalRateCents: nightlyTotal,
          checkInTime: parseTimeOfDay(
            result.accommodation.check_in_information?.check_in_after_time,
            "3:00 PM",
          ),
          checkOutTime: parseTimeOfDay(
            result.accommodation.check_in_information?.check_out_before_time,
            "11:00 AM",
          ),
          amenities: (result.accommodation.amenities ?? [])
            .map((a) => a.description ?? a.type)
            .filter((a): a is string => !!a)
            .slice(0, 8),
          distanceToCenterMeters: 0,
        };
      })
      .filter((h): h is HotelCandidate => h !== null)
      .filter(
        (h) =>
          query.maxNightlyRateCents === undefined ||
          h.nightlyRateCents <= query.maxNightlyRateCents,
      );

    return candidates.slice(0, query.limit ?? 8);
  }
}

export function getHotelProvider(): HotelProvider {
  switch (providerMode("hotels")) {
    case "duffel":
      return new DuffelHotelProvider();
    default:
      return new MockHotelProvider();
  }
}
