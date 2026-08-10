# Providers

Seven external-data interfaces. **Interfaces and mocks are Phase 13; live
implementations are Phase 23.** This document is the contract they build to.

## The rule

Application logic never names a vendor. It asks a `HotelProvider` for hotels.
Whether that is Amadeus, Booking or the mock is decided in one place, by
`providerMode()` in `src/lib/env.ts`.

That function returns `mock` unless **both** the provider mode and its
credential are set. A half-configured provider cannot silently look live —
setting `HOTEL_PROVIDER=amadeus` with no `HOTEL_API_KEY` keeps mocks running
rather than failing at request time or, worse, appearing to work.

## Interfaces

| Interface | Module | Supplies |
| --- | --- | --- |
| `FlightProvider` | `lib/providers/flights.ts` | Flight options between cities on dates |
| `HotelProvider` | `lib/providers/hotels.ts` | Lodging with rates, ratings, location |
| `RestaurantProvider` | `lib/providers/restaurants.ts` | Restaurants with cuisine, price level, hours |
| `ActivityProvider` | `lib/providers/activities.ts` | Attractions and tours with duration, price, hours |
| `MapsProvider` | `lib/providers/maps.ts` | Geocoding, place search, distance, directions |
| `TransitProvider` | `lib/providers/transit.ts` | Local routing across modes |
| `WeatherProvider` | `lib/providers/weather.ts` | Forecast and seasonal normals |

Every method returns data carrying `Sourced` (`providerName`, `providerRef`,
`isMock`), so provenance survives all the way to the screen.

## Shape

Each module exports the interface, a mock implementation, and a resolver:

```ts
export interface HotelProvider {
  search(query: HotelQuery): Promise<HotelCandidate[]>;
}

export function getHotelProvider(): HotelProvider {
  switch (providerMode("hotels")) {
    case "amadeus":
      return new AmadeusHotelProvider();
    default:
      return new MockHotelProvider();
  }
}
```

Call sites use `getHotelProvider()` and nothing else.

## `TransitProvider` carries the product

This is the interface the whole premise rests on. It answers: *how do I get
from here to there, right now, given how this traveler likes to move?*

```ts
interface TransitQuery {
  origin: GeoPoint;
  destination: GeoPoint;
  departAt?: Date;
  arriveBy?: Date;
  preferences: TransportPreference[];
  travelers: number;
}

interface TransitRoute {
  legs: TransitLeg[];        // WALK → SUBWAY → WALK
  totalDurationMinutes: number;
  totalCostCents: number;
}
```

Multi-leg is the normal case, not an edge case. A subway trip is a walk, a
ride and another walk, and the two walks are where itineraries usually break.

Travel times are **never hardcoded**. They come from here, or from a mock that
is explicitly labelled as an estimate.

## Mock providers

Not throwaway. They are how the app runs with no keys, how tests stay
deterministic, and how development proceeds without burning quota.

Sample data covers: New York City, Charlotte, Chicago, Washington DC, Orlando,
Boston, London, Paris.

Requirements they must meet:

- **Realistic.** Plausible rates, durations and distances. A mock that returns
  a $40 Manhattan hotel teaches the optimizer the wrong lessons.
- **Deterministic.** Same query, same result. Seeded pseudo-randomness only.
- **Labelled.** `isMock: true` on everything, always.
- **Geographically coherent.** Mock coordinates must be real enough that
  distance calculations produce sane travel times.

## Adding a live provider

1. Implement the interface in the same module. Do not change the interface to
   suit one vendor.
2. Map the vendor's response into the shared candidate type — vendor-specific
   fields go into the `Json` payload column, not new columns.
3. Add the case to the resolver.
4. Add the credential to `.env.example` and `env.ts`.
5. Translate vendor failures into `providerUnavailable()`. Never let a raw
   vendor error reach a user.
6. Keep the mock working. It is the fallback and the test fixture.

## Failure handling

A provider being down degrades the trip; it does not break the app.

- Timeouts and 5xx → `providerUnavailable()`, logged with the provider name.
- Partial results are used. Four hotels instead of twenty still plans a trip.
- If a provider returns nothing, that section is empty and says why, rather
  than being filled with invented data.

## Cost

Provider results are persisted to the `*Option` tables per trip. Re-planning
or re-optimizing reuses stored candidates instead of re-querying, which keeps
iteration free and makes re-runs reproducible.
