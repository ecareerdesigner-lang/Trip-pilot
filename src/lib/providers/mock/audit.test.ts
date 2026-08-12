import { describe, it, expect } from "vitest";
import { MOCK_CITIES, resolveCity } from "@/lib/providers/mock/cities";
import {
  generateActivities,
  generateHotels,
  generateRestaurants,
} from "@/lib/providers/mock/catalog";
import { distanceMeters } from "@/lib/geo";

/**
 * Where generated places actually land.
 *
 * A map review found sample restaurants for a Manhattan trip sitting in
 * Jersey City and over the Hudson. The existing tests allowed it: they
 * checked distance from the city centre with a 35km tolerance, which is wide
 * enough to cross a state line. These assert the tight bound that matters —
 * a generated place must sit near the neighbourhood it is named after.
 */

const NYC = resolveCity("New York City")!;

/** Scatter is ±450m per axis, so 700m covers the diagonal with room to spare. */
const MAX_SCATTER_METERS = 700;

describe("generated places stay in their neighbourhood", () => {
  it("puts every restaurant within scatter range of its neighbourhood", () => {
    const offenders: string[] = [];

    for (const city of MOCK_CITIES) {
      for (const restaurant of generateRestaurants(city, "audit")) {
        const neighborhood = city.neighborhoods.find((entry) =>
          restaurant.name.includes(entry.name),
        );
        if (!neighborhood) continue;

        const away = distanceMeters(neighborhood.point, {
          latitude: restaurant.place.latitude!,
          longitude: restaurant.place.longitude!,
        });

        if (away > MAX_SCATTER_METERS) {
          offenders.push(
            `${restaurant.name} is ${Math.round(away)}m from ${neighborhood.name}`,
          );
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("puts every hotel within scatter range of its neighbourhood", () => {
    const offenders: string[] = [];

    for (const city of MOCK_CITIES) {
      for (const hotel of generateHotels(city, "audit")) {
        const neighborhood = city.neighborhoods.find((entry) =>
          hotel.name.includes(entry.name),
        );
        if (!neighborhood) continue;

        const away = distanceMeters(neighborhood.point, {
          latitude: hotel.place.latitude!,
          longitude: hotel.place.longitude!,
        });

        if (away > MAX_SCATTER_METERS) {
          offenders.push(
            `${hotel.name} is ${Math.round(away)}m from ${neighborhood.name}`,
          );
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("leaves landmarks exactly where the city data puts them", () => {
    for (const activity of generateActivities(NYC, "audit")) {
      const landmark = NYC.landmarks.find(
        (entry) => entry.name === activity.name,
      )!;
      expect(activity.place.latitude).toBe(landmark.point.latitude);
      expect(activity.place.longitude).toBe(landmark.point.longitude);
    }
  });
});

describe("New York places are actually in New York", () => {
  /**
   * A box around the five boroughs. Anything west of -74.04 at this latitude
   * is New Jersey; anything east of -73.70 is Nassau County.
   */
  const NYC_BOX = { north: 40.92, south: 40.49, east: -73.70, west: -74.04 };

  function inBox(point: { latitude: number; longitude: number }): boolean {
    return (
      point.latitude <= NYC_BOX.north &&
      point.latitude >= NYC_BOX.south &&
      point.longitude <= NYC_BOX.east &&
      point.longitude >= NYC_BOX.west
    );
  }

  it("keeps every neighbourhood inside the city", () => {
    for (const neighborhood of NYC.neighborhoods) {
      expect(inBox(neighborhood.point), `${neighborhood.name} is outside NYC`).toBe(
        true,
      );
    }
  });

  it("keeps every generated restaurant inside the city", () => {
    const strays = generateRestaurants(NYC, "audit")
      .filter(
        (restaurant) =>
          !inBox({
            latitude: restaurant.place.latitude!,
            longitude: restaurant.place.longitude!,
          }),
      )
      .map(
        (restaurant) =>
          `${restaurant.name} at ${restaurant.place.latitude}, ${restaurant.place.longitude}`,
      );

    expect(strays).toEqual([]);
  });

  it("keeps every generated hotel inside the city", () => {
    const strays = generateHotels(NYC, "audit")
      .filter(
        (hotel) =>
          !inBox({
            latitude: hotel.place.latitude!,
            longitude: hotel.place.longitude!,
          }),
      )
      .map((hotel) => `${hotel.name} at ${hotel.place.latitude}, ${hotel.place.longitude}`);

    expect(strays).toEqual([]);
  });
});

describe("generated places are distinguishable on a map", () => {
  /**
   * Two markers within a few metres of each other stack into one illegible
   * blob. The scatter is random, so collisions are possible in principle —
   * this asserts they do not happen in practice for the shipped data.
   */
  const MIN_SEPARATION_METERS = 25;

  it("keeps restaurants apart from each other", () => {
    const collisions: string[] = [];

    for (const city of MOCK_CITIES) {
      const places = generateRestaurants(city, "audit").map((entry) => ({
        name: entry.name,
        point: {
          latitude: entry.place.latitude!,
          longitude: entry.place.longitude!,
        },
      }));

      for (let i = 0; i < places.length; i += 1) {
        for (let j = i + 1; j < places.length; j += 1) {
          const apart = distanceMeters(places[i]!.point, places[j]!.point);
          if (apart < MIN_SEPARATION_METERS) {
            collisions.push(
              `${places[i]!.name} and ${places[j]!.name} are ${Math.round(apart)}m apart`,
            );
          }
        }
      }
    }

    expect(collisions).toEqual([]);
  });

  it("keeps hotels apart from each other", () => {
    const collisions: string[] = [];

    for (const city of MOCK_CITIES) {
      const places = generateHotels(city, "audit").map((entry) => ({
        name: entry.name,
        point: {
          latitude: entry.place.latitude!,
          longitude: entry.place.longitude!,
        },
      }));

      for (let i = 0; i < places.length; i += 1) {
        for (let j = i + 1; j < places.length; j += 1) {
          const apart = distanceMeters(places[i]!.point, places[j]!.point);
          if (apart < MIN_SEPARATION_METERS) {
            collisions.push(
              `${places[i]!.name} and ${places[j]!.name} are ${Math.round(apart)}m apart`,
            );
          }
        }
      }
    }

    expect(collisions).toEqual([]);
  });
});
