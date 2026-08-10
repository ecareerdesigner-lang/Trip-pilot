import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { formatDayDate, formatTime } from "@/lib/format";
import { ITEM_TYPE_LABEL, TRANSPORT_MODE_COLOR, TRANSPORT_MODE_LABEL } from "@/lib/constants";
import type { UpcomingItinerary } from "@/types/view";

/**
 * The route rail — TripPilot's signature view.
 *
 * Transportation legs sit on the same line as the places they connect,
 * because a 25-minute subway ride is part of the day in the same way the
 * museum is. Each mode carries its own colour, the way a transit map does.
 */
export function NextUpRoute({ itinerary }: { itinerary: UpcomingItinerary }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-4 border-b border-line-soft px-5 py-4">
        <div className="min-w-0">
          <p className="text-[0.6875rem] font-medium tracking-[0.1em] text-route uppercase">
            Next up
          </p>
          <h2 className="mt-1 truncate text-base leading-tight">
            {itinerary.tripName}
          </h2>
          <p className="tabular mt-0.5 text-xs text-muted">
            {formatDayDate(itinerary.date)} · {itinerary.destination}
          </p>
        </div>
        <Link
          href={`/trips/${itinerary.tripId}/itinerary`}
          className="flex shrink-0 items-center gap-1 text-sm text-route-deep hover:underline"
        >
          Full day
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>

      <ol className="route-rail px-5 py-4">
        {itinerary.stops.map((stop) => {
          const isLeg = stop.mode !== null;
          const color = stop.mode
            ? TRANSPORT_MODE_COLOR[stop.mode]
            : "var(--color-route)";

          return (
            <li
              key={stop.id}
              className={cn("route-stop py-2", isLeg && "route-leg")}
              style={{ ["--stop-color" as string]: color }}
            >
              <div className="flex items-baseline gap-3">
                <time
                  className="tabular w-16 shrink-0 text-xs text-muted"
                  dateTime={stop.startTime}
                >
                  {formatTime(stop.startTime, "en-US", "UTC")}
                </time>
                <div className="min-w-0">
                  <p
                    className={cn(
                      "truncate text-sm",
                      isLeg ? "text-muted" : "font-medium text-ink",
                    )}
                  >
                    {stop.title}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {stop.mode
                      ? TRANSPORT_MODE_LABEL[stop.mode]
                      : ITEM_TYPE_LABEL[stop.type]}
                    {stop.location ? ` · ${stop.location}` : ""}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
