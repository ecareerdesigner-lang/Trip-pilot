import type { GeoPoint } from "@/types/domain";

/**
 * Mock city data.
 *
 * SAMPLE DATA. Everything generated from this file is marked `isMock: true`
 * and labelled in the UI. It exists so the app runs, and the scheduling
 * engines can be tested, without any API keys.
 *
 * Coordinates are real. This is not decoration: every travel time in the
 * system is derived from a distance between two points, so a hotel placed at
 * invented coordinates would teach the optimizer that Manhattan is walkable
 * end to end. Landmarks are real public places; hotels and restaurants are
 * described rather than named, because sample data must not read as a
 * recommendation for a real business nobody has checked.
 */

export interface Neighborhood {
  name: string;
  point: GeoPoint;
  /** Relative cost of lodging and food here, 1.0 being the city average. */
  priceIndex: number;
}

export interface Landmark {
  name: string;
  point: GeoPoint;
  category: string;
  /** Typical visit length in minutes. */
  durationMinutes: number;
  /** Admission per person in cents. Zero for free places. */
  priceCents: number;
  bookingRequired: boolean;
  /** Minutes from midnight, local. */
  opensMinute: number;
  closesMinute: number;
}

export interface Airport {
  code: string;
  name: string;
  point: GeoPoint;
}

export interface City {
  key: string;
  name: string;
  /** Lowercased strings that should resolve to this city. */
  aliases: string[];
  region: string | null;
  country: string;
  currency: string;
  timezone: string;
  center: GeoPoint;
  /** Multiplies every generated price. New York is expensive; Orlando is not. */
  priceIndex: number;
  hasSubway: boolean;
  hasBus: boolean;
  /** Cents per ride on local transit, per traveler. */
  transitFareCents: number;
  /** Cents per kilometre for rideshare, plus the base below. */
  ridesharePerKmCents: number;
  rideshareBaseCents: number;
  airports: Airport[];
  neighborhoods: Neighborhood[];
  landmarks: Landmark[];
  /** Cuisines that make sense here, used to generate restaurants. */
  cuisines: string[];
}

const h = (hour: number, minute = 0): number => hour * 60 + minute;

