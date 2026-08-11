import type {
  ItemSource,
  ItineraryItemType,
  Priority,
  ReservationStatus,
  TransportMode,
  TripStatus,
} from "@/types/domain";

/**
 * View models.
 *
 * Pages render these, never raw database rows. Dates are ISO strings so the
 * whole object crosses the server/client boundary without a serializer, and
 * money stays in cents right up to the formatting call.
 */

export interface TripSummary {
  id: string;
  name: string;
  origin: string;
  destination: string;
  /** ISO calendar date, e.g. "2026-09-18". */
  startDate: string;
  endDate: string;
  travelers: number;
  status: TripStatus;
  currency: string;
  totalBudgetCents: number | null;
  /** Sum of estimated costs currently on the itinerary. */
  plannedCents: number;
  itemCount: number;
  mustDoCount: number;
  mustDoScheduledCount: number;
}

/** One line of the route preview shown on the dashboard. */
export interface NextStop {
  id: string;
  title: string;
  type: ItineraryItemType;
  /** ISO datetime. */
  startTime: string;
  location: string | null;
  /** Present when this stop is a transportation leg rather than a destination. */
  mode: TransportMode | null;
}

export interface UpcomingItinerary {
  tripId: string;
  tripName: string;
  destination: string;
  date: string;
  stops: NextStop[];
}

export interface DashboardData {
  upcoming: TripSummary[];
  drafts: TripSummary[];
  past: TripSummary[];
  nextUp: UpcomingItinerary | null;
  totals: {
    tripsPlanned: number;
    nightsPlanned: number;
    destinations: number;
    plannedSpendCents: number;
    currency: string;
  };
  /** Where the numbers on screen came from. Surfaced to the user verbatim. */
  source: "database" | "sample";
}

/** One transportation leg as the timeline renders it. */
/** One leg of a journey, as rendered on the timeline. */
export interface TimelineLeg {
  id: string;
  mode: TransportMode;
  durationMinutes: number;
  distanceMeters: number | null;
  costCents: number;
  instructions: string;
  originLabel: string | null;
  destinationLabel: string | null;
  /** ISO datetimes. Null when the leg has not been scheduled to the minute. */
  departureTime: string | null;
  arrivalTime: string | null;
  legOrder: number;
}

export interface TimelineItem {
  id: string;
  type: ItineraryItemType;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  locationName: string | null;
  latitude: number | null;
  longitude: number | null;
  estimatedCostCents: number;
  reservationRequired: boolean;
  reservationStatus: ReservationStatus;
  priority: Priority;
  source: ItemSource;
  /** Convenience for the UI: this item exists because the traveler required it. */
  isMustDo: boolean;
  completed: boolean;
  isMock: boolean;
  /** Legs that deliver the traveler to this item, in order. */
  legs: TimelineLeg[];
}

export interface DayTotals {
  itemCount: number;
  /** Everything on the day, including the fares to move between things. */
  plannedCents: number;
  /** Minutes spent somewhere, as opposed to getting somewhere. */
  scheduledMinutes: number;
  travelMinutes: number;
  walkingMeters: number;
  /** Unclaimed minutes between the first and last commitment. Never negative. */
  openMinutes: number;
}

export interface ItineraryDay {
  id: string;
  dayNumber: number;
  /** ISO calendar date. */
  date: string;
  summary: string | null;
  items: TimelineItem[];
  totals: DayTotals;
  /** ISO datetimes of the first departure and the last thing ending. */
  startsAt: string | null;
  endsAt: string | null;
}

export interface TripItinerary {
  tripId: string;
  tripName: string;
  destination: string;
  currency: string;
  days: ItineraryDay[];
  /** False when the trip exists but has never been generated. */
  hasAnyItems: boolean;
  /** Drives the sample-data label. Never hide where the numbers came from. */
  containsMockData: boolean;
}
