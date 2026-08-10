import type {
  ItineraryItemType,
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
