import "server-only";
import { env } from "@/lib/env";
import { AppError, providerUnavailable } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Places API (New) — Text Search, with the richer field set restaurants and
 * activities both need (price, rating, hours) that plain geocoding in
 * maps.ts does not ask for.
 *
 * These fields sit in Google's pricier "Enterprise" SKU — 1,000 free calls
 * a month rather than the 10,000 that plain geocoding gets. `editorialSummary`
 * (an even pricier "Enterprise + Atmosphere" tier) is deliberately left out;
 * descriptions here are built from the place's type instead.
 */

const SEARCH_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.priceLevel,places.rating,places.userRatingCount,places.regularOpeningHours";

export interface GooglePlaceRich {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  types?: string[];
  priceLevel?: string;
  rating?: number;
  userRatingCount?: number;
  regularOpeningHours?: {
    periods?: {
      open?: { hour: number; minute: number };
      close?: { hour: number; minute: number };
    }[];
  };
}

interface TextSearchResponse {
  places?: GooglePlaceRich[];
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

export async function searchPlacesRich(
  textQuery: string,
  timeoutMs = 10_000,
): Promise<GooglePlaceRich[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(SEARCH_ENDPOINT, {
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
      logger.error("Google Places (rich) request failed", {
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
    logger.error("Google Places (rich) request threw", {
      message: error instanceof Error ? error.message : String(error),
    });
    throw providerUnavailable("Google Places");
  } finally {
    clearTimeout(timeout);
  }
}

/** Google's PRICE_LEVEL_* enum, mapped onto this app's 1-4 ($ to $$$$) scale. */
export function priceLevelToNumber(level: string | undefined): number {
  switch (level) {
    case "PRICE_LEVEL_FREE":
    case "PRICE_LEVEL_INEXPENSIVE":
      return 1;
    case "PRICE_LEVEL_MODERATE":
      return 2;
    case "PRICE_LEVEL_EXPENSIVE":
      return 3;
    case "PRICE_LEVEL_VERY_EXPENSIVE":
      return 4;
    default:
      // Google did not return a price level for this place. 2 (moderate)
      // rather than 1 — defaulting to the cheapest tier would systematically
      // under-price everything Google has no opinion on.
      return 2;
  }
}

/**
 * A single representative open/close pair from Google's day-by-day
 * schedule. This app's OpeningHours type is one pair, not day-specific, so
 * the first period Google returns stands in for "typical hours" — a real
 * simplification, not a lookup of today's actual hours.
 */
export function extractHours(place: GooglePlaceRich): {
  opensMinute: number;
  closesMinute: number;
} {
  const period = place.regularOpeningHours?.periods?.[0];
  if (!period?.open) {
    // No hours data at all. A wide, permissive default rather than a
    // narrow guess — better to let the planner consider this place and
    // have the validator catch a real conflict than to quietly exclude it.
    return { opensMinute: 0, closesMinute: 24 * 60 - 1 };
  }
  const opensMinute = period.open.hour * 60 + period.open.minute;
  const closesMinute = period.close
    ? period.close.hour * 60 + period.close.minute
    : 24 * 60 - 1;
  return { opensMinute, closesMinute };
}
