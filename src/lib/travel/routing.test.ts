import { describe, it, expect } from "vitest";
import { planRoute } from "@/lib/travel/routing";
import { distanceMeters } from "@/lib/geo";
import type { TransitQuery } from "@/lib/providers/types";
import type { GeoPoint, TransportPreference } from "@/types/domain";

const HOTEL: GeoPoint = { latitude: 40.7597, longitude: -73.9897 }; // Midtown West
const NEARBY: GeoPoint = { latitude: 40.7621, longitude: -73.9918 }; // ~350m
const AMNH: GeoPoint = { latitude: 40.7813, longitude: -73.974 }; // ~3.3km by street
// Between the always-walk floor (1km) and the walk-preferred ceiling (3km),
// which is the band where the walking preference actually changes the answer.
const MIDWAY: GeoPoint = { latitude: 40.774, longitude: -73.984 }; // ~2.1km by street
const LIBERTY: GeoPoint = { latitude: 40.6892, longitude: -74.0445 }; // ~8.5km
const LGA: GeoPoint = { latitude: 40.7769, longitude: -73.874 }; // ~10km

function route(
  origin: GeoPoint,
  destinationPoint: GeoPoint,
  preferences: TransportPreference[] = [],
  destination = "New York City",
  travelers = 2,
) {
  const query: TransitQuery = {
    destination,
    origin,
    destinationPoint,
    originLabel: "the hotel",
    destinationLabel: "the museum",
    preferences,
    travelers,
  };
  return planRoute(query);
}

describe("route structure", () => {
  it("totals match the sum of the legs", () => {
    for (const target of [NEARBY, AMNH, LIBERTY, LGA]) {
      const result = route(HOTEL, target);
      expect(result.totalDurationMinutes).toBe(
        result.legs.reduce((sum, leg) => sum + leg.durationMinutes, 0),
      );
      expect(result.totalCostCents).toBe(
        result.legs.reduce((sum, leg) => sum + leg.costCents, 0),
      );
      expect(result.totalDistanceMeters).toBe(
        result.legs.reduce((sum, leg) => sum + leg.distanceMeters, 0),
      );
    }
  });

  it("orders legs from zero with no gaps", () => {
    const result = route(HOTEL, LIBERTY);
    expect(result.legs.map((leg) => leg.legOrder)).toEqual(
      result.legs.map((_, index) => index),
    );
  });

  it("gives every leg a positive duration", () => {
    for (const target of [NEARBY, AMNH, LIBERTY, LGA]) {
      for (const leg of route(HOTEL, target).legs) {
        expect(leg.durationMinutes).toBeGreaterThan(0);
      }
    }
  });

  it("marks everything as mock data", () => {
    const result = route(HOTEL, AMNH);
    expect(result.isMock).toBe(true);
    expect(result.legs.every((leg) => leg.isMock)).toBe(true);
  });

  it("never charges for walking", () => {
    for (const target of [NEARBY, AMNH, LIBERTY, LGA]) {
      for (const leg of route(HOTEL, target).legs) {
        if (leg.mode === "WALK") expect(leg.costCents).toBe(0);
      }
    }
  });
});

describe("mode selection", () => {
  it("walks a short hop rather than waiting for a train", () => {
    const result = route(HOTEL, NEARBY);
    expect(result.legs).toHaveLength(1);
    expect(result.legs[0]!.mode).toBe("WALK");
  });

  it("collapses a trivial distance to a single minute", () => {
    const almostSame: GeoPoint = { latitude: 40.7598, longitude: -73.9898 };
    const result = route(HOTEL, almostSame);
    expect(result.totalDurationMinutes).toBe(1);
  });

  it("produces walk, subway, walk for a cross-town trip", () => {
    const result = route(HOTEL, LIBERTY);
    expect(result.legs.map((leg) => leg.mode)).toEqual([
      "WALK",
      "SUBWAY",
      "WALK",
    ]);
  });

  it("walks further when the traveler prefers walking", () => {
    const plain = route(HOTEL, MIDWAY);
    const walker = route(HOTEL, MIDWAY, ["WALKING_PREFERRED"]);
    expect(walker.legs).toHaveLength(1);
    expect(walker.legs[0]!.mode).toBe("WALK");
    expect(plain.legs.length).toBeGreaterThan(1);
  });

  it("stops walking once the distance stops being reasonable", () => {
    // Roughly 3.3km by street: too far to walk even for someone who likes to.
    const walker = route(HOTEL, AMNH, ["WALKING_PREFERRED"]);
    expect(walker.legs.length).toBeGreaterThan(1);
  });

  it("uses rideshare when the traveler prefers it", () => {
    const result = route(HOTEL, LIBERTY, ["RIDESHARE_PREFERRED"]);
    expect(result.legs).toHaveLength(1);
    expect(result.legs[0]!.mode).toBe("UBER");
    expect(result.totalCostCents).toBeGreaterThan(0);
  });

  it("drives when the traveler has a rental car, and charges no fare", () => {
    const result = route(HOTEL, LIBERTY, ["RENTAL_CAR_PREFERRED"]);
    expect(result.legs[0]!.mode).toBe("CAR");
    expect(result.totalCostCents).toBe(0);
  });

  it("falls back to a bus in a city with no subway", () => {
    const orlandoA: GeoPoint = { latitude: 28.5384, longitude: -81.3789 };
    const orlandoB: GeoPoint = { latitude: 28.5715, longitude: -81.3609 };
    const result = route(orlandoA, orlandoB, ["PUBLIC_TRANSPORT_PREFERRED"], "Orlando");
    expect(result.legs.map((leg) => leg.mode)).toContain("BUS");
  });

  it("uses a car for a distance beyond local transit", () => {
    const farOut: GeoPoint = { latitude: 41.2, longitude: -73.9 };
    const result = route(HOTEL, farOut);
    expect(result.legs).toHaveLength(1);
    expect(["UBER", "CAR"]).toContain(result.legs[0]!.mode);
  });
});

