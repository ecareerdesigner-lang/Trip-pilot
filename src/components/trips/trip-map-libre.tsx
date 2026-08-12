"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  Marker,
  Popup,
  NavigationControl,
  type GeoJSONSource,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { cn } from "@/lib/cn";
import { ITEM_TYPE_LABEL, TRANSPORT_MODE_LABEL } from "@/lib/constants";
import { formatDuration, formatTime } from "@/lib/format";
import { buildMapData, dayColor, type MapMarker } from "@/lib/travel/map-data";
import type { ItineraryDay } from "@/types/view";

/**
 * The trip map.
 *
 * OpenStreetMap raster tiles, no key required. MapLibre is used directly
 * rather than through a React wrapper: a map is an imperative object with its
 * own lifecycle, and pretending otherwise means fighting a layer every time a
 * source needs updating.
 *
 * Colour carries the day, not the mode, when the whole trip is shown. On a
 * five-day trip "which day is this" matters more than "did I walk or ride",
 * and both cannot own the same channel. Filtering to one day puts mode back
 * in charge, since there is only one day's colour on screen.
 *
 * Nothing vendor-specific reaches `map-data.ts`. Swapping these tiles for
 * Mapbox vector tiles is a change to `TILE_STYLE` alone.
 */

const TILE_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: "osm",
      type: "raster" as const,
      source: "osm",
      // Muted so routes and stops stay the loudest thing on screen. The
      // basemap is context, not the subject.
      paint: { "raster-saturation": -0.5, "raster-brightness-max": 0.92 },
    },
  ],
};

const EMPTY = { type: "FeatureCollection" as const, features: [] };

