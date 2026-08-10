import type { DashboardData, TripSummary, UpcomingItinerary } from "@/types/view";

/**
 * SAMPLE DATA — not real trips, not live availability.
 *
 * This exists so the app is fully explorable before a database or any travel
 * provider is connected. Anything rendered from here is labelled in the UI as
 * sample data. It is never written to a database and never treated as a real
 * booking.
 */

/** Dates are generated relative to today so the dashboard is never stale. */
function isoDate(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function isoTime(offsetDays: number, hour: number, minute = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  date.setUTCHours(hour, minute, 0, 0);
  return date.toISOString();
}

const SAMPLE_TRIPS: TripSummary[] = [
  {
    id: "sample-nyc",
    name: "Broadway weekend",
    origin: "Charlotte, NC",
    destination: "New York City",
    startDate: isoDate(24),
    endDate: isoDate(27),
    travelers: 2,
    status: "READY",
    currency: "USD",
    totalBudgetCents: 300_000,
    plannedCents: 271_450,
    itemCount: 31,
    mustDoCount: 4,
    mustDoScheduledCount: 4,
  },
  {
    id: "sample-chi",
    name: "Architecture and deep dish",
    origin: "Charlotte, NC",
    destination: "Chicago",
    startDate: isoDate(63),
    endDate: isoDate(67),
    travelers: 2,
    status: "PLANNING",
    currency: "USD",
    totalBudgetCents: 240_000,
    plannedCents: 118_900,
    itemCount: 14,
    mustDoCount: 3,
    mustDoScheduledCount: 1,
  },
  {
    id: "sample-par",
    name: "Paris, first time",
    origin: "Charlotte, NC",
    destination: "Paris",
    startDate: isoDate(142),
    endDate: isoDate(150),
    travelers: 2,
    status: "DRAFT",
    currency: "USD",
    totalBudgetCents: 620_000,
    plannedCents: 0,
    itemCount: 0,
    mustDoCount: 6,
    mustDoScheduledCount: 0,
  },
  {
    id: "sample-dc",
    name: "Museums in the fall",
    origin: "Charlotte, NC",
    destination: "Washington DC",
    startDate: isoDate(-38),
    endDate: isoDate(-35),
    travelers: 4,
    status: "COMPLETED",
    currency: "USD",
    totalBudgetCents: 185_000,
    plannedCents: 176_300,
    itemCount: 22,
    mustDoCount: 3,
    mustDoScheduledCount: 3,
  },
];

/**
 * A single day of the Broadway trip, showing the thing that makes TripPilot
 * different: the walk and the subway ride are stops on the route, not
 * footnotes under the museum.
 */
const SAMPLE_NEXT_UP: UpcomingItinerary = {
  tripId: "sample-nyc",
  tripName: "Broadway weekend",
  destination: "New York City",
  date: isoDate(24),
  stops: [
    {
      id: "s1",
      title: "Charlotte Douglas (CLT) to LaGuardia (LGA)",
      type: "TRAVEL",
      startTime: isoTime(24, 7, 5),
      location: "Terminal E",
      mode: "FLIGHT",
    },
    {
      id: "s2",
      title: "Rideshare to hotel",
      type: "TRANSPORTATION",
      startTime: isoTime(24, 9, 40),
      location: "LGA Terminal B",
      mode: "UBER",
    },
    {
      id: "s3",
      title: "Drop bags at the hotel",
      type: "LODGING",
      startTime: isoTime(24, 10, 25),
      location: "Midtown West",
      mode: null,
    },
    {
      id: "s4",
      title: "Walk to lunch",
      type: "WALKING",
      startTime: isoTime(24, 11, 20),
      location: "6 blocks",
      mode: "WALK",
    },
    {
      id: "s5",
      title: "Lunch",
      type: "RESTAURANT",
      startTime: isoTime(24, 11, 35),
      location: "Hell's Kitchen",
      mode: null,
    },
    {
      id: "s6",
      title: "Subway to the museum",
      type: "TRANSPORTATION",
      startTime: isoTime(24, 12, 50),
      location: "A/C/E to 81st St",
      mode: "SUBWAY",
    },
    {
      id: "s7",
      title: "Museum visit",
      type: "SIGHTSEEING",
      startTime: isoTime(24, 13, 20),
      location: "Upper West Side",
      mode: null,
    },
  ],
};

export function sampleDashboardData(): DashboardData {
  const today = isoDate(0);
  const upcoming = SAMPLE_TRIPS.filter(
    (trip) =>
      trip.endDate >= today &&
      (trip.status === "READY" || trip.status === "PLANNING"),
  );
  const drafts = SAMPLE_TRIPS.filter((trip) => trip.status === "DRAFT");
  const past = SAMPLE_TRIPS.filter(
    (trip) => trip.status === "COMPLETED" || trip.status === "ARCHIVED",
  );

  const nights = SAMPLE_TRIPS.reduce((total, trip) => {
    const start = Date.parse(`${trip.startDate}T00:00:00Z`);
    const end = Date.parse(`${trip.endDate}T00:00:00Z`);
    return total + Math.round((end - start) / 86_400_000);
  }, 0);

  return {
    upcoming,
    drafts,
    past,
    nextUp: SAMPLE_NEXT_UP,
    totals: {
      tripsPlanned: SAMPLE_TRIPS.length,
      nightsPlanned: nights,
      destinations: new Set(SAMPLE_TRIPS.map((trip) => trip.destination)).size,
      plannedSpendCents: SAMPLE_TRIPS.reduce(
        (total, trip) => total + trip.plannedCents,
        0,
      ),
      currency: "USD",
    },
    source: "sample",
  };
}

export function sampleTrips(): TripSummary[] {
  return SAMPLE_TRIPS;
}