export const MOCK_CITIES: City[] = [
  {
    key: "nyc",
    name: "New York City",
    aliases: ["new york", "new york city", "nyc", "manhattan", "new york, ny"],
    region: "NY",
    country: "US",
    currency: "USD",
    timezone: "America/New_York",
    center: { latitude: 40.7549, longitude: -73.984 },
    priceIndex: 1.45,
    hasSubway: true,
    hasBus: true,
    transitFareCents: 290,
    ridesharePerKmCents: 190,
    rideshareBaseCents: 850,
    airports: [
      { code: "LGA", name: "LaGuardia Airport", point: { latitude: 40.7769, longitude: -73.874 } },
      { code: "JFK", name: "John F. Kennedy International Airport", point: { latitude: 40.6413, longitude: -73.7781 } },
      { code: "EWR", name: "Newark Liberty International Airport", point: { latitude: 40.6895, longitude: -74.1745 } },
    ],
    neighborhoods: [
      { name: "Midtown West", point: { latitude: 40.7597, longitude: -73.9897 }, priceIndex: 1.15 },
      { name: "Upper West Side", point: { latitude: 40.787, longitude: -73.9754 }, priceIndex: 1.0 },
      { name: "Chelsea", point: { latitude: 40.7465, longitude: -74.0014 }, priceIndex: 1.1 },
      { name: "Lower East Side", point: { latitude: 40.715, longitude: -73.9843 }, priceIndex: 0.9 },
      { name: "Brooklyn Heights", point: { latitude: 40.6958, longitude: -73.9936 }, priceIndex: 0.85 },
      { name: "East Village", point: { latitude: 40.7265, longitude: -73.9815 }, priceIndex: 0.95 },
    ],
    landmarks: [
      { name: "The Metropolitan Museum of Art", point: { latitude: 40.7794, longitude: -73.9632 }, category: "Museum", durationMinutes: 150, priceCents: 3000, bookingRequired: false, opensMinute: h(10), closesMinute: h(17) },
      { name: "American Museum of Natural History", point: { latitude: 40.7813, longitude: -73.974 }, category: "Museum", durationMinutes: 130, priceCents: 2800, bookingRequired: true, opensMinute: h(10), closesMinute: h(17, 30) },
      { name: "Central Park", point: { latitude: 40.7829, longitude: -73.9654 }, category: "Park", durationMinutes: 90, priceCents: 0, bookingRequired: false, opensMinute: h(6), closesMinute: h(22) },
      { name: "Statue of Liberty", point: { latitude: 40.6892, longitude: -74.0445 }, category: "Landmark", durationMinutes: 210, priceCents: 2500, bookingRequired: true, opensMinute: h(9), closesMinute: h(16) },
      { name: "The High Line", point: { latitude: 40.748, longitude: -74.0048 }, category: "Park", durationMinutes: 75, priceCents: 0, bookingRequired: false, opensMinute: h(7), closesMinute: h(22) },
      { name: "Empire State Building", point: { latitude: 40.7484, longitude: -73.9857 }, category: "Observation", durationMinutes: 80, priceCents: 4400, bookingRequired: true, opensMinute: h(9), closesMinute: h(23) },
      { name: "Brooklyn Bridge", point: { latitude: 40.7061, longitude: -73.9969 }, category: "Landmark", durationMinutes: 60, priceCents: 0, bookingRequired: false, opensMinute: h(0), closesMinute: h(23, 59) },
      { name: "9/11 Memorial & Museum", point: { latitude: 40.7115, longitude: -74.0134 }, category: "Museum", durationMinutes: 120, priceCents: 3300, bookingRequired: true, opensMinute: h(9), closesMinute: h(19) },
    ],
    cuisines: ["Italian", "Japanese", "Delicatessen", "Steakhouse", "Pizza", "Korean", "Seafood", "American"],
  },
  {
    key: "charlotte",
    name: "Charlotte",
    aliases: ["charlotte", "charlotte, nc", "clt"],
    region: "NC",
    country: "US",
    currency: "USD",
    timezone: "America/New_York",
    center: { latitude: 35.2271, longitude: -80.8431 },
    priceIndex: 0.85,
    hasSubway: true,
    hasBus: true,
    transitFareCents: 220,
    ridesharePerKmCents: 130,
    rideshareBaseCents: 600,
    airports: [
      { code: "CLT", name: "Charlotte Douglas International Airport", point: { latitude: 35.2144, longitude: -80.9473 } },
    ],
    neighborhoods: [
      { name: "Uptown", point: { latitude: 35.2271, longitude: -80.8431 }, priceIndex: 1.15 },
      { name: "South End", point: { latitude: 35.2103, longitude: -80.8583 }, priceIndex: 1.05 },
      { name: "NoDa", point: { latitude: 35.2494, longitude: -80.8052 }, priceIndex: 0.9 },
      { name: "Plaza Midwood", point: { latitude: 35.2214, longitude: -80.8134 }, priceIndex: 0.9 },
      { name: "Dilworth", point: { latitude: 35.2039, longitude: -80.8506 }, priceIndex: 1.0 },
    ],
    landmarks: [
      { name: "NASCAR Hall of Fame", point: { latitude: 35.2251, longitude: -80.8416 }, category: "Museum", durationMinutes: 120, priceCents: 2500, bookingRequired: false, opensMinute: h(10), closesMinute: h(18) },
      { name: "U.S. National Whitewater Center", point: { latitude: 35.2683, longitude: -81.0055 }, category: "Outdoors", durationMinutes: 240, priceCents: 5900, bookingRequired: true, opensMinute: h(9), closesMinute: h(20) },
      { name: "Freedom Park", point: { latitude: 35.1932, longitude: -80.8383 }, category: "Park", durationMinutes: 75, priceCents: 0, bookingRequired: false, opensMinute: h(7), closesMinute: h(21) },
      { name: "Mint Museum Uptown", point: { latitude: 35.2244, longitude: -80.8444 }, category: "Museum", durationMinutes: 90, priceCents: 1500, bookingRequired: false, opensMinute: h(11), closesMinute: h(18) },
      { name: "Charlotte Rail Trail", point: { latitude: 35.2148, longitude: -80.8534 }, category: "Outdoors", durationMinutes: 60, priceCents: 0, bookingRequired: false, opensMinute: h(6), closesMinute: h(22) },
      { name: "Discovery Place Science", point: { latitude: 35.2288, longitude: -80.8397 }, category: "Museum", durationMinutes: 120, priceCents: 2400, bookingRequired: false, opensMinute: h(9), closesMinute: h(16, 30) },
    ],
    cuisines: ["Barbecue", "Southern", "American", "Mexican", "Breweries", "Seafood"],
  },
  {
    key: "chicago",
    name: "Chicago",
    aliases: ["chicago", "chicago, il", "chi"],
    region: "IL",
    country: "US",
    currency: "USD",
    timezone: "America/Chicago",
    center: { latitude: 41.8827, longitude: -87.6233 },
    priceIndex: 1.15,
    hasSubway: true,
    hasBus: true,
    transitFareCents: 250,
    ridesharePerKmCents: 150,
    rideshareBaseCents: 700,
    airports: [
      { code: "ORD", name: "O'Hare International Airport", point: { latitude: 41.9742, longitude: -87.9073 } },
      { code: "MDW", name: "Midway International Airport", point: { latitude: 41.7868, longitude: -87.7522 } },
    ],
    neighborhoods: [
      { name: "The Loop", point: { latitude: 41.8827, longitude: -87.6233 }, priceIndex: 1.15 },
      { name: "River North", point: { latitude: 41.8924, longitude: -87.6341 }, priceIndex: 1.1 },
      { name: "Lincoln Park", point: { latitude: 41.9214, longitude: -87.6513 }, priceIndex: 1.0 },
      { name: "Wicker Park", point: { latitude: 41.9088, longitude: -87.6796 }, priceIndex: 0.9 },
      { name: "Hyde Park", point: { latitude: 41.7943, longitude: -87.5907 }, priceIndex: 0.85 },
    ],
    landmarks: [
      { name: "Art Institute of Chicago", point: { latitude: 41.8796, longitude: -87.6237 }, category: "Museum", durationMinutes: 150, priceCents: 3200, bookingRequired: false, opensMinute: h(11), closesMinute: h(17) },
      { name: "Millennium Park", point: { latitude: 41.8826, longitude: -87.6226 }, category: "Park", durationMinutes: 60, priceCents: 0, bookingRequired: false, opensMinute: h(6), closesMinute: h(23) },
      { name: "Skydeck Chicago", point: { latitude: 41.8789, longitude: -87.6359 }, category: "Observation", durationMinutes: 75, priceCents: 3600, bookingRequired: true, opensMinute: h(9), closesMinute: h(22) },
      { name: "Navy Pier", point: { latitude: 41.8917, longitude: -87.6086 }, category: "Landmark", durationMinutes: 120, priceCents: 0, bookingRequired: false, opensMinute: h(10), closesMinute: h(22) },
      { name: "Field Museum", point: { latitude: 41.8663, longitude: -87.6169 }, category: "Museum", durationMinutes: 150, priceCents: 3000, bookingRequired: false, opensMinute: h(9), closesMinute: h(17) },
      { name: "Chicago Riverwalk", point: { latitude: 41.8874, longitude: -87.6276 }, category: "Outdoors", durationMinutes: 60, priceCents: 0, bookingRequired: false, opensMinute: h(6), closesMinute: h(23) },
    ],
    cuisines: ["Pizza", "Steakhouse", "Italian", "Mexican", "American", "Polish", "Seafood"],
  },
  {
    key: "dc",
    name: "Washington DC",
    aliases: ["washington", "washington dc", "washington, dc", "dc", "district of columbia"],
    region: "DC",
    country: "US",
    currency: "USD",
    timezone: "America/New_York",
    center: { latitude: 38.8951, longitude: -77.0364 },
    priceIndex: 1.2,
    hasSubway: true,
    hasBus: true,
    transitFareCents: 250,
    ridesharePerKmCents: 155,
    rideshareBaseCents: 700,
    airports: [
      { code: "DCA", name: "Ronald Reagan Washington National Airport", point: { latitude: 38.8512, longitude: -77.0402 } },
      { code: "IAD", name: "Washington Dulles International Airport", point: { latitude: 38.9531, longitude: -77.4565 } },
    ],
    neighborhoods: [
      { name: "Downtown", point: { latitude: 38.8993, longitude: -77.0287 }, priceIndex: 1.15 },
      { name: "Dupont Circle", point: { latitude: 38.9097, longitude: -77.0434 }, priceIndex: 1.1 },
      { name: "Georgetown", point: { latitude: 38.9097, longitude: -77.0654 }, priceIndex: 1.2 },
      { name: "Capitol Hill", point: { latitude: 38.8899, longitude: -76.9938 }, priceIndex: 1.0 },
      { name: "Adams Morgan", point: { latitude: 38.9215, longitude: -77.0422 }, priceIndex: 0.9 },
    ],
    landmarks: [
      { name: "National Air and Space Museum", point: { latitude: 38.8882, longitude: -77.0199 }, category: "Museum", durationMinutes: 150, priceCents: 0, bookingRequired: true, opensMinute: h(10), closesMinute: h(17, 30) },
      { name: "National Museum of Natural History", point: { latitude: 38.8913, longitude: -77.026 }, category: "Museum", durationMinutes: 130, priceCents: 0, bookingRequired: false, opensMinute: h(10), closesMinute: h(17, 30) },
      { name: "Lincoln Memorial", point: { latitude: 38.8893, longitude: -77.0502 }, category: "Landmark", durationMinutes: 45, priceCents: 0, bookingRequired: false, opensMinute: h(0), closesMinute: h(23, 59) },
      { name: "United States Capitol", point: { latitude: 38.8899, longitude: -77.0091 }, category: "Landmark", durationMinutes: 90, priceCents: 0, bookingRequired: true, opensMinute: h(8, 30), closesMinute: h(16, 30) },
      { name: "National Gallery of Art", point: { latitude: 38.8913, longitude: -77.02 }, category: "Museum", durationMinutes: 120, priceCents: 0, bookingRequired: false, opensMinute: h(10), closesMinute: h(17) },
      { name: "Arlington National Cemetery", point: { latitude: 38.8783, longitude: -77.0687 }, category: "Landmark", durationMinutes: 120, priceCents: 0, bookingRequired: false, opensMinute: h(8), closesMinute: h(17) },
    ],
    cuisines: ["American", "Ethiopian", "Seafood", "Steakhouse", "Vietnamese", "Italian"],
  },
  {
    key: "orlando",
    name: "Orlando",
    aliases: ["orlando", "orlando, fl", "mco"],
    region: "FL",
    country: "US",
    currency: "USD",
    timezone: "America/New_York",
    center: { latitude: 28.5384, longitude: -81.3789 },
    priceIndex: 0.95,
    hasSubway: false,
    hasBus: true,
    transitFareCents: 200,
    ridesharePerKmCents: 125,
    rideshareBaseCents: 600,
    airports: [
      { code: "MCO", name: "Orlando International Airport", point: { latitude: 28.4312, longitude: -81.308 } },
    ],
    neighborhoods: [
      { name: "International Drive", point: { latitude: 28.4426, longitude: -81.47 }, priceIndex: 1.0 },
      { name: "Downtown Orlando", point: { latitude: 28.5384, longitude: -81.3789 }, priceIndex: 0.95 },
      { name: "Lake Buena Vista", point: { latitude: 28.3772, longitude: -81.5178 }, priceIndex: 1.2 },
      { name: "Winter Park", point: { latitude: 28.6, longitude: -81.3392 }, priceIndex: 1.05 },
    ],
    landmarks: [
      { name: "Kennedy Space Center Visitor Complex", point: { latitude: 28.5236, longitude: -80.6819 }, category: "Museum", durationMinutes: 300, priceCents: 7500, bookingRequired: true, opensMinute: h(9), closesMinute: h(17) },
      { name: "Harry P. Leu Gardens", point: { latitude: 28.5715, longitude: -81.3609 }, category: "Park", durationMinutes: 90, priceCents: 1500, bookingRequired: false, opensMinute: h(9), closesMinute: h(17) },
      { name: "Lake Eola Park", point: { latitude: 28.5442, longitude: -81.3729 }, category: "Park", durationMinutes: 60, priceCents: 0, bookingRequired: false, opensMinute: h(6), closesMinute: h(22) },
      { name: "Orlando Science Center", point: { latitude: 28.5726, longitude: -81.3679 }, category: "Museum", durationMinutes: 150, priceCents: 2500, bookingRequired: false, opensMinute: h(10), closesMinute: h(17) },
    ],
    cuisines: ["American", "Cuban", "Seafood", "Barbecue", "Latin", "Italian"],
  },
  {
    key: "boston",
    name: "Boston",
    aliases: ["boston", "boston, ma", "bos"],
    region: "MA",
    country: "US",
    currency: "USD",
    timezone: "America/New_York",
    center: { latitude: 42.3555, longitude: -71.0565 },
    priceIndex: 1.25,
    hasSubway: true,
    hasBus: true,
    transitFareCents: 270,
    ridesharePerKmCents: 165,
    rideshareBaseCents: 750,
    airports: [
      { code: "BOS", name: "Logan International Airport", point: { latitude: 42.3656, longitude: -71.0096 } },
    ],
    neighborhoods: [
      { name: "Back Bay", point: { latitude: 42.3503, longitude: -71.0810 }, priceIndex: 1.2 },
      { name: "North End", point: { latitude: 42.3647, longitude: -71.0542 }, priceIndex: 1.05 },
      { name: "Beacon Hill", point: { latitude: 42.3588, longitude: -71.0707 }, priceIndex: 1.15 },
      { name: "Seaport", point: { latitude: 42.3519, longitude: -71.0431 }, priceIndex: 1.1 },
      { name: "Cambridge", point: { latitude: 42.3736, longitude: -71.1097 }, priceIndex: 1.0 },
    ],
    landmarks: [
      { name: "Freedom Trail", point: { latitude: 42.3575, longitude: -71.0631 }, category: "Walking tour", durationMinutes: 150, priceCents: 0, bookingRequired: false, opensMinute: h(8), closesMinute: h(19) },
      { name: "Museum of Fine Arts", point: { latitude: 42.3394, longitude: -71.0942 }, category: "Museum", durationMinutes: 150, priceCents: 2700, bookingRequired: false, opensMinute: h(10), closesMinute: h(17) },
      { name: "Fenway Park", point: { latitude: 42.3467, longitude: -71.0972 }, category: "Landmark", durationMinutes: 90, priceCents: 2500, bookingRequired: true, opensMinute: h(9), closesMinute: h(17) },
      { name: "Boston Public Garden", point: { latitude: 42.3541, longitude: -71.0704 }, category: "Park", durationMinutes: 60, priceCents: 0, bookingRequired: false, opensMinute: h(7), closesMinute: h(22) },
      { name: "New England Aquarium", point: { latitude: 42.3592, longitude: -71.0497 }, category: "Aquarium", durationMinutes: 120, priceCents: 3400, bookingRequired: true, opensMinute: h(9), closesMinute: h(17) },
      { name: "Harvard Square", point: { latitude: 42.3736, longitude: -71.1189 }, category: "Neighborhood", durationMinutes: 90, priceCents: 0, bookingRequired: false, opensMinute: h(8), closesMinute: h(22) },
    ],
    cuisines: ["Seafood", "Italian", "American", "Irish", "Pizza", "Bakery"],
  },
  {
    key: "london",
    name: "London",
    aliases: ["london", "london, uk", "london, england", "lon"],
    region: null,
    country: "GB",
    currency: "GBP",
    timezone: "Europe/London",
    center: { latitude: 51.5074, longitude: -0.1278 },
    priceIndex: 1.35,
    hasSubway: true,
    hasBus: true,
    transitFareCents: 290,
    ridesharePerKmCents: 200,
    rideshareBaseCents: 900,
    airports: [
      { code: "LHR", name: "Heathrow Airport", point: { latitude: 51.47, longitude: -0.4543 } },
      { code: "LGW", name: "Gatwick Airport", point: { latitude: 51.1537, longitude: -0.1821 } },
    ],
    neighborhoods: [
      { name: "Covent Garden", point: { latitude: 51.5117, longitude: -0.1226 }, priceIndex: 1.2 },
      { name: "South Bank", point: { latitude: 51.5058, longitude: -0.1147 }, priceIndex: 1.1 },
      { name: "Shoreditch", point: { latitude: 51.5265, longitude: -0.0781 }, priceIndex: 0.95 },
      { name: "Kensington", point: { latitude: 51.4988, longitude: -0.1749 }, priceIndex: 1.25 },
      { name: "Camden", point: { latitude: 51.5390, longitude: -0.1426 }, priceIndex: 0.9 },
    ],
    landmarks: [
      { name: "British Museum", point: { latitude: 51.5194, longitude: -0.127 }, category: "Museum", durationMinutes: 150, priceCents: 0, bookingRequired: false, opensMinute: h(10), closesMinute: h(17) },
      { name: "Tower of London", point: { latitude: 51.5081, longitude: -0.0759 }, category: "Landmark", durationMinutes: 150, priceCents: 3400, bookingRequired: true, opensMinute: h(9), closesMinute: h(17, 30) },
      { name: "Westminster Abbey", point: { latitude: 51.4994, longitude: -0.1273 }, category: "Landmark", durationMinutes: 90, priceCents: 2900, bookingRequired: true, opensMinute: h(9, 30), closesMinute: h(15, 30) },
      { name: "Tate Modern", point: { latitude: 51.5076, longitude: -0.0994 }, category: "Museum", durationMinutes: 120, priceCents: 0, bookingRequired: false, opensMinute: h(10), closesMinute: h(18) },
      { name: "Hyde Park", point: { latitude: 51.5073, longitude: -0.1657 }, category: "Park", durationMinutes: 75, priceCents: 0, bookingRequired: false, opensMinute: h(5), closesMinute: h(24 * 60 - 1) },
      { name: "Borough Market", point: { latitude: 51.5055, longitude: -0.0911 }, category: "Market", durationMinutes: 75, priceCents: 0, bookingRequired: false, opensMinute: h(10), closesMinute: h(17) },
    ],
    cuisines: ["British", "Indian", "Italian", "Pub food", "Middle Eastern", "Bakery"],
  },
  {
    key: "paris",
    name: "Paris",
    aliases: ["paris", "paris, france", "par"],
    region: null,
    country: "FR",
    currency: "EUR",
    timezone: "Europe/Paris",
    center: { latitude: 48.8566, longitude: 2.3522 },
    priceIndex: 1.3,
    hasSubway: true,
    hasBus: true,
    transitFareCents: 215,
    ridesharePerKmCents: 175,
    rideshareBaseCents: 800,
    airports: [
      { code: "CDG", name: "Charles de Gaulle Airport", point: { latitude: 49.0097, longitude: 2.5479 } },
      { code: "ORY", name: "Orly Airport", point: { latitude: 48.7233, longitude: 2.3794 } },
    ],
    neighborhoods: [
      { name: "Le Marais", point: { latitude: 48.8566, longitude: 2.3622 }, priceIndex: 1.15 },
      { name: "Saint-Germain-des-Prés", point: { latitude: 48.8539, longitude: 2.3336 }, priceIndex: 1.25 },
      { name: "Montmartre", point: { latitude: 48.8867, longitude: 2.3431 }, priceIndex: 0.95 },
      { name: "Latin Quarter", point: { latitude: 48.8462, longitude: 2.3459 }, priceIndex: 1.0 },
      { name: "Canal Saint-Martin", point: { latitude: 48.8709, longitude: 2.3661 }, priceIndex: 0.9 },
    ],
    landmarks: [
      { name: "Eiffel Tower", point: { latitude: 48.8584, longitude: 2.2945 }, category: "Landmark", durationMinutes: 120, priceCents: 2900, bookingRequired: true, opensMinute: h(9, 30), closesMinute: h(23) },
      { name: "Louvre Museum", point: { latitude: 48.8606, longitude: 2.3376 }, category: "Museum", durationMinutes: 180, priceCents: 2200, bookingRequired: true, opensMinute: h(9), closesMinute: h(18) },
      { name: "Musée d'Orsay", point: { latitude: 48.86, longitude: 2.3266 }, category: "Museum", durationMinutes: 120, priceCents: 1600, bookingRequired: true, opensMinute: h(9, 30), closesMinute: h(18) },
      { name: "Notre-Dame de Paris", point: { latitude: 48.853, longitude: 2.3499 }, category: "Landmark", durationMinutes: 60, priceCents: 0, bookingRequired: false, opensMinute: h(8), closesMinute: h(18, 45) },
      { name: "Sacré-Cœur", point: { latitude: 48.8867, longitude: 2.3431 }, category: "Landmark", durationMinutes: 75, priceCents: 0, bookingRequired: false, opensMinute: h(6, 30), closesMinute: h(22, 30) },
      { name: "Jardin du Luxembourg", point: { latitude: 48.8462, longitude: 2.3372 }, category: "Park", durationMinutes: 75, priceCents: 0, bookingRequired: false, opensMinute: h(7, 30), closesMinute: h(20, 30) },
    ],
    cuisines: ["French", "Bistro", "Bakery", "Italian", "North African", "Seafood"],
  },
];

/**
 * Resolve a free-text destination to a mock city.
 *
 * Returns null for anywhere not covered, which is deliberate. The providers
 * then return nothing and the UI says the destination is not covered by
 * sample data, rather than inventing a plausible-looking Boise.
 */
export function resolveCity(query: string): City | null {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return null;

  const direct = MOCK_CITIES.find(
    (city) => city.name.toLowerCase() === needle || city.aliases.includes(needle),
  );
  if (direct) return direct;

  // "Manhattan, NY" and "New York City, USA" should still land.
  const head = needle.split(",")[0]?.trim() ?? "";
  return (
    MOCK_CITIES.find(
      (city) => city.name.toLowerCase() === head || city.aliases.includes(head),
    ) ?? null
  );
}

export function isCovered(query: string): boolean {
  return resolveCity(query) !== null;
}

export const COVERED_CITY_NAMES = MOCK_CITIES.map((city) => city.name);
