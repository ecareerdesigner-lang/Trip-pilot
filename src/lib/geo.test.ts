import { describe, it, expect } from "vitest";
import {
  distanceMeters,
  isValidPoint,
  midpoint,
  offsetPoint,
  streetDistanceMeters,
} from "@/lib/geo";

const TIMES_SQUARE = { latitude: 40.758, longitude: -73.9855 };
const CENTRAL_PARK = { latitude: 40.7829, longitude: -73.9654 };
const LGA = { latitude: 40.7769, longitude: -73.874 };
const LONDON = { latitude: 51.5074, longitude: -0.1278 };

describe("distanceMeters", () => {
  it("matches known distances in Manhattan", () => {
    // Times Square to Central Park is about 3.2 km straight line.
    const meters = distanceMeters(TIMES_SQUARE, CENTRAL_PARK);
    expect(meters).toBeGreaterThan(3_000);
    expect(meters).toBeLessThan(3_500);
  });

  it("matches a known airport distance", () => {
    // Times Square to LaGuardia is roughly 9.5 km straight line.
    const meters = distanceMeters(TIMES_SQUARE, LGA);
    expect(meters).toBeGreaterThan(9_000);
    expect(meters).toBeLessThan(10_500);
  });

  it("is zero for the same point", () => {
    expect(distanceMeters(TIMES_SQUARE, TIMES_SQUARE)).toBe(0);
  });

  it("is symmetric", () => {
    expect(distanceMeters(TIMES_SQUARE, LGA)).toBe(
      distanceMeters(LGA, TIMES_SQUARE),
    );
  });

  it("handles antipodal-scale distances", () => {
    const meters = distanceMeters(TIMES_SQUARE, LONDON);
    expect(meters).toBeGreaterThan(5_500_000);
    expect(meters).toBeLessThan(5_600_000);
  });
});

describe("streetDistanceMeters", () => {
  it("is longer than the straight line", () => {
    const straight = distanceMeters(TIMES_SQUARE, CENTRAL_PARK);
    expect(streetDistanceMeters(TIMES_SQUARE, CENTRAL_PARK)).toBeGreaterThan(
      straight,
    );
  });

  it("applies the factor exactly", () => {
    const straight = distanceMeters(TIMES_SQUARE, CENTRAL_PARK);
    expect(streetDistanceMeters(TIMES_SQUARE, CENTRAL_PARK, 2)).toBe(
      straight * 2,
    );
  });
});

describe("offsetPoint", () => {
  it("moves north by the requested distance", () => {
    const moved = offsetPoint(TIMES_SQUARE, 1_000, 0);
    expect(distanceMeters(TIMES_SQUARE, moved)).toBeGreaterThan(990);
    expect(distanceMeters(TIMES_SQUARE, moved)).toBeLessThan(1_010);
  });

  it("corrects longitude for latitude", () => {
    // The same eastward offset must cover the same ground in London as in
    // New York, despite longitude degrees being narrower that far north.
    const nyMoved = offsetPoint(TIMES_SQUARE, 0, 1_000);
    const londonMoved = offsetPoint(LONDON, 0, 1_000);
    const nyDistance = distanceMeters(TIMES_SQUARE, nyMoved);
    const londonDistance = distanceMeters(LONDON, londonMoved);
    expect(Math.abs(nyDistance - londonDistance)).toBeLessThan(20);
  });
});

describe("midpoint", () => {
  it("sits roughly halfway between two points", () => {
    const mid = midpoint(TIMES_SQUARE, CENTRAL_PARK);
    const total = distanceMeters(TIMES_SQUARE, CENTRAL_PARK);
    expect(distanceMeters(TIMES_SQUARE, mid)).toBeCloseTo(total / 2, -1);
  });
});

describe("isValidPoint", () => {
  it("accepts real coordinates", () => {
    expect(isValidPoint(TIMES_SQUARE)).toBe(true);
    expect(isValidPoint({ latitude: 0, longitude: 0 })).toBe(true);
  });

  it("rejects missing, null and out-of-range values", () => {
    expect(isValidPoint(null)).toBe(false);
    expect(isValidPoint(undefined)).toBe(false);
    expect(isValidPoint({ latitude: 40 })).toBe(false);
    expect(isValidPoint({ latitude: 91, longitude: 0 })).toBe(false);
    expect(isValidPoint({ latitude: 0, longitude: 181 })).toBe(false);
    expect(isValidPoint({ latitude: Number.NaN, longitude: 0 })).toBe(false);
  });
});
