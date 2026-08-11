import type { GeoPoint } from "@/types/domain";

/**
 * Geographic helpers.
 *
 * Everything downstream that estimates a travel time starts from a distance
 * computed here. Travel times are never hardcoded — they are distance
 * divided by a mode's speed, so changing a coordinate changes the schedule.
 */

const EARTH_RADIUS_METERS = 6_371_000;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceMeters(from: GeoPoint, to: GeoPoint): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return Math.round(2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a)));
}

/**
 * Street distance, approximated from straight-line distance.
 *
 * Nobody walks through buildings. On a grid the real path is closer to the
 * Manhattan distance, so a multiplier is applied — without it every walking
 * estimate is optimistic by roughly a fifth, which is exactly the error that
 * makes a schedule fall apart three stops in.
 */
export function streetDistanceMeters(
  from: GeoPoint,
  to: GeoPoint,
  factor = 1.25,
): number {
  return Math.round(distanceMeters(from, to) * factor);
}

/** Midpoint, used to place a mock stop between two points. */
export function midpoint(from: GeoPoint, to: GeoPoint): GeoPoint {
  return {
    latitude: (from.latitude + to.latitude) / 2,
    longitude: (from.longitude + to.longitude) / 2,
  };
}

/**
 * Offset a point by metres north and east.
 * Longitude degrees shrink with latitude, which matters as far north as
 * London: ignoring it stretches east-west distances by about 60%.
 */
export function offsetPoint(
  origin: GeoPoint,
  metersNorth: number,
  metersEast: number,
): GeoPoint {
  const latitude = origin.latitude + (metersNorth / EARTH_RADIUS_METERS) * (180 / Math.PI);
  const longitude =
    origin.longitude +
    ((metersEast / EARTH_RADIUS_METERS) * (180 / Math.PI)) /
      Math.cos(toRadians(origin.latitude));
  return { latitude, longitude };
}

/** True when both coordinates are present and inside valid ranges. */
export function isValidPoint(point: Partial<GeoPoint> | null | undefined): point is GeoPoint {
  if (!point) return false;
  const { latitude, longitude } = point;
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}
