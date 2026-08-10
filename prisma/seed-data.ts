import type {
  BudgetCategory,
  ItineraryItemType,
  LocationKind,
  Priority,
  ReservationStatus,
  TransportMode,
} from "../src/types/domain";

/**
 * Seed fixture data — pure, no Prisma, no I/O.
 *
 * Kept separate from `seed.ts` so the itinerary can be unit tested. The tests
 * in `seed-data.test.ts` assert the same invariants the reality-check engine
 * will enforce in Phase 18: items are chronological, never overlap, and every
 * item is reachable from the one before it in the time available.
 *
 * A seed that quietly teleports the traveler between two boroughs would be a
 * bad fixture to build a scheduling engine against.
 *
 * Times are minutes from midnight and are materialized as UTC instants. Real
 * trips carry the destination's timezone; the fixture uses UTC so the same
 * data produces the same output on any machine.
 */

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------

export interface SeedLocation {
  name: string;
  kind: LocationKind;
  address?: string;
  city: string;
  region?: string;
  country: string;
  latitude: number;
  longitude: number;
}

/**
 * Public landmarks are named. Hotels and restaurants are described rather than
 * named, because seed data must not read as a recommendation for a real
 * business that nobody has actually checked.
 */
export const SEED_LOCATIONS = {
  clt: {
    name: "Charlotte Douglas International Airport",
    kind: "AIRPORT",
    address: "5501 Josh Birmingham Pkwy",
    city: "Charlotte",
    region: "NC",
    country: "US",
    latitude: 35.2144,
    longitude: -80.9473,
  },
  lga: {
    name: "LaGuardia Airport",
    kind: "AIRPORT",
    address: "Queens, NY 11371",
    city: "New York",
    region: "NY",
    country: "US",
    latitude: 40.7769,
    longitude: -73.874,
  },
  hotel: {
    name: "Midtown West hotel",
    kind: "HOTEL",
    address: "W 46th St",
    city: "New York",
    region: "NY",
    country: "US",
    latitude: 40.7597,
    longitude: -73.9897,
  },
  bistro: {
    name: "Hell's Kitchen bistro",
    kind: "RESTAURANT",
    city: "New York",
    region: "NY",
    country: "US",
    latitude: 40.7621,
    longitude: -73.9918,
  },
  amnh: {
    name: "American Museum of Natural History",
    kind: "ATTRACTION",
    address: "200 Central Park West",
    city: "New York",
    region: "NY",
    country: "US",
    latitude: 40.7813,
    longitude: -73.974,
  },
  centralPark: {
    name: "Central Park",
    kind: "ATTRACTION",
    city: "New York",
    region: "NY",
    country: "US",
    latitude: 40.7829,
    longitude: -73.9654,
  },
  steakhouse: {
    name: "Theater District steakhouse",
    kind: "RESTAURANT",
    city: "New York",
    region: "NY",
    country: "US",
    latitude: 40.7589,
    longitude: -73.9851,
  },
  theater: {
    name: "Broadway theater",
    kind: "ATTRACTION",
    address: "W 45th St",
    city: "New York",
    region: "NY",
    country: "US",
    latitude: 40.7579,
    longitude: -73.9874,
  },
  deli: {
    name: "Corner deli",
    kind: "RESTAURANT",
    city: "New York",
    region: "NY",
    country: "US",
    latitude: 40.7605,
    longitude: -73.9903,
  },
  battery: {
    name: "Battery Park",
    kind: "ATTRACTION",
    city: "New York",
    region: "NY",
    country: "US",
    latitude: 40.7033,
    longitude: -74.017,
  },
  liberty: {
    name: "Statue of Liberty",
    kind: "ATTRACTION",
    address: "Liberty Island",
    city: "New York",
    region: "NY",
    country: "US",
    latitude: 40.6892,
    longitude: -74.0445,
  },
  seafood: {
    name: "Lower Manhattan seafood counter",
    kind: "RESTAURANT",
    city: "New York",
    region: "NY",
    country: "US",
    latitude: 40.7061,
    longitude: -74.0087,
  },
  highLine: {
    name: "The High Line",
    kind: "ATTRACTION",
    city: "New York",
    region: "NY",
    country: "US",
    latitude: 40.748,
    longitude: -74.0048,
  },
  italian: {
    name: "Chelsea Italian restaurant",
    kind: "RESTAURANT",
    city: "New York",
    region: "NY",
    country: "US",
    latitude: 40.7465,
    longitude: -74.0014,
  },
  coffee: {
    name: "Coffee bar near the hotel",
    kind: "RESTAURANT",
    city: "New York",
    region: "NY",
    country: "US",
    latitude: 40.7592,
    longitude: -73.9889,
  },
  met: {
    name: "The Metropolitan Museum of Art",
    kind: "ATTRACTION",
    address: "1000 5th Ave",
    city: "New York",
    region: "NY",
    country: "US",
    latitude: 40.7794,
    longitude: -73.9632,
  },
  cafe: {
    name: "Upper East Side cafe",
    kind: "RESTAURANT",
    city: "New York",
    region: "NY",
    country: "US",
    latitude: 40.7736,
    longitude: -73.9601,
  },
  fifthAve: {
    name: "Fifth Avenue shops",
    kind: "OTHER",
    city: "New York",
    region: "NY",
    country: "US",
    latitude: 40.7614,
    longitude: -73.9776,
  },
  ramen: {
    name: "Midtown ramen counter",
    kind: "RESTAURANT",
    city: "New York",
    region: "NY",
    country: "US",
    latitude: 40.7566,
    longitude: -73.9865,
  },
  brunch: {
    name: "Neighborhood brunch spot",
    kind: "RESTAURANT",
    city: "New York",
    region: "NY",
    country: "US",
    latitude: 40.7611,
    longitude: -73.9925,
  },
} as const satisfies Record<string, SeedLocation>;