export function TripMapLibre({
  days,
  destination,
}: {
  days: ItineraryDay[];
  destination: string;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markerObjects = useRef<Marker[]>([]);

  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  /**
   * Memoized on the inputs that actually change.
   *
   * Without this, `buildMapData` produced a fresh array on every render, the
   * effects below re-fired continuously, and the route layers were added and
   * torn down faster than the tiles could draw them — which is why the first
   * version showed markers and no lines.
   */
  const all = useMemo(() => buildMapData(days), [days]);

  const visibleDays = useMemo(
    () =>
      selectedDay === null
        ? days
        : days.filter((day) => day.dayNumber === selectedDay),
    [days, selectedDay],
  );
  const shown = useMemo(() => buildMapData(visibleDays), [visibleDays]);

  const routeData = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: shown.routes.map((route) => ({
        type: "Feature" as const,
        properties: {
          // One day on screen: colour by mode. Several: colour by day.
          color: selectedDay === null ? route.dayColor : route.color,
          dashed: route.mode === "WALK",
        },
        geometry: {
          type: "LineString" as const,
          coordinates: [
            [route.from.longitude, route.from.latitude],
            [route.to.longitude, route.to.latitude],
          ],
        },
      })),
    }),
    [shown.routes, selectedDay],
  );

  const bounds = shown.bounds ?? all.bounds;

  // --- Create the map once ------------------------------------------------
  useEffect(() => {
    if (!container.current || map.current || !all.bounds) return;

    let instance: MapLibreMap;
    try {
      instance = new MapLibreMap({
        container: container.current,
        style: TILE_STYLE,
        center: [all.bounds.center.longitude, all.bounds.center.latitude],
        zoom: 12,
        attributionControl: { compact: true },
      });
    } catch {
      const timer = setTimeout(() => setFailed(true), 0);
      return () => clearTimeout(timer);
    }

    instance.addControl(new NavigationControl({ showCompass: false }), "top-right");

    instance.on("load", () => {
      // Source and layers are created once, here, where the style is known to
      // be ready. Everything after this only calls setData.
      instance.addSource("routes", { type: "geojson", data: EMPTY });

      instance.addLayer({
        id: "routes-solid",
        type: "line",
        source: "routes",
        filter: ["==", ["get", "dashed"], false],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          // `["get", "color"]` alone yields a string, which MapLibre cannot
          // use as paint and silently falls back to black. `to-color` is what
          // makes a data-driven colour actually apply.
          "line-color": ["to-color", ["get", "color"]],
          "line-width": 4,
          "line-opacity": 0.9,
        },
      });

      // Walking is dashed, the way a transit map distinguishes it from a ride.
      instance.addLayer({
        id: "routes-dashed",
        type: "line",
        source: "routes",
        filter: ["==", ["get", "dashed"], true],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["to-color", ["get", "color"]],
          "line-width": 3,
          "line-opacity": 0.85,
          "line-dasharray": [1, 2],
        },
      });

      setReady(true);
    });

    instance.on("error", () => setFailed(true));
    map.current = instance;

    return () => {
      instance.remove();
      map.current = null;
      setReady(false);
    };
    // Created once; data updates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Routes -------------------------------------------------------------
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;

    const source = instance.getSource("routes") as GeoJSONSource | undefined;
    source?.setData(routeData);
  }, [ready, routeData]);

  // --- Markers ------------------------------------------------------------
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;

    for (const marker of markerObjects.current) marker.remove();
    markerObjects.current = [];

    for (const stop of shown.markers) {
      // Numbering continues across the trip when every day is shown, and
      // restarts per day when one is. Repeated 2s and 3s on a whole-trip view
      // read as a bug even though each was correct within its own day.
      const label = selectedDay === null ? stop.tripOrder : stop.order;

      const element = document.createElement("button");
      element.type = "button";
      element.setAttribute("aria-label", `${label}. ${stop.label}`);
      element.textContent = String(label);
      element.style.cssText = [
        "width:26px",
        "height:26px",
        "border-radius:999px",
        "background:#ffffff",
        `border:${stop.isMustDo ? 3 : 2}px solid ${stop.color}`,
        "color:#0d1b24",
        "font-size:12px",
        "font-weight:600",
        "font-variant-numeric:tabular-nums",
        "cursor:pointer",
        "box-shadow:0 1px 5px rgba(13,27,36,0.35)",
      ].join(";");

      const marker = new Marker({ element })
        .setLngLat([stop.point.longitude, stop.point.latitude])
        .setPopup(new Popup({ offset: 18, closeButton: false }).setHTML(
          popupHtml(stop, label),
        ))
        .addTo(instance);

      markerObjects.current.push(marker);
    }
  }, [ready, shown.markers, selectedDay]);

  // --- Framing ------------------------------------------------------------
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready || !bounds) return;

    // `map-data` already pads the box, so the padding here is only enough to
    // keep markers off the chrome. Adding a generous second margin is what
    // zoomed a Manhattan trip out far enough to include Secaucus.
    instance.fitBounds(
      [
        [bounds.west, bounds.south],
        [bounds.east, bounds.north],
      ],
      { padding: 48, maxZoom: 15.5, duration: 550 },
    );
  }, [ready, bounds]);

  const reset = useCallback(() => setSelectedDay(null), []);

  if (!all.bounds || all.markers.length === 0) {
    return (
      <div className="rounded-card border border-line bg-card px-6 py-12 text-center">
        <p className="text-sm text-muted">
          Nothing on this trip has coordinates yet, so there is nothing to map.
        </p>
      </div>
    );
  }

  const daysWithStops = days.filter((day) =>
    day.items.some((item) => item.latitude !== null),
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <DayButton active={selectedDay === null} onClick={reset}>
          Whole trip
        </DayButton>
        {daysWithStops.map((day) => (
          <DayButton
            key={day.dayNumber}
            active={selectedDay === day.dayNumber}
            color={dayColor(day.dayNumber)}
            onClick={() => setSelectedDay(day.dayNumber)}
          >
            Day {day.dayNumber}
          </DayButton>
        ))}
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-card">
        <div
          ref={container}
          className="h-[28rem] w-full sm:h-[34rem]"
          role="application"
          aria-label={`Map of stops in ${destination}`}
        />
      </div>

      {failed ? (
        <p className="mt-2 text-xs text-signal">
          The map could not load. Check the connection, or read the stops in the
          Itinerary tab.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-3">
          {selectedDay === null
            ? daysWithStops.map((day) => (
                <li
                  key={day.dayNumber}
                  className="flex items-center gap-1.5 text-xs text-muted"
                >
                  <span
                    className="h-0.5 w-5 rounded-pill"
                    style={{ background: dayColor(day.dayNumber) }}
                    aria-hidden
                  />
                  Day {day.dayNumber}
                </li>
              ))
            : [...new Set(shown.routes.map((route) => route.mode))].map(
                (mode) => {
                  const route = shown.routes.find(
                    (entry) => entry.mode === mode,
                  )!;
                  return (
                    <li
                      key={mode}
                      className="flex items-center gap-1.5 text-xs text-muted"
                    >
                      <span
                        className="h-0.5 w-5 rounded-pill"
                        style={{ background: route.color }}
                        aria-hidden
                      />
                      {TRANSPORT_MODE_LABEL[mode]}
                    </li>
                  );
                },
              )}
        </ul>

        <p className="tabular text-xs text-muted">
          {shown.markers.length} stops ·{" "}
          {formatDuration(
            shown.routes.reduce((sum, route) => sum + route.durationMinutes, 0),
          )}{" "}
          moving
        </p>
      </div>

      {all.unmappedCount > 0 ? (
        <p className="mt-2 text-xs text-signal">
          {all.unmappedCount} item{all.unmappedCount === 1 ? "" : "s"} could not
          be placed — no coordinates were recorded for them.
        </p>
      ) : null}
    </div>
  );
}

function DayButton({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-xs transition-colors",
        active
          ? "border-route bg-route-soft font-medium text-route-deep"
          : "border-line text-muted hover:border-route hover:text-route-deep",
      )}
    >
      {color ? (
        <span
          className="size-2 rounded-pill"
          style={{ background: color }}
          aria-hidden
        />
      ) : null}
      {children}
    </button>
  );
}

/** Escaped: titles come from provider data and reach the DOM as HTML. */
function popupHtml(stop: MapMarker, label: number): string {
  const escape = (value: string): string =>
    value.replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character] ?? character,
    );

  return [
    `<div style="font-family:system-ui;min-width:160px">`,
    `<div style="font-size:10px;color:${stop.color};text-transform:uppercase;letter-spacing:0.08em">Day ${stop.dayNumber} · stop ${label}</div>`,
    `<div style="font-weight:600;font-size:13px;color:#0d1b24;margin-top:3px">${escape(stop.label)}</div>`,
    `<div style="font-size:11px;color:#5c6f78;margin-top:2px">`,
    `${formatTime(stop.startTime, "en-US", "UTC")} · ${ITEM_TYPE_LABEL[stop.type]}`,
    `</div>`,
    stop.isMustDo
      ? `<div style="font-size:10px;color:#0e7c6b;margin-top:4px;text-transform:uppercase;letter-spacing:0.06em">Must-do</div>`
      : "",
    `</div>`,
  ].join("");
}