describe("preferences", () => {
  it("cheapest picks transit over a car", () => {
    const cheap = route(HOTEL, LIBERTY, ["CHEAPEST"]);
    const ride = route(HOTEL, LIBERTY, ["RIDESHARE_PREFERRED"]);
    expect(cheap.totalCostCents).toBeLessThan(ride.totalCostCents);
  });

  it("fastest never returns a slower option than the alternative", () => {
    const fast = route(HOTEL, LIBERTY, ["FASTEST"]);
    const transit = route(HOTEL, LIBERTY, ["PUBLIC_TRANSPORT_PREFERRED"]);
    expect(fast.totalDurationMinutes).toBeLessThanOrEqual(
      transit.totalDurationMinutes,
    );
  });
});

describe("fares", () => {
  it("charges transit per traveler", () => {
    const one = route(HOTEL, LIBERTY, ["PUBLIC_TRANSPORT_PREFERRED"], "New York City", 1);
    const four = route(HOTEL, LIBERTY, ["PUBLIC_TRANSPORT_PREFERRED"], "New York City", 4);
    expect(four.totalCostCents).toBe(one.totalCostCents * 4);
  });

  it("charges rideshare per car, not per traveler", () => {
    const one = route(HOTEL, LIBERTY, ["RIDESHARE_PREFERRED"], "New York City", 1);
    const four = route(HOTEL, LIBERTY, ["RIDESHARE_PREFERRED"], "New York City", 4);
    expect(four.totalCostCents).toBe(one.totalCostCents);
  });

  it("costs more in an expensive city than a cheap one", () => {
    const nyc = route(HOTEL, LIBERTY, ["RIDESHARE_PREFERRED"], "New York City");
    const clt = route(
      { latitude: 35.2271, longitude: -80.8431 },
      { latitude: 35.2683, longitude: -81.0055 },
      ["RIDESHARE_PREFERRED"],
      "Charlotte",
    );
    // Same order of distance, cheaper city, cheaper ride per km.
    expect(nyc.totalCostCents / distanceMeters(HOTEL, LIBERTY)).toBeGreaterThan(
      clt.totalCostCents / distanceMeters(
        { latitude: 35.2271, longitude: -80.8431 },
        { latitude: 35.2683, longitude: -81.0055 },
      ),
    );
  });
});

describe("uncovered destinations", () => {
  it("still returns a usable route without inventing a subway", () => {
    const result = route(
      { latitude: 43.615, longitude: -116.2023 },
      { latitude: 43.6, longitude: -116.19 },
      [],
      "Boise",
    );
    expect(result.legs.length).toBeGreaterThan(0);
    expect(result.legs.every((leg) => leg.mode !== "SUBWAY")).toBe(true);
  });

  it("charges nothing it cannot know, and says so", () => {
    const result = route(
      { latitude: 43.615, longitude: -116.2023 },
      { latitude: 43.5, longitude: -116.0 },
      [],
      "Boise",
    );
    expect(result.totalCostCents).toBe(0);
    expect(result.legs[0]!.instructions).toMatch(/no local fare data/i);
  });
});

describe("plausibility", () => {
  it("estimates a walking pace a person could hold", () => {
    const result = route(HOTEL, NEARBY);
    const leg = result.legs[0]!;
    const metersPerMinute = leg.distanceMeters / leg.durationMinutes;
    expect(metersPerMinute).toBeGreaterThan(60);
    expect(metersPerMinute).toBeLessThan(110);
  });

  it("gets across Manhattan in a believable amount of time", () => {
    const result = route(HOTEL, LIBERTY);
    expect(result.totalDurationMinutes).toBeGreaterThan(20);
    expect(result.totalDurationMinutes).toBeLessThan(60);
  });

  it("reaches the airport in a believable amount of time", () => {
    const result = route(HOTEL, LGA, ["RIDESHARE_PREFERRED"]);
    expect(result.totalDurationMinutes).toBeGreaterThan(20);
    expect(result.totalDurationMinutes).toBeLessThan(60);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(route(HOTEL, LIBERTY))).toBe(
      JSON.stringify(route(HOTEL, LIBERTY)),
    );
  });
});