export type SeedLocationKey = keyof typeof SEED_LOCATIONS;

// ---------------------------------------------------------------------------
// Itinerary
// ---------------------------------------------------------------------------

export interface SeedLeg {
  mode: TransportMode;
  from: SeedLocationKey;
  to: SeedLocationKey;
  durationMinutes: number;
  costCents: number;
  distanceMeters: number;
  instructions: string;
}

export interface SeedItem {
  key: string;
  day: number;
  /** Minutes from midnight. */
  startMinute: number;
  durationMinutes: number;
  type: ItineraryItemType;
  title: string;
  description: string;
  location: SeedLocationKey;
  costCents: number;
  budgetCategory: BudgetCategory;
  reservationRequired: boolean;
  reservationStatus: ReservationStatus;
  priority: Priority;
  /** Legs that deliver the traveler to this item, in order. */
  legs: SeedLeg[];
}

const walk = (
  from: SeedLocationKey,
  to: SeedLocationKey,
  minutes: number,
  meters: number,
  instructions: string,
): SeedLeg => ({
  mode: "WALK",
  from,
  to,
  durationMinutes: minutes,
  costCents: 0,
  distanceMeters: meters,
  instructions,
});

/** Two subway fares at $2.90. */
const SUBWAY_FARE_CENTS = 580;

