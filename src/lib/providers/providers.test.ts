import { describe, it, expect } from "vitest";
import { MOCK_CITIES, isCovered, resolveCity } from "@/lib/providers/mock/cities";
import {
  generateActivities,
  generateHotels,
  generateRestaurants,
} from "@/lib/providers/mock/catalog";
import { MockHotelProvider } from "@/lib/providers/hotels";
import { MockRestaurantProvider } from "@/lib/providers/restaurants";
import { MockActivityProvider } from "@/lib/providers/activities";
import { MockFlightProvider } from "@/lib/providers/flights";
import { MockMapsProvider } from "@/lib/providers/maps";
import { MockWeatherProvider } from "@/lib/providers/weather";
import { distanceMeters, isValidPoint } from "@/lib/geo";

const NYC = resolveCity("New York City")!;
const DATES = { start: "2026-09-18", end: "2026-09-21" };

describe("city resolution", () => {
  it("resolves every city by its own name", () => {
    for (const city of MOCK_CITIES) {
      expect(resolveCity(city.name)?.key).toBe(city.key);
    }
  });

  it("resolves aliases and is case-insensitive", () => {
    expect(resolveCity("NYC")?.key).toBe("nyc");
    expect(resolveCity("  manhattan  ")?.key).toBe("nyc");
    expect(resolveCity("washington dc")?.key).toBe("dc");
  });

  it("resolves a destination with a trailing region", () => {
    expect(resolveCity("Chicago, IL")?.key).toBe("chicago");
    expect(resolveCity("Paris, France")?.key).toBe("paris");
  });

  it("returns null for a city with no sample data", () => {
    expect(resolveCity("Boise")).toBeNull();
    expect(resolveCity("")).toBeNull();
    expect(isCovered("Boise")).toBe(false);
  });
});

describe("city data integrity", () => {
  it("gives every city valid coordinates", () => {
    for (const city of MOCK_CITIES) {
      expect(isValidPoint(city.center)).toBe(true);
      for (const neighborhood of city.neighborhoods) {
        expect(isValidPoint(neighborhood.point)).toBe(true);
      }
      for (const landmark of city.landmarks) {
        expect(isValidPoint(landmark.point)).toBe(true);
      }
      for (const airport of city.airports) {
        expect(isValidPoint(airport.point)).toBe(true);
      }
    }
  });

  it("places neighbourhoods and landmarks near their own city", () => {
    // A stray coordinate would silently produce impossible travel times, so
    // everything must sit within a sane radius of the city centre.
    for (const city of MOCK_CITIES) {
      for (const neighborhood of city.neighborhoods) {
        expect(distanceMeters(city.center, neighborhood.point)).toBeLessThan(
          30_000,
        );
      }
      for (const landmark of city.landmarks) {
        expect(distanceMeters(city.center, landmark.point)).toBeLessThan(
          90_000,
        );
      }
    }
  });

  it("gives every landmark sane hours and duration", () => {
    for (const city of MOCK_CITIES) {
      for (const landmark of city.landmarks) {
        expect(landmark.closesMinute).toBeGreaterThan(landmark.opensMinute);
        expect(landmark.durationMinutes).toBeGreaterThan(0);
        expect(landmark.priceCents).toBeGreaterThanOrEqual(0);
        // A place you cannot finish before it closes is unschedulable.
        expect(landmark.closesMinute - landmark.opensMinute).toBeGreaterThanOrEqual(
          landmark.durationMinutes,
        );
      }
    }
  });

  it("has no duplicate city keys or aliases", () => {
    const keys = MOCK_CITIES.map((city) => city.key);
    expect(new Set(keys).size).toBe(keys.length);
    const aliases = MOCK_CITIES.flatMap((city) => city.aliases);
    expect(new Set(aliases).size).toBe(aliases.length);
  });
});

