import type {
  GeoPoint,
  PlaceRef,
  Sourced,
  TransportMode,
  TransportPreference,
} from "@/types/domain";

/**
 * Provider contracts.
 *
 * Every candidate carries `Sourced`, so provenance — which provider, which
 * record, and whether it is sample data — survives all the way to the screen.
 * Application logic depends on these types and never on a vendor's shape.
 */

export interface DateRange {
  /** Calendar dates, YYYY-MM-DD. */
  start: string;
  end: string;
}

export interface HotelQuery {
  destination: string;
  dates: DateRange;
  travelers: number;
  maxNightlyRateCents?: number;
  near?: GeoPoint;
  limit?: number;
}

export interface HotelCandidate extends Sourced {
  name: string;
  description: string;
  place: PlaceRef;
  starRating: number;
  reviewScore: number;
  reviewCount: number;
  nightlyRateCents: number;
  totalRateCents: number;
  checkInTime: string;
  checkOutTime: string;
  amenities: string[];
  distanceToCenterMeters: number;
}

export interface HotelProvider {
  search(query: HotelQuery): Promise<HotelCandidate[]>;
}

export interface RestaurantQuery {
  destination: string;
  near?: GeoPoint;
  cuisines?: string[];
  /** 1-4, matching the $ .. $$$$ convention. */
  maxPriceLevel?: number;
  travelers: number;
  limit?: number;
}

export interface OpeningHours {
  /** Minutes from midnight, local time. */
  opensMinute: number;
  closesMinute: number;
}

export interface RestaurantCandidate extends Sourced {
  name: string;
  description: string;
  place: PlaceRef;
  cuisines: string[];
  priceLevel: number;
  averageMealCents: number;
  reviewScore: number;
  reviewCount: number;
  hours: OpeningHours;
  reservationRequired: boolean;
}

export interface RestaurantProvider {
  search(query: RestaurantQuery): Promise<RestaurantCandidate[]>;
}

export interface ActivityQuery {
  destination: string;
  near?: GeoPoint;
  categories?: string[];
  maxPriceCents?: number;
  travelers: number;
  limit?: number;
}

export interface ActivityCandidate extends Sourced {
  name: string;
  description: string;
  place: PlaceRef;
  category: string;
  durationMinutes: number;
  priceCents: number;
  reviewScore: number;
  reviewCount: number;
  hours: OpeningHours;
  bookingRequired: boolean;
  tags: string[];
}

export interface ActivityProvider {
  search(query: ActivityQuery): Promise<ActivityCandidate[]>;
}

export interface FlightQuery {
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string;
  travelers: number;
  limit?: number;
}

export interface FlightCandidate extends Sourced {
  carrier: string;
  identifier: string;
  originCode: string;
  destinationCode: string;
  originPlace: PlaceRef;
  destinationPlace: PlaceRef;
  /** ISO datetimes. */
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  /** Total for the whole party. */
  priceCents: number;
  stops: number;
  isReturn: boolean;
}

export interface FlightProvider {
  search(query: FlightQuery): Promise<FlightCandidate[]>;
}

export interface GeocodeResult extends Sourced {
  place: PlaceRef;
}

export interface MapsProvider {
  /** Free text to a place. Null when the provider cannot resolve it. */
  geocode(query: string): Promise<GeocodeResult | null>;
  /** Named places within a destination, e.g. its airports. */
  search(destination: string, query: string): Promise<GeocodeResult[]>;
  distanceMeters(from: GeoPoint, to: GeoPoint): number;
}

export interface TransitQuery {
  /** Used to pick up local fares, transit availability and price level. */
  destination: string;
  origin: GeoPoint;
  destinationPoint: GeoPoint;
  originLabel?: string;
  destinationLabel?: string;
  /** ISO datetime the traveler wants to leave. */
  departAt?: string;
  preferences: TransportPreference[];
  travelers: number;
}

export interface TransitLeg extends Sourced {
  mode: TransportMode;
  originLabel: string;
  destinationLabel: string;
  durationMinutes: number;
  distanceMeters: number;
  /** Cost for the whole party. */
  costCents: number;
  instructions: string;
  legOrder: number;
}

export interface TransitRoute extends Sourced {
  legs: TransitLeg[];
  totalDurationMinutes: number;
  totalCostCents: number;
  totalDistanceMeters: number;
}

export interface TransitProvider {
  /** How to get from A to B. Multi-leg is the normal case. */
  route(query: TransitQuery): Promise<TransitRoute>;
}

export interface WeatherQuery {
  destination: string;
  dates: DateRange;
}

export interface WeatherDay extends Sourced {
  date: string;
  highCelsius: number;
  lowCelsius: number;
  precipitationChance: number;
  summary: string;
}

export interface WeatherProvider {
  forecast(query: WeatherQuery): Promise<WeatherDay[]>;
}
