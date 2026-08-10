import type {
  BudgetCategory,
  FoodPreference,
  ItineraryItemType,
  Pace,
  ReservationStatus,
  TransportMode,
  TransportPreference,
  TransportationIntent,
  TravelMethod,
  TripStatus,
} from "@/types/domain";

/**
 * Human-facing labels and visual tokens for domain enums.
 *
 * The UI never prints a raw enum. Every label here is written from the
 * traveler's side of the screen: "Ready to go", not "READY".
 */

export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
  DRAFT: "Draft",
  PLANNING: "Planning",
  READY: "Ready to go",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

export const ITEM_TYPE_LABEL: Record<ItineraryItemType, string> = {
  TRAVEL: "Travel",
  LODGING: "Lodging",
  RESTAURANT: "Meal",
  ACTIVITY: "Activity",
  EXCURSION: "Excursion",
  SIGHTSEEING: "Sightseeing",
  TRANSPORTATION: "Getting there",
  WALKING: "Walk",
  FREE_TIME: "Free time",
  OTHER: "Other",
};

export const TRANSPORT_MODE_LABEL: Record<TransportMode, string> = {
  WALK: "Walk",
  SUBWAY: "Subway",
  BUS: "Bus",
  TRAIN: "Train",
  TAXI: "Taxi",
  UBER: "Uber",
  LYFT: "Lyft",
  CAR: "Drive",
  FLIGHT: "Flight",
  FERRY: "Ferry",
  BIKE: "Bike",
  OTHER: "Other",
};

/**
 * Each mode owns a line colour, the way a transit map gives every line its
 * own identity. The itinerary timeline is drawn as a route, so the colour is
 * information, not decoration.
 */
export const TRANSPORT_MODE_COLOR: Record<TransportMode, string> = {
  WALK: "var(--mode-walk)",
  SUBWAY: "var(--mode-subway)",
  BUS: "var(--mode-bus)",
  TRAIN: "var(--mode-train)",
  TAXI: "var(--mode-taxi)",
  UBER: "var(--mode-uber)",
  LYFT: "var(--mode-lyft)",
  CAR: "var(--mode-car)",
  FLIGHT: "var(--mode-flight)",
  FERRY: "var(--mode-ferry)",
  BIKE: "var(--mode-bike)",
  OTHER: "var(--mode-other)",
};

export const TRAVEL_METHOD_LABEL: Record<TravelMethod, string> = {
  FLIGHT: "Fly",
  DRIVING: "Drive",
  TRAIN: "Train",
  BUS: "Bus",
  CRUISE: "Cruise",
  OTHER: "Something else",
};

export const TRANSPORTATION_INTENT_LABEL: Record<
  TransportationIntent,
  string
> = {
  SEARCH: "Search for options",
  ALREADY_BOOKED: "I already booked this",
  RECOMMEND: "Recommend what fits",
};

export const BUDGET_CATEGORY_LABEL: Record<BudgetCategory, string> = {
  TRANSPORTATION: "Getting there",
  LODGING: "Lodging",
  FOOD: "Food",
  ACTIVITIES: "Activities",
  LOCAL_TRANSPORTATION: "Getting around",
  MISCELLANEOUS: "Everything else",
};

/**
 * Default split used when a traveler gives a total budget but no category
 * amounts. Weights, not percentages — `allocateCents` normalizes them and
 * preserves the exact total.
 */
export const DEFAULT_BUDGET_WEIGHTS: Record<BudgetCategory, number> = {
  TRANSPORTATION: 30,
  LODGING: 30,
  FOOD: 18,
  ACTIVITIES: 12,
  LOCAL_TRANSPORTATION: 6,
  MISCELLANEOUS: 4,
};

export const PACE_LABEL: Record<Pace, string> = {
  RELAXED: "Relaxed",
  BALANCED: "Balanced",
  PACKED: "Packed",
};

export const PACE_DESCRIPTION: Record<Pace, string> = {
  RELAXED: "Two or three things a day, with room to linger.",
  BALANCED: "A full day that still leaves time to sit down.",
  PACKED: "See as much as the hours allow.",
};

/** Activities per day the optimizer targets for each pace. */
export const PACE_ACTIVITY_TARGET: Record<Pace, number> = {
  RELAXED: 2,
  BALANCED: 4,
  PACKED: 6,
};

/** Minutes of slack the validator wants between consecutive commitments. */
export const PACE_BUFFER_MINUTES: Record<Pace, number> = {
  RELAXED: 45,
  BALANCED: 25,
  PACKED: 10,
};

export const FOOD_PREFERENCE_LABEL: Record<FoodPreference, string> = {
  NO_PREFERENCE: "No preference",
  CASUAL: "Casual",
  FINE_DINING: "Fine dining",
  LOCAL_FAVORITES: "Local favorites",
  BUDGET_FRIENDLY: "Budget friendly",
};

export const TRANSPORT_PREFERENCE_LABEL: Record<TransportPreference, string> = {
  WALKING_PREFERRED: "Walk when I can",
  PUBLIC_TRANSPORT_PREFERRED: "Public transportation",
  RIDESHARE_PREFERRED: "Rideshare",
  RENTAL_CAR_PREFERRED: "Rental car",
  CHEAPEST: "Cheapest option",
  FASTEST: "Fastest option",
};

export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  NOT_REQUIRED: "No booking needed",
  NEEDED: "Booking needed",
  PENDING: "Waiting on confirmation",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
  FAILED: "Booking failed",
};

/** Cities that ship with sample provider data. */
export const MOCK_CITIES = [
  "New York City",
  "Charlotte",
  "Chicago",
  "Washington DC",
  "Orlando",
  "Boston",
  "London",
  "Paris",
] as const;
export type MockCity = (typeof MOCK_CITIES)[number];