describe("catalog generation", () => {
  it("is deterministic for the same seed", () => {
    expect(JSON.stringify(generateHotels(NYC, "s"))).toBe(
      JSON.stringify(generateHotels(NYC, "s")),
    );
    expect(JSON.stringify(generateRestaurants(NYC, "s"))).toBe(
      JSON.stringify(generateRestaurants(NYC, "s")),
    );
  });

  it("varies with the seed", () => {
    expect(JSON.stringify(generateHotels(NYC, "a"))).not.toBe(
      JSON.stringify(generateHotels(NYC, "b")),
    );
  });

  it("marks everything as mock data", () => {
    for (const hotel of generateHotels(NYC, "s")) {
      expect(hotel.isMock).toBe(true);
      expect(hotel.place.isMock).toBe(true);
    }
    for (const activity of generateActivities(NYC, "s")) {
      expect(activity.isMock).toBe(true);
    }
  });

  it("prices an expensive city above a cheap one", () => {
    const nyc = generateHotels(resolveCity("New York City")!, "s");
    const clt = generateHotels(resolveCity("Charlotte")!, "s");
    const average = (list: { nightlyRateCents: number }[]) =>
      list.reduce((sum, item) => sum + item.nightlyRateCents, 0) / list.length;
    expect(average(nyc)).toBeGreaterThan(average(clt));
  });

  it("keeps generated places inside the city", () => {
    for (const city of MOCK_CITIES) {
      for (const restaurant of generateRestaurants(city, "s")) {
        const point = {
          latitude: restaurant.place.latitude!,
          longitude: restaurant.place.longitude!,
        };
        expect(distanceMeters(city.center, point)).toBeLessThan(35_000);
      }
    }
  });
});

describe("hotel provider", () => {
  it("returns nothing for an uncovered destination", async () => {
    const results = await new MockHotelProvider().search({
      destination: "Boise",
      dates: DATES,
      travelers: 2,
    });
    expect(results).toEqual([]);
  });

  it("multiplies the nightly rate by the number of nights", async () => {
    const [hotel] = await new MockHotelProvider().search({
      destination: "New York City",
      dates: DATES,
      travelers: 2,
    });
    expect(hotel!.totalRateCents).toBe(hotel!.nightlyRateCents * 3);
  });

  it("needs a second room for a party of four", async () => {
    const provider = new MockHotelProvider();
    const [two] = await provider.search({ destination: "New York City", dates: DATES, travelers: 2 });
    const [four] = await provider.search({ destination: "New York City", dates: DATES, travelers: 4 });
    expect(four!.totalRateCents).toBeGreaterThan(two!.totalRateCents);
  });

  it("respects a nightly rate ceiling", async () => {
    const results = await new MockHotelProvider().search({
      destination: "New York City",
      dates: DATES,
      travelers: 2,
      maxNightlyRateCents: 20_000,
    });
    expect(results.every((hotel) => hotel.nightlyRateCents <= 20_000)).toBe(true);
  });
});

describe("restaurant provider", () => {
  it("returns nothing for an uncovered destination", async () => {
    expect(
      await new MockRestaurantProvider().search({ destination: "Boise", travelers: 2 }),
    ).toEqual([]);
  });

  it("sorts by distance when a location is given", async () => {
    const near = NYC.neighborhoods[0]!.point;
    const results = await new MockRestaurantProvider().search({
      destination: "New York City",
      travelers: 2,
      near,
    });
    const distances = results.map((restaurant) =>
      distanceMeters(near, {
        latitude: restaurant.place.latitude!,
        longitude: restaurant.place.longitude!,
      }),
    );
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
  });

  it("does not leave the traveler with nowhere to eat when a filter matches nothing", async () => {
    const results = await new MockRestaurantProvider().search({
      destination: "New York City",
      travelers: 2,
      cuisines: ["Martian"],
    });
    expect(results.length).toBeGreaterThan(0);
  });
});

describe("activity provider", () => {
  it("builds activities from the city's real landmarks", async () => {
    const results = await new MockActivityProvider().search({
      destination: "New York City",
      travelers: 2,
    });
    const names = results.map((activity) => activity.name);
    expect(names).toContain("Central Park");
    expect(names).toContain("The Metropolitan Museum of Art");
  });

  it("respects a price ceiling", async () => {
    const results = await new MockActivityProvider().search({
      destination: "New York City",
      travelers: 2,
      maxPriceCents: 0,
    });
    expect(results.every((activity) => activity.priceCents === 0)).toBe(true);
  });
});

