/**
 * Domain enums and shared types.
 *
 * These deliberately mirror `prisma/schema.prisma` by hand instead of
 * re-exporting from `@prisma/client`. Two reasons:
 *
 *  1. The UI layer and the pure planning engines (validation, optimization,
 *     budgeting) can be compiled, tested and reasoned about without a
 *     generated Prisma client or a database.
 *  2. `@prisma/client` is a server-only package; importing its types into
 *     client components drags server code toward the browser bundle.
 *
 * `src/lib/schema-parity.test.ts` asserts these stay in sync with the
 * Prisma schema file, so drift fails the test run rather than production.
 */

export const TRIP_STATUSES = [
  "DRAFT",
  "PLANNING",
  "READY",
  "COMPLETED",
  "ARCHIVED",
] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export const ITINERARY_ITEM_TYPES = [
  "TRAVEL",
  "LODGING",
  "RESTAURANT",
  "ACTIVITY",
  "EXCURSION",
  "SIGHTSEEING",
  "TRANSPORTATION",
  "WALKING",
  "FREE_TIME",
  "OTHER",
] as const;
export type ItineraryItemType = (typeof ITINERARY_ITEM_TYPES)[number];

export const TRANSPORT_MODES = [
  "WALK",
  "SUBWAY",
  "BUS",
  "TRAIN",
  "TAXI",
  "UBER",
  "LYFT",
  "CAR",
  "FLIGHT",
  "FERRY",
  "BIKE",
  "OTHER",
] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

export const TRAVEL_METHODS = [
  "FLIGHT",
  "DRIVING",
  "TRAIN",
  "BUS",
  "CRUISE",
  "OTHER",
] as const;
export type TravelMethod = (typeof TRAVEL_METHODS)[number];

export const TRANSPORTATION_INTENTS = [
  "SEARCH",
  "ALREADY_BOOKED",
  "RECOMMEND",
] as const;
export type TransportationIntent = (typeof TRANSPORTATION_INTENTS)[number];

export const RESERVATION_STATUSES = [
  "NOT_REQUIRED",
  "NEEDED",
  "PENDING",
  "CONFIRMED",
  "CANCELLED",
  "FAILED",
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const RESERVATION_CATEGORIES = ["FLIGHT", "HOTEL", "OTHER"] as const;
export type ReservationCategory = (typeof RESERVATION_CATEGORIES)[number];

export const BUDGET_CATEGORIES = [
  "TRANSPORTATION",
  "LODGING",
  "FOOD",
  "ACTIVITIES",
  "LOCAL_TRANSPORTATION",
  "MISCELLANEOUS",
] as const;
export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number];

export const PACES = ["RELAXED", "BALANCED", "PACKED"] as const;
export type Pace = (typeof PACES)[number];

export const FOOD_PREFERENCES = [
  "NO_PREFERENCE",
  "CASUAL",
  "FINE_DINING",
  "LOCAL_FAVORITES",
  "BUDGET_FRIENDLY",
] as const;
export type FoodPreference = (typeof FOOD_PREFERENCES)[number];

export const TRANSPORT_PREFERENCES = [
  "WALKING_PREFERRED",
  "PUBLIC_TRANSPORT_PREFERRED",
  "RIDESHARE_PREFERRED",
  "RENTAL_CAR_PREFERRED",
  "CHEAPEST",
  "FASTEST",
] as const;
export type TransportPreference = (typeof TRANSPORT_PREFERENCES)[number];

export const ITEM_SOURCES = [
  "MUST_DO",
  "AI_SUGGESTION",
  "PROVIDER",
  "USER",
  "SYSTEM",
] as const;
export type ItemSource = (typeof ITEM_SOURCES)[number];

export const PRIORITIES = ["REQUIRED", "HIGH", "NORMAL", "LOW"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const MUST_DO_STATUSES = [
  "UNSCHEDULED",
  "SCHEDULED",
  "COMPLETED",
  "DROPPED",
] as const;
export type MustDoStatus = (typeof MUST_DO_STATUSES)[number];

export const LOCATION_KINDS = [
  "ADDRESS",
  "CITY",
  "AIRPORT",
  "TRAIN_STATION",
  "BUS_STATION",
  "TRANSIT_STOP",
  "HOTEL",
  "RESTAURANT",
  "ATTRACTION",
  "PORT",
  "OTHER",
] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

export const TRAVEL_DOCUMENT_TYPES = [
  "PASSPORT",
  "VISA",
  "BOARDING_PASS",
  "HOTEL_CONFIRMATION",
  "RENTAL_AGREEMENT",
  "TICKET",
  "INSURANCE",
  "VACCINATION",
  "OTHER",
] as const;
export type TravelDocumentType = (typeof TRAVEL_DOCUMENT_TYPES)[number];

/** Severity levels returned by the reality-check engine. */
export const VALIDATION_SEVERITIES = ["ERROR", "WARNING", "INFO"] as const;
export type ValidationSeverity = (typeof VALIDATION_SEVERITIES)[number];

/** A geographic point. Kept structural so engines never import Prisma. */
export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface PlaceRef {
  id?: string;
  name: string;
  kind?: LocationKind;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string | null;
  providerName?: string | null;
  providerRef?: string | null;
  isMock?: boolean;
}

/** Marks any provider payload so the UI can label sample data honestly. */
export interface Sourced {
  providerName: string;
  providerRef?: string | null;
  isMock: boolean;
}
