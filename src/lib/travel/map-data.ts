import { TRANSPORT_MODE_COLOR } from "@/lib/constants";
import type { GeoPoint, ItineraryItemType, TransportMode } from "@/types/domain";
import type { ItineraryDay } from "@/types/view";

/**
 * Turns an itinerary into something a map can draw.
 *
 * Pure, and deliberately free of any mapping vendor. It produces points,
 * routes and a viewport in plain coordinates; whether those are rendered by
 * Mapbox, Google or the inline SVG fallback is decided elsewhere. Swapping
 * providers must not touch this file.
 */

/**
 * One colour per day.
 *
 * On a five-day trip, which day a stop belongs to matters more than how you
 * travelled to it — mode colour and day colour compete for the same channel,
 * and across the whole trip the day wins. Within a single day there is only
 * one colour on screen, so mode takes over.
 */
export const DAY_COLORS = [
  "#0e7c6b",
  "#a8621b",
  "#1f4fa8",
  "#6d3bb5",
  "#0a6e9b",
  "#2f7d3a",
  "#a83b22",
] as const;

export function dayColor(dayNumber: number): string {
  return DAY_COLORS[(dayNumber - 1) % DAY_COLORS.length] as string;
}

export interface MapMarker {
  id: string;
  label: string;
  /** Position in the day, 1-based, so the map can number the stops. */
  order: number;
  point: GeoPoint;
  type: ItineraryItemType;
  startTime: string;
  dayNumber: number;
  date: string;
  isMustDo: boolean;
  /** Position across the whole trip, 1-based. */
  tripOrder: number;
  color: string;
}

export interface MapRoute {
  id: string;
  /** Straight segment between two stops. Real geometry needs a live provider. */
  from: GeoPoint;
  to: GeoPoint;
  mode: TransportMode;
  color: string;
  durationMinutes: number;
  dayNumber: number;
  /** Colour of the day this route belongs to. */
  dayColor: string;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
  center: GeoPoint;
}

export interface MapData {
  markers: MapMarker[];
  routes: MapRoute[];
  bounds: MapBounds | null;
  /** Stops with no coordinates, so the UI can say what is missing. */
  unmappedCount: number;
}

function hasPoint(item: {
  latitude: number | null;
  longitude: number | null;
}): boolean {
  return item.latitude !== null && item.longitude !== null;
}

/**
 * Bounding box of everything on the map, with a margin.
 *
 * Without the margin, the outermost stops sit exactly on the edge of the
 * frame and read as cut off. A single point gets an arbitrary span, since a
 * zero-size box cannot be projected.
 */
export function computeBounds(points: GeoPoint[]): MapBounds | null {
  if (points.length === 0) return null;

  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;

  for (const point of points) {
    north = Math.max(north, point.latitude);
    south = Math.min(south, point.latitude);
    east = Math.max(east, point.longitude);
    west = Math.min(west, point.longitude);
  }

  const latSpan = north - south;
  const lngSpan = east - west;
  const latPad = latSpan === 0 ? 0.01 : latSpan * 0.12;
  const lngPad = lngSpan === 0 ? 0.01 : lngSpan * 0.12;

  return {
    north: north + latPad,
    south: south - latPad,
    east: east + lngPad,
    west: west - lngPad,
    center: {
      latitude: (north + south) / 2,
      longitude: (east + west) / 2,
    },
  };
}

/**
 * Build markers and routes for the given days.
 *
 * Routes connect consecutive mapped stops and take their colour from the mode
 * of the journey between them — the same per-mode palette the timeline uses,
 * so a subway leg is the same colour on the map as on the rail.
 */
export function buildMapData(days: ItineraryDay[]): MapData {
  const markers: MapMarker[] = [];
  const routes: MapRoute[] = [];
  let unmappedCount = 0;
  let tripOrder = 0;

  for (const day of days) {
    let order = 0;
    let previous: { point: GeoPoint; id: string } | null = null;

    for (const item of day.items) {
      if (!hasPoint(item)) {
        unmappedCount += 1;
        continue;
      }

      const point: GeoPoint = {
        latitude: item.latitude!,
        longitude: item.longitude!,
      };
      order += 1;
      tripOrder += 1;

      markers.push({
        id: item.id,
        label: item.title,
        order,
        point,
        type: item.type,
        startTime: item.startTime,
        dayNumber: day.dayNumber,
        date: day.date,
        isMustDo: item.isMustDo,
        tripOrder,
        color: dayColor(day.dayNumber),
      });

      if (previous) {
        // The dominant leg of the journey names the route: a walk to the
        // station followed by a subway ride is a subway trip.
        const legs = [...item.legs].sort(
          (a, b) => b.durationMinutes - a.durationMinutes,
        );
        const mode: TransportMode = legs[0]?.mode ?? "WALK";
        const durationMinutes = item.legs.reduce(
          (sum, leg) => sum + leg.durationMinutes,
          0,
        );

        routes.push({
          id: `${previous.id}-${item.id}`,
          from: previous.point,
          to: point,
          mode,
          color: TRANSPORT_MODE_COLOR[mode],
          durationMinutes,
          dayNumber: day.dayNumber,
          dayColor: dayColor(day.dayNumber),
        });
      }

      previous = { point, id: item.id };
    }
  }

  return {
    markers,
    routes,
    bounds: computeBounds(markers.map((marker) => marker.point)),
    unmappedCount,
  };
}

/**
 * Project a coordinate into a unit square within `bounds`.
 *
 * Web Mercator for latitude rather than a linear scale: at New York's
 * latitude a linear projection stretches north-south by about 30%, which is
 * enough to make a straight avenue look bent.
 *
 * Returns x and y in [0, 1], with y measured downward for screen space.
 */
export function project(point: GeoPoint, bounds: MapBounds): { x: number; y: number } {
  const mercator = (latitude: number): number => {
    const clamped = Math.max(-85, Math.min(85, latitude));
    const radians = (clamped * Math.PI) / 180;
    return Math.log(Math.tan(Math.PI / 4 + radians / 2));
  };

  const top = mercator(bounds.north);
  const bottom = mercator(bounds.south);
  const here = mercator(point.latitude);

  const lngSpan = bounds.east - bounds.west;
  const latSpan = top - bottom;

  return {
    x: lngSpan === 0 ? 0.5 : (point.longitude - bounds.west) / lngSpan,
    y: latSpan === 0 ? 0.5 : (top - here) / latSpan,
  };
}