describe("flight provider", () => {
  it("returns outbound and return options", async () => {
    const results = await new MockFlightProvider().search({
      origin: "Charlotte",
      destination: "New York City",
      departDate: "2026-09-18",
      returnDate: "2026-09-21",
      travelers: 2,
    });
    expect(results.some((flight) => !flight.isReturn)).toBe(true);
    expect(results.some((flight) => flight.isReturn)).toBe(true);
  });

  it("arrives after it departs, by exactly its duration", async () => {
    const results = await new MockFlightProvider().search({
      origin: "Charlotte",
      destination: "New York City",
      departDate: "2026-09-18",
      travelers: 2,
    });
    for (const flight of results) {
      const elapsed =
        (Date.parse(flight.arrivalTime) - Date.parse(flight.departureTime)) /
        60_000;
      expect(elapsed).toBe(flight.durationMinutes);
    }
  });

  it("takes longer to cross an ocean than a state", async () => {
    const provider = new MockFlightProvider();
    const short = await provider.search({ origin: "Charlotte", destination: "New York City", departDate: "2026-09-18", travelers: 1 });
    const long = await provider.search({ origin: "New York City", destination: "London", departDate: "2026-09-18", travelers: 1 });
    const min = (list: { durationMinutes: number }[]) =>
      Math.min(...list.map((flight) => flight.durationMinutes));
    expect(min(long)).toBeGreaterThan(min(short) * 2);
  });

  it("charges per traveler", async () => {
    const provider = new MockFlightProvider();
    const [one] = await provider.search({ origin: "Charlotte", destination: "New York City", departDate: "2026-09-18", travelers: 1 });
    const [two] = await provider.search({ origin: "Charlotte", destination: "New York City", departDate: "2026-09-18", travelers: 2 });
    expect(two!.priceCents).toBe(one!.priceCents * 2);
  });

  it("returns nothing when origin and destination are the same city", async () => {
    expect(
      await new MockFlightProvider().search({
        origin: "New York City",
        destination: "NYC",
        departDate: "2026-09-18",
        travelers: 1,
      }),
    ).toEqual([]);
  });
});

describe("maps provider", () => {
  it("geocodes a covered city", async () => {
    const result = await new MockMapsProvider().geocode("Paris");
    expect(result?.place.city).toBe("Paris");
    expect(isValidPoint(result!.place as never)).toBe(true);
  });

  it("geocodes an airport by code", async () => {
    const result = await new MockMapsProvider().geocode("LGA");
    expect(result?.place.kind).toBe("AIRPORT");
  });

  it("returns null rather than guessing", async () => {
    expect(await new MockMapsProvider().geocode("Boise")).toBeNull();
  });

  it("finds landmarks within a destination", async () => {
    const results = await new MockMapsProvider().search("New York City", "central park");
    expect(results[0]?.place.name).toBe("Central Park");
  });
});

describe("weather provider", () => {
  it("returns one entry per day of the trip", async () => {
    const days = await new MockWeatherProvider().forecast({
      destination: "New York City",
      dates: DATES,
    });
    expect(days).toHaveLength(4);
    expect(days[0]!.date).toBe("2026-09-18");
  });

  it("keeps lows below highs", async () => {
    const days = await new MockWeatherProvider().forecast({
      destination: "London",
      dates: DATES,
    });
    for (const day of days) {
      expect(day.lowCelsius).toBeLessThan(day.highCelsius);
      expect(day.precipitationChance).toBeGreaterThanOrEqual(0);
      expect(day.precipitationChance).toBeLessThanOrEqual(100);
    }
  });

  it("is warmer in July than January in a northern city", async () => {
    const provider = new MockWeatherProvider();
    const summer = await provider.forecast({ destination: "Boston", dates: { start: "2026-07-15", end: "2026-07-18" } });
    const winter = await provider.forecast({ destination: "Boston", dates: { start: "2026-01-15", end: "2026-01-18" } });
    const avg = (days: { highCelsius: number }[]) =>
      days.reduce((sum, day) => sum + day.highCelsius, 0) / days.length;
    expect(avg(summer)).toBeGreaterThan(avg(winter));
  });

  it("returns nothing for an uncovered destination", async () => {
    expect(
      await new MockWeatherProvider().forecast({ destination: "Boise", dates: DATES }),
    ).toEqual([]);
  });
});