export const SEED_ITEMS: SeedItem[] = [
  // --- Day 1 -------------------------------------------------------------
  {
    key: "outbound-flight",
    day: 1,
    startMinute: 425,
    durationMinutes: 155,
    type: "TRAVEL",
    title: "Fly Charlotte to LaGuardia",
    description: "Nonstop, two seats together.",
    location: "clt",
    costCents: 21_400,
    budgetCategory: "TRANSPORTATION",
    reservationRequired: true,
    reservationStatus: "CONFIRMED",
    priority: "REQUIRED",
    legs: [],
  },
  {
    key: "hotel-checkin",
    day: 1,
    startMinute: 625,
    durationMinutes: 25,
    type: "LODGING",
    title: "Drop bags at the hotel",
    description: "Three nights. Room may not be ready before 3 PM.",
    location: "hotel",
    costCents: 86_700,
    budgetCategory: "LODGING",
    reservationRequired: true,
    reservationStatus: "CONFIRMED",
    priority: "REQUIRED",
    legs: [
      walk("lga", "lga", 10, 700, "Walk from the gate to the rideshare pickup."),
      {
        mode: "UBER",
        from: "lga",
        to: "hotel",
        durationMinutes: 35,
        costCents: 4_200,
        distanceMeters: 14_500,
        instructions: "Rideshare into Midtown. Longer at rush hour.",
      },
    ],
  },
  {
    key: "day1-lunch",
    day: 1,
    startMinute: 695,
    durationMinutes: 70,
    type: "RESTAURANT",
    title: "Lunch in Hell's Kitchen",
    description: "Casual, no booking needed.",
    location: "bistro",
    costCents: 8_400,
    budgetCategory: "FOOD",
    reservationRequired: false,
    reservationStatus: "NOT_REQUIRED",
    priority: "NORMAL",
    legs: [walk("hotel", "bistro", 15, 1_100, "Walk six blocks west.")],
  },
  {
    key: "day1-museum",
    day: 1,
    startMinute: 800,
    durationMinutes: 130,
    type: "SIGHTSEEING",
    title: "American Museum of Natural History",
    description: "Timed entry. Allow two hours for the main halls.",
    location: "amnh",
    costCents: 6_000,
    budgetCategory: "ACTIVITIES",
    reservationRequired: true,
    reservationStatus: "CONFIRMED",
    priority: "HIGH",
    legs: [
      walk("bistro", "bistro", 8, 600, "Walk to 50th St station."),
      {
        mode: "SUBWAY",
        from: "bistro",
        to: "amnh",
        durationMinutes: 18,
        costCents: SUBWAY_FARE_CENTS,
        distanceMeters: 4_200,
        instructions: "Take the C uptown to 81st St – Museum of Natural History.",
      },
      walk("amnh", "amnh", 6, 400, "Walk to the Central Park West entrance."),
    ],
  },
  {
    key: "day1-park",
    day: 1,
    startMinute: 945,
    durationMinutes: 75,
    type: "ACTIVITY",
    title: "Walk through Central Park",
    description: "Cross the park on foot toward the east side.",
    location: "centralPark",
    costCents: 0,
    budgetCategory: "ACTIVITIES",
    reservationRequired: false,
    reservationStatus: "NOT_REQUIRED",
    priority: "LOW",
    legs: [walk("amnh", "centralPark", 10, 750, "Walk east into the park.")],
  },
  {
    key: "day1-dinner",
    day: 1,
    startMinute: 1_050,
    durationMinutes: 75,
    type: "RESTAURANT",
    title: "Dinner before the show",
    description: "Booked early so there is time to walk to the theater.",
    location: "steakhouse",
    costCents: 16_800,
    budgetCategory: "FOOD",
    reservationRequired: true,
    reservationStatus: "CONFIRMED",
    priority: "HIGH",
    legs: [
      walk("centralPark", "centralPark", 5, 400, "Walk to 59th St station."),
      {
        mode: "SUBWAY",
        from: "centralPark",
        to: "steakhouse",
        durationMinutes: 14,
        costCents: SUBWAY_FARE_CENTS,
        distanceMeters: 3_100,
        instructions: "Take the A/C/E downtown to 42nd St.",
      },
      walk("steakhouse", "steakhouse", 7, 500, "Walk east to the restaurant."),
    ],
  },
  {
    key: "day1-show",
    day: 1,
    startMinute: 1_140,
    durationMinutes: 165,
    type: "ACTIVITY",
    title: "Broadway show",
    description: "Orchestra seats. Doors open thirty minutes before curtain.",
    location: "theater",
    costCents: 34_000,
    budgetCategory: "ACTIVITIES",
    reservationRequired: true,
    reservationStatus: "CONFIRMED",
    priority: "REQUIRED",
    legs: [walk("steakhouse", "theater", 12, 900, "Walk to the theater.")],
  },
  {
    key: "day1-return",
    day: 1,
    startMinute: 1_330,
    durationMinutes: 20,
    type: "LODGING",
    title: "Back to the hotel",
    description: "",
    location: "hotel",
    costCents: 0,
    budgetCategory: "LOCAL_TRANSPORTATION",
    reservationRequired: false,
    reservationStatus: "NOT_REQUIRED",
    priority: "LOW",
    legs: [
      walk("theater", "theater", 9, 650, "Walk to Times Sq – 42nd St."),
      {
        mode: "SUBWAY",
        from: "theater",
        to: "hotel",
        durationMinutes: 12,
        costCents: SUBWAY_FARE_CENTS,
        distanceMeters: 2_000,
        instructions: "Take the shuttle or walk if the night is warm.",
      },
    ],
  },

  // --- Day 2 -------------------------------------------------------------
  {
    key: "day2-breakfast",
    day: 2,
    startMinute: 510,
    durationMinutes: 60,
    type: "RESTAURANT",
    title: "Breakfast at the corner deli",
    description: "Quick start — the ferry line grows after ten.",
    location: "deli",
    costCents: 4_200,
    budgetCategory: "FOOD",
    reservationRequired: false,
    reservationStatus: "NOT_REQUIRED",
    priority: "NORMAL",
    legs: [walk("hotel", "deli", 5, 350, "Walk around the corner.")],
  },
  {
    key: "day2-liberty",
    day: 2,
    startMinute: 630,
    durationMinutes: 210,
    type: "EXCURSION",
    title: "Statue of Liberty and Ellis Island",
    description: "Ferry from Battery Park. Security screening before boarding.",
    location: "liberty",
    costCents: 7_800,
    budgetCategory: "ACTIVITIES",
    reservationRequired: true,
    reservationStatus: "CONFIRMED",
    priority: "REQUIRED",
    legs: [
      walk("deli", "deli", 8, 600, "Walk to 50th St station."),
      {
        mode: "SUBWAY",
        from: "deli",
        to: "battery",
        durationMinutes: 25,
        costCents: SUBWAY_FARE_CENTS,
        distanceMeters: 9_800,
        instructions: "Take the 1 downtown to South Ferry.",
      },
      walk("battery", "liberty", 10, 700, "Walk to the ferry terminal."),
    ],
  },
  {
    key: "day2-lunch",
    day: 2,
    startMinute: 870,
    durationMinutes: 60,
    type: "RESTAURANT",
    title: "Late lunch downtown",
    description: "",
    location: "seafood",
    costCents: 7_200,
    budgetCategory: "FOOD",
    reservationRequired: false,
    reservationStatus: "NOT_REQUIRED",
    priority: "NORMAL",
    legs: [walk("liberty", "seafood", 12, 900, "Walk up from the ferry.")],
  },
  {
    key: "day2-highline",
    day: 2,
    startMinute: 975,
    durationMinutes: 90,
    type: "SIGHTSEEING",
    title: "Walk the High Line",
    description: "Enter at Gansevoort St and walk north.",
    location: "highLine",
    costCents: 0,
    budgetCategory: "ACTIVITIES",
    reservationRequired: false,
    reservationStatus: "NOT_REQUIRED",
    priority: "NORMAL",
    legs: [
      {
        mode: "SUBWAY",
        from: "seafood",
        to: "highLine",
        durationMinutes: 20,
        costCents: SUBWAY_FARE_CENTS,
        distanceMeters: 5_400,
        instructions: "Take the 1 uptown to 14th St.",
      },
      walk("highLine", "highLine", 8, 550, "Walk west to the entrance."),
    ],
  },
  {
    key: "day2-dinner",
    day: 2,
    startMinute: 1_140,
    durationMinutes: 90,
    type: "RESTAURANT",
    title: "Dinner in Chelsea",
    description: "Booked for two.",
    location: "italian",
    costCents: 19_500,
    budgetCategory: "FOOD",
    reservationRequired: true,
    reservationStatus: "CONFIRMED",
    priority: "HIGH",
    legs: [walk("highLine", "italian", 10, 700, "Walk down from the High Line.")],
  },
  {
    key: "day2-return",
    day: 2,
    startMinute: 1_260,
    durationMinutes: 15,
    type: "LODGING",
    title: "Back to the hotel",
    description: "",
    location: "hotel",
    costCents: 0,
    budgetCategory: "LOCAL_TRANSPORTATION",
    reservationRequired: false,
    reservationStatus: "NOT_REQUIRED",
    priority: "LOW",
    legs: [
      {
        mode: "TAXI",
        from: "italian",
        to: "hotel",
        durationMinutes: 18,
        costCents: 3_400,
        distanceMeters: 4_100,
        instructions: "Taxi uptown. Faster than the subway at this hour.",
      },
    ],
  },

  // --- Day 3 -------------------------------------------------------------
  {
    key: "day3-breakfast",
    day: 3,
    startMinute: 480,
    durationMinutes: 45,
    type: "RESTAURANT",
    title: "Coffee and pastries",
    description: "",
    location: "coffee",
    costCents: 3_800,
    budgetCategory: "FOOD",
    reservationRequired: false,
    reservationStatus: "NOT_REQUIRED",
    priority: "NORMAL",
    legs: [walk("hotel", "coffee", 4, 300, "Walk two blocks.")],
  },
  {
    key: "day3-met",
    day: 3,
    startMinute: 570,
    durationMinutes: 150,
    type: "SIGHTSEEING",
    title: "The Metropolitan Museum of Art",
    description: "Arrive at opening. The building is larger than it looks.",
    location: "met",
    costCents: 5_600,
    budgetCategory: "ACTIVITIES",
    reservationRequired: false,
    reservationStatus: "NOT_REQUIRED",
    priority: "REQUIRED",
    legs: [
      walk("coffee", "coffee", 6, 450, "Walk to 50th St station."),
      {
        mode: "SUBWAY",
        from: "coffee",
        to: "met",
        durationMinutes: 16,
        costCents: SUBWAY_FARE_CENTS,
        distanceMeters: 4_800,
        instructions: "Take the E to Lexington, then the 6 to 77th St.",
      },
      walk("met", "met", 5, 400, "Walk west to Fifth Avenue.")
    ],
  },
  {
    key: "day3-lunch",
    day: 3,
    startMinute: 750,
    durationMinutes: 60,
    type: "RESTAURANT",
    title: "Lunch on the Upper East Side",
    description: "",
    location: "cafe",
    costCents: 6_600,
    budgetCategory: "FOOD",
    reservationRequired: false,
    reservationStatus: "NOT_REQUIRED",
    priority: "NORMAL",
    legs: [walk("met", "cafe", 9, 700, "Walk east away from the museum.")],
  },
  {
    key: "day3-park",
    day: 3,
    startMinute: 840,
    durationMinutes: 120,
    type: "ACTIVITY",
    title: "Afternoon in Central Park",
    description: "Bethesda Terrace and the Mall.",
    location: "centralPark",
    costCents: 0,
    budgetCategory: "ACTIVITIES",
    reservationRequired: false,
    reservationStatus: "NOT_REQUIRED",
    priority: "NORMAL",
    legs: [walk("cafe", "centralPark", 14, 1_000, "Walk west into the park.")],
  },
  {
    key: "day3-shopping",
    day: 3,
    startMinute: 990,
    durationMinutes: 90,
    type: "OTHER",
    title: "Fifth Avenue",
    description: "Unscheduled time. Budget line is a placeholder, not a plan.",
    location: "fifthAve",
    costCents: 12_000,
    budgetCategory: "MISCELLANEOUS",
    reservationRequired: false,
    reservationStatus: "NOT_REQUIRED",
    priority: "LOW",
    legs: [
      {
        mode: "SUBWAY",
        from: "centralPark",
        to: "fifthAve",
        durationMinutes: 15,
        costCents: SUBWAY_FARE_CENTS,
        distanceMeters: 3_000,
        instructions: "Take the N/R/W south to Fifth Ave – 59th St.",
      },
      walk("fifthAve", "fifthAve", 6, 450, "Walk south along Fifth."),
    ],
  },
  {
    key: "day3-dinner",
    day: 3,
    startMinute: 1_110,
    durationMinutes: 90,
    type: "RESTAURANT",
    title: "Last dinner in the city",
    description: "",
    location: "ramen",
    costCents: 14_200,
    budgetCategory: "FOOD",
    reservationRequired: true,
    reservationStatus: "PENDING",
    priority: "NORMAL",
    legs: [walk("fifthAve", "ramen", 11, 850, "Walk southwest into Midtown.")],
  },
  {
    key: "day3-return",
    day: 3,
    startMinute: 1_230,
    durationMinutes: 15,
    type: "LODGING",
    title: "Back to the hotel",
    description: "",
    location: "hotel",
    costCents: 0,
    budgetCategory: "LOCAL_TRANSPORTATION",
    reservationRequired: false,
    reservationStatus: "NOT_REQUIRED",
    priority: "LOW",
    legs: [
      {
        mode: "SUBWAY",
        from: "ramen",
        to: "hotel",
        durationMinutes: 13,
        costCents: SUBWAY_FARE_CENTS,
        distanceMeters: 1_900,
        instructions: "One stop, or a fifteen minute walk.",
      },
      walk("hotel", "hotel", 7, 500, "Walk the last few blocks."),
    ],
  },

  // --- Day 4 -------------------------------------------------------------
  {
    key: "day4-checkout",
    day: 4,
    startMinute: 540,
    durationMinutes: 30,
    type: "LODGING",
    title: "Check out",
    description: "Bags held at the desk until the airport run.",
    location: "hotel",
    costCents: 0,
    budgetCategory: "LODGING",
    reservationRequired: false,
    reservationStatus: "NOT_REQUIRED",
    priority: "REQUIRED",
    legs: [],
  },
  {
    key: "day4-brunch",
    day: 4,
    startMinute: 600,
    durationMinutes: 75,
    type: "RESTAURANT",
    title: "Brunch before the flight",
    description: "",
    location: "brunch",
    costCents: 9_800,
    budgetCategory: "FOOD",
    reservationRequired: false,
    reservationStatus: "NOT_REQUIRED",
    priority: "NORMAL",
    legs: [walk("hotel", "brunch", 8, 600, "Walk three blocks.")],
  },
  {
    key: "day4-airport",
    day: 4,
    startMinute: 735,
    durationMinutes: 30,
    type: "TRAVEL",
    title: "Arrive at LaGuardia",
    description: "Two hours before departure. Security is slower on Sundays.",
    location: "lga",
    costCents: 0,
    budgetCategory: "LOCAL_TRANSPORTATION",
    reservationRequired: false,
    reservationStatus: "NOT_REQUIRED",
    priority: "REQUIRED",
    legs: [
      walk("brunch", "hotel", 6, 450, "Walk back to collect the bags."),
      {
        mode: "UBER",
        from: "hotel",
        to: "lga",
        durationMinutes: 40,
        costCents: 5_200,
        distanceMeters: 14_500,
        instructions: "Rideshare to Terminal B. Allow extra for traffic.",
      },
    ],
  },
  {
    key: "return-flight",
    day: 4,
    startMinute: 870,
    durationMinutes: 145,
    type: "TRAVEL",
    title: "Fly LaGuardia to Charlotte",
    description: "Nonstop.",
    location: "lga",
    costCents: 21_400,
    budgetCategory: "TRANSPORTATION",
    reservationRequired: true,
    reservationStatus: "CONFIRMED",
    priority: "REQUIRED",
    legs: [],
  },
];

