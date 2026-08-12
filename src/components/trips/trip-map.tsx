"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { ITEM_TYPE_LABEL, TRANSPORT_MODE_LABEL } from "@/lib/constants";
import { formatDayDate, formatDuration, formatTime } from "@/lib/format";
import { buildMapData, project } from "@/lib/travel/map-data";
import type { ItineraryDay } from "@/types/view";

/**
 * The trip map.
 *
 * Drawn as a transit diagram rather than a street map: numbered stops joined
 * by coloured lines, one colour per mode, matching the itinerary rail. That
 * is what this product is about — the shape of the day and how you move
 * through it — and it needs no mapping key to be useful.
 *
 * Positions are real, projected with Web Mercator, so the geography is honest
 * even without a basemap underneath. When a provider is configured it can be
 * layered in behind this; the data comes from `map-data.ts` either way and
 * nothing here knows about Mapbox or Google.
 */

const VIEW_WIDTH = 800;
const VIEW_HEIGHT = 520;
const PADDING = 44;

export function TripMap({
  days,
  destination,
}: {
  days: ItineraryDay[];
  destination: string;
}) {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const visibleDays = useMemo(
    () =>
      selectedDay === null
        ? days
        : days.filter((day) => day.dayNumber === selectedDay),
    [days, selectedDay],
  );

  // Bounds are computed across the whole trip, not the visible subset, so
  // switching days pans the eye rather than rescaling the city under it.
  const all = useMemo(() => buildMapData(days), [days]);
  const shown = useMemo(() => buildMapData(visibleDays), [visibleDays]);

  const bounds = all.bounds;

  if (!bounds || all.markers.length === 0) {
    return (
      <div className="rounded-card border border-line bg-card px-6 py-12 text-center">
        <p className="text-sm text-muted">
          Nothing on this trip has coordinates yet, so there is nothing to map.
        </p>
      </div>
    );
  }

  const toScreen = (point: { latitude: number; longitude: number }) => {
    const { x, y } = project(point, bounds);
    return {
      x: PADDING + x * (VIEW_WIDTH - PADDING * 2),
      y: PADDING + y * (VIEW_HEIGHT - PADDING * 2),
    };
  };

  const daysWithStops = days.filter((day) =>
    day.items.some((item) => item.latitude !== null),
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelectedDay(null)}
          className={cn(
            "rounded-pill border px-3 py-1.5 text-xs transition-colors",
            selectedDay === null
              ? "border-route bg-route-soft font-medium text-route-deep"
              : "border-line text-muted hover:border-route hover:text-route-deep",
          )}
        >
          Whole trip
        </button>
        {daysWithStops.map((day) => (
          <button
            key={day.dayNumber}
            type="button"
            onClick={() => setSelectedDay(day.dayNumber)}
            className={cn(
              "rounded-pill border px-3 py-1.5 text-xs transition-colors",
              selectedDay === day.dayNumber
                ? "border-route bg-route-soft font-medium text-route-deep"
                : "border-line text-muted hover:border-route hover:text-route-deep",
            )}
          >
            Day {day.dayNumber}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-card">
        <svg
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          className="h-auto w-full"
          role="img"
          aria-label={`Map of stops in ${destination}`}
        >
          <defs>
            <pattern
              id="grid"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="var(--color-line-soft)"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="url(#grid)" />

          {/* Stops not on the selected day, kept faint for context. */}
          {selectedDay !== null
            ? all.markers
                .filter((marker) => marker.dayNumber !== selectedDay)
                .map((marker) => {
                  const { x, y } = toScreen(marker.point);
                  return (
                    <circle
                      key={`ghost-${marker.id}`}
                      cx={x}
                      cy={y}
                      r={4}
                      fill="var(--color-line)"
                    />
                  );
                })
            : null}

          {shown.routes.map((route) => {
            const from = toScreen(route.from);
            const to = toScreen(route.to);
            return (
              <line
                key={route.id}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={route.color}
                strokeWidth={3}
                strokeLinecap="round"
                strokeDasharray={route.mode === "WALK" ? "2 6" : undefined}
                opacity={0.75}
              />
            );
          })}

          {shown.markers.map((marker) => {
            const { x, y } = toScreen(marker.point);
            const active = hovered === marker.id;

            return (
              <g
                key={marker.id}
                onMouseEnter={() => setHovered(marker.id)}
                onMouseLeave={() => setHovered(null)}
                className="cursor-pointer"
              >
                <circle
                  cx={x}
                  cy={y}
                  r={active ? 15 : 12}
                  fill="var(--color-card)"
                  stroke={
                    marker.isMustDo ? "var(--color-route)" : "var(--color-ink-soft)"
                  }
                  strokeWidth={marker.isMustDo ? 3 : 2}
                />
                <text
                  x={x}
                  y={y + 4}
                  textAnchor="middle"
                  className="tabular"
                  fontSize="11"
                  fill="var(--color-ink)"
                >
                  {marker.order}
                </text>

                {active ? (
                  <g>
                    <rect
                      x={x + 18}
                      y={y - 26}
                      width={Math.min(260, marker.label.length * 7 + 24)}
                      height={44}
                      rx={8}
                      fill="var(--color-ink)"
                      opacity={0.94}
                    />
                    <text x={x + 30} y={y - 8} fontSize="12" fill="white">
                      {marker.label.slice(0, 34)}
                    </text>
                    <text
                      x={x + 30}
                      y={y + 8}
                      fontSize="10"
                      fill="var(--color-line)"
                    >
                      {formatTime(marker.startTime, "en-US", "UTC")} ·{" "}
                      {ITEM_TYPE_LABEL[marker.type]}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-3">
          {[...new Set(shown.routes.map((route) => route.mode))].map((mode) => {
            const route = shown.routes.find((entry) => entry.mode === mode)!;
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
          })}
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

      {selectedDay !== null ? (
        <p className="mt-3 text-xs text-muted">
          {formatDayDate(
            days.find((day) => day.dayNumber === selectedDay)?.date ?? "",
          )}
        </p>
      ) : null}
    </div>
  );
}
