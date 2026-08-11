"use client";

import { useState } from "react";
import {
  CalendarClock,
  Coins,
  Footprints,
  Star,
  TicketCheck,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  ITEM_TYPE_LABEL,
  RESERVATION_STATUS_LABEL,
  TRANSPORT_MODE_COLOR,
  TRANSPORT_MODE_LABEL,
} from "@/lib/constants";
import { formatDayDate, formatDistance, formatDuration, formatTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import type { ItineraryDay, TimelineItem, TimelineLeg } from "@/types/view";

/**
 * The itinerary timeline.
 *
 * A day is drawn as a route: places are solid stops on the line, journeys are
 * smaller stops between them, coloured by mode the way a transit map colours
 * its lines. The walk to the subway is on the same line as the museum,
 * because that is what the traveler actually does with their afternoon.
 */

function LegRow({ leg, currency }: { leg: TimelineLeg; currency: string }) {
  return (
    <li
      className="route-stop route-leg py-1.5"
      style={{ ["--stop-color" as string]: TRANSPORT_MODE_COLOR[leg.mode] }}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span
          className="text-xs font-medium"
          style={{ color: TRANSPORT_MODE_COLOR[leg.mode] }}
        >
          {TRANSPORT_MODE_LABEL[leg.mode]}
        </span>
        <span className="tabular text-xs text-muted">
          {formatDuration(leg.durationMinutes)}
          {leg.distanceMeters ? ` · ${formatDistance(leg.distanceMeters)}` : ""}
          {leg.costCents > 0 ? ` · ${formatMoney(leg.costCents, currency)}` : ""}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-muted">{leg.instructions}</p>
    </li>
  );
}

function ItemRow({
  item,
  currency,
}: {
  item: TimelineItem;
  currency: string;
}) {
  return (
    <>
      {item.legs.map((leg) => (
        <LegRow key={leg.id} leg={leg} currency={currency} />
      ))}

      <li className="route-stop py-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <time
                className="tabular text-sm font-medium text-ink"
                dateTime={item.startTime}
              >
                {formatTime(item.startTime, "en-US", "UTC")}
              </time>
              <span className="text-[0.6875rem] tracking-wide text-muted uppercase">
                {ITEM_TYPE_LABEL[item.type]}
              </span>
              {item.isMustDo ? (
                <Badge tone="route">
                  <Star className="size-2.5" aria-hidden />
                  Must-do
                </Badge>
              ) : null}
            </div>

            <h4 className="mt-1 text-sm font-medium text-ink">{item.title}</h4>

            {item.locationName ? (
              <p className="mt-0.5 text-xs text-muted">{item.locationName}</p>
            ) : null}

            {item.description ? (
              <p className="mt-1 max-w-prose text-xs text-muted">
                {item.description}
              </p>
            ) : null}

            {item.reservationRequired ? (
              <p className="mt-1.5 flex items-center gap-1 text-xs text-signal">
                <TicketCheck className="size-3.5" aria-hidden />
                {RESERVATION_STATUS_LABEL[item.reservationStatus]}
              </p>
            ) : null}
          </div>

          <div className="shrink-0 text-right">
            <p className="tabular text-sm text-ink">
              {item.estimatedCostCents > 0
                ? formatMoney(item.estimatedCostCents, currency)
                : "—"}
            </p>
            <p className="tabular mt-0.5 text-xs text-muted">
              {formatDuration(item.durationMinutes)}
            </p>
          </div>
        </div>
      </li>
    </>
  );
}

function DayTotals({ day, currency }: { day: ItineraryDay; currency: string }) {
  const entries = [
    {
      icon: <CalendarClock className="size-3.5" aria-hidden />,
      label: `${day.totals.itemCount} stops`,
    },
    {
      icon: <Clock className="size-3.5" aria-hidden />,
      label: `${formatDuration(day.totals.scheduledMinutes)} scheduled`,
    },
    {
      icon: <Footprints className="size-3.5" aria-hidden />,
      label: `${formatDuration(day.totals.travelMinutes)} travelling`,
    },
    {
      icon: <Coins className="size-3.5" aria-hidden />,
      label: formatMoney(day.totals.plannedCents, currency),
    },
  ];

  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1.5 border-b border-line-soft px-5 py-3">
      {entries.map((entry) => (
        <span
          key={entry.label}
          className="tabular flex items-center gap-1.5 text-xs text-muted"
        >
          {entry.icon}
          {entry.label}
        </span>
      ))}
    </div>
  );
}

export function ItineraryTimeline({
  days,
  currency,
}: {
  days: ItineraryDay[];
  currency: string;
}) {
  // Open on the first day that has anything on it.
  const firstWithItems = Math.max(
    0,
    days.findIndex((day) => day.items.length > 0),
  );
  const [selected, setSelected] = useState(firstWithItems);
  const day = days[selected];

  if (!day) return null;

  return (
    <div>
      <div
        className="mb-5 flex gap-1.5 overflow-x-auto pb-1"
        role="tablist"
        aria-label="Trip days"
      >
        {days.map((entry, index) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={index === selected}
            onClick={() => setSelected(index)}
            className={cn(
              "shrink-0 rounded-card border px-3 py-2 text-left transition-colors",
              index === selected
                ? "border-route bg-route-soft/50"
                : "border-line bg-card hover:border-route/50",
            )}
          >
            <span className="block text-[0.6875rem] tracking-wide text-muted uppercase">
              Day {entry.dayNumber}
            </span>
            <span className="tabular mt-0.5 block text-sm text-ink">
              {formatDayDate(entry.date)}
            </span>
            <span className="mt-0.5 block text-xs text-muted">
              {entry.items.length === 0
                ? "Nothing yet"
                : `${entry.items.length} stops`}
            </span>
          </button>
        ))}
      </div>

      <div className="rounded-card border border-line bg-card">
        {day.summary ? (
          <p className="border-b border-line-soft px-5 py-3 text-sm text-ink-soft">
            {day.summary}
          </p>
        ) : null}

        {day.items.length > 0 ? (
          <>
            <DayTotals day={day} currency={currency} />
            <ol className="route-rail px-5 py-4">
              {day.items.map((item) => (
                <ItemRow key={item.id} item={item} currency={currency} />
              ))}
            </ol>
          </>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-muted">
            Nothing scheduled on this day yet.
          </p>
        )}
      </div>
    </div>
  );
}