// ---------------------------------------------------------------------------
// Must-dos
// ---------------------------------------------------------------------------

export interface SeedMustDo {
  title: string;
  description: string;
  /** Item key that satisfies this must-do, when one does. */
  satisfiedBy: string | null;
}

export const SEED_MUST_DOS: SeedMustDo[] = [
  {
    title: "See a Broadway show",
    description: "Orchestra seats if they are available.",
    satisfiedBy: "day1-show",
  },
  {
    title: "Statue of Liberty",
    description: "Set foot on Liberty Island, not just the ferry past it.",
    satisfiedBy: "day2-liberty",
  },
  {
    title: "The Met",
    description: "",
    satisfiedBy: "day3-met",
  },
  {
    title: "Ride the Staten Island Ferry at sunset",
    description: "Did not fit. Kept for a future trip.",
    satisfiedBy: null,
  },
];

// ---------------------------------------------------------------------------
// Trip
// ---------------------------------------------------------------------------

export const SEED_TRIP = {
  name: "Broadway weekend",
  origin: "Charlotte, NC",
  destination: "New York City",
  travelers: 2,
  currency: "USD",
  travelMethod: "FLIGHT",
  transportationIntent: "ALREADY_BOOKED",
  notes: "Anniversary trip. Show night is the whole point of the weekend.",
  totalBudgetCents: 320_000,
  transportationBudgetCents: 50_000,
  lodgingBudgetCents: 90_000,
  foodBudgetCents: 95_000,
  activityBudgetCents: 55_000,
  localTransportationBudgetCents: 20_000,
  /** Days the trip spans, inclusive. */
  dayCount: 4,
  /** How far ahead of today the trip starts, so the seed is never stale. */
  startsInDays: 24,
  preference: {
    pace: "BALANCED",
    foodPreference: "LOCAL_FAVORITES",
    transportPreferences: ["PUBLIC_TRANSPORT_PREFERRED", "WALKING_PREFERRED"],
    interests: ["museums", "theater", "food", "walking"],
    dayStartMinute: 480,
    dayEndMinute: 1_380,
  },
} as const;

// ---------------------------------------------------------------------------
// Materialization
// ---------------------------------------------------------------------------

export interface BuiltLeg extends SeedLeg {
  legOrder: number;
  departureTime: Date;
  arrivalTime: Date;
}

export interface BuiltItem extends Omit<SeedItem, "legs"> {
  startTime: Date;
  endTime: Date;
  sortOrder: number;
  legs: BuiltLeg[];
}

export interface BuiltTrip {
  startDate: Date;
  endDate: Date;
  days: { dayNumber: number; date: Date }[];
  items: BuiltItem[];
  plannedByCategory: Record<BudgetCategory, number>;
  plannedTotalCents: number;
}

function utcMidnight(reference: Date, offsetDays: number): Date {
  return new Date(
    Date.UTC(
      reference.getUTCFullYear(),
      reference.getUTCMonth(),
      reference.getUTCDate() + offsetDays,
    ),
  );
}

/**
 * Turn the fixture into dated rows.
 *
 * Legs are laid backwards from the item they deliver to: the last leg arrives
 * exactly when the item starts, and each earlier leg ends where the next one
 * begins. That is what makes the schedule survive the reachability check —
 * departure times fall out of the arithmetic instead of being guessed.
 */
export function buildSeedTrip(reference: Date = new Date()): BuiltTrip {
  const startDate = utcMidnight(reference, SEED_TRIP.startsInDays);
  const endDate = utcMidnight(
    reference,
    SEED_TRIP.startsInDays + SEED_TRIP.dayCount - 1,
  );

  const days = Array.from({ length: SEED_TRIP.dayCount }, (_, index) => ({
    dayNumber: index + 1,
    date: utcMidnight(reference, SEED_TRIP.startsInDays + index),
  }));

  const perDayCounter = new Map<number, number>();

  const items: BuiltItem[] = SEED_ITEMS.map((item) => {
    const dayStart = utcMidnight(
      reference,
      SEED_TRIP.startsInDays + item.day - 1,
    );
    const startTime = new Date(dayStart.getTime() + item.startMinute * 60_000);
    const endTime = new Date(
      startTime.getTime() + item.durationMinutes * 60_000,
    );

    const totalLegMinutes = item.legs.reduce(
      (sum, leg) => sum + leg.durationMinutes,
      0,
    );

    let cursor = startTime.getTime() - totalLegMinutes * 60_000;
    const legs: BuiltLeg[] = item.legs.map((leg, legOrder) => {
      const departureTime = new Date(cursor);
      cursor += leg.durationMinutes * 60_000;
      return {
        ...leg,
        legOrder,
        departureTime,
        arrivalTime: new Date(cursor),
      };
    });

    const sortOrder = perDayCounter.get(item.day) ?? 0;
    perDayCounter.set(item.day, sortOrder + 1);

    const { legs: _ignored, ...rest } = item;
    return { ...rest, startTime, endTime, sortOrder, legs };
  });

  const plannedByCategory: Record<BudgetCategory, number> = {
    TRANSPORTATION: 0,
    LODGING: 0,
    FOOD: 0,
    ACTIVITIES: 0,
    LOCAL_TRANSPORTATION: 0,
    MISCELLANEOUS: 0,
  };

  for (const item of items) {
    plannedByCategory[item.budgetCategory] += item.costCents;
    for (const leg of item.legs) {
      plannedByCategory.LOCAL_TRANSPORTATION += leg.costCents;
    }
  }

  const plannedTotalCents = Object.values(plannedByCategory).reduce(
    (sum, value) => sum + value,
    0,
  );

  return { startDate, endDate, days, items, plannedByCategory, plannedTotalCents };
}
