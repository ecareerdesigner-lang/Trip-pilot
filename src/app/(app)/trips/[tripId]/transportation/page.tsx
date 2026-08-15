import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Route } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getTripSummary, getTripTransportation } from "@/lib/repositories/trips";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TripTabs } from "@/components/trips/trip-tabs";
import { TRANSPORT_MODE_COLOR, TRANSPORT_MODE_LABEL } from "@/lib/constants";
import {
  formatDateRange,
  formatDayDate,
  formatDistance,
  formatDuration,
  formatTime,
} from "@/lib/format";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Transportation" };

export default async function TransportationPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const user = await requireUser();
  const trip = await getTripSummary(user.id, tripId);
  if (!trip) notFound();

  const report = await getTripTransportation(user.id, tripId);

  return (
    <>
      <PageHeader
        eyebrow={trip.destination}
        title={trip.name}
        description={formatDateRange(trip.startDate, trip.endDate)}
      />
      <TripTabs tripId={tripId} active="Transportation" />

      {!report || report.journeyCount === 0 ? (
        <Card className="mt-6">
          <EmptyState
            icon={<Route className="size-5" aria-hidden />}
            title="No journeys yet"
            description="Once this trip has an itinerary, every walk, ride and transfer between places shows up here."
          />
        </Card>
      ) : (
        <>
          <Card className="mt-6">
            <CardBody className="grid gap-6 sm:grid-cols-3">
              <div>
                <p className="text-[0.6875rem] font-medium tracking-[0.1em] text-muted uppercase">
                  Time in transit
                </p>
                <p className="tabular mt-1 text-xl leading-none">
                  {formatDuration(report.totalMinutes)}
                </p>
              </div>
              <div>
                <p className="text-[0.6875rem] font-medium tracking-[0.1em] text-muted uppercase">
                  Fares
                </p>
                <p className="tabular mt-1 text-xl leading-none">
                  {formatMoney(report.totalCostCents, trip.currency)}
                </p>
              </div>
              <div>
                <p className="text-[0.6875rem] font-medium tracking-[0.1em] text-muted uppercase">
                  Journeys
                </p>
                <p className="tabular mt-1 text-xl leading-none">
                  {report.journeyCount}
                </p>
              </div>
            </CardBody>
          </Card>

          <Card className="mt-6">
            <div className="border-b border-line-soft px-5 py-4">
              <h2 className="text-base leading-tight">How you get around</h2>
              {report.longestJourney ? (
                <p className="mt-1 text-sm text-muted">
                  The longest single journey is{" "}
                  {formatDuration(report.longestJourney.totalMinutes)} to{" "}
                  {report.longestJourney.toTitle}.
                </p>
              ) : null}
            </div>
            <div className="divide-y divide-line-soft">
              {report.byMode.map((mode) => (
                <div
                  key={mode.mode}
                  className="flex items-center gap-3 px-5 py-3"
                >
                  <span
                    className="size-2.5 shrink-0 rounded-pill"
                    style={{ background: TRANSPORT_MODE_COLOR[mode.mode] }}
                    aria-hidden
                  />
                  <span className="w-24 shrink-0 text-sm text-ink">
                    {TRANSPORT_MODE_LABEL[mode.mode]}
                  </span>
                  <span className="tabular flex-1 text-right text-xs text-muted">
                    {mode.legCount} leg{mode.legCount === 1 ? "" : "s"} ·{" "}
                    {formatDuration(mode.totalMinutes)}
                    {mode.totalMeters > 0
                      ? ` · ${formatDistance(mode.totalMeters)}`
                      : ""}
                    {mode.totalCostCents > 0
                      ? ` · ${formatMoney(mode.totalCostCents, trip.currency)}`
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <div className="mt-6 space-y-6">
            {report.days
              .filter((day) => day.journeys.length > 0)
              .map((day) => (
                <Card key={day.date}>
                  <div className="flex items-baseline justify-between gap-3 border-b border-line-soft px-5 py-4">
                    <div>
                      <p className="text-[0.6875rem] font-medium tracking-[0.12em] text-route uppercase">
                        Day {day.dayNumber}
                      </p>
                      <h3 className="mt-0.5 text-base leading-tight">
                        {formatDayDate(day.date)}
                      </h3>
                    </div>
                    <p className="tabular text-xs text-muted">
                      {formatDuration(day.totalMinutes)} ·{" "}
                      {formatMoney(day.totalCostCents, trip.currency)}
                    </p>
                  </div>

                  <ul className="divide-y divide-line-soft">
                    {day.journeys.map((journey) => (
                      <li key={journey.toItemId} className="px-5 py-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-sm text-ink">
                            To {journey.toTitle}
                          </p>
                          <p className="tabular text-xs text-muted">
                            {journey.departureTime
                              ? `${formatTime(journey.departureTime, "en-US", "UTC")} – `
                              : ""}
                            {formatTime(journey.arrivalTime, "en-US", "UTC")}
                          </p>
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {journey.legs.map((leg) => (
                            <span
                              key={leg.id}
                              className="tabular inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[0.6875rem]"
                              style={{
                                background: `color-mix(in srgb, ${
                                  TRANSPORT_MODE_COLOR[leg.mode]
                                } 12%, transparent)`,
                                color: TRANSPORT_MODE_COLOR[leg.mode],
                              }}
                            >
                              {TRANSPORT_MODE_LABEL[leg.mode]}{" "}
                              {formatDuration(leg.durationMinutes)}
                            </span>
                          ))}
                        </div>

                        {journey.legs
                          .filter((leg) => leg.mode !== "WALK" && leg.instructions)
                          .map((leg) => (
                            <p key={leg.id} className="mt-1 text-xs text-ink-soft">
                              {leg.instructions}
                            </p>
                          ))}

                        <p className="tabular mt-1.5 text-xs text-muted">
                          {formatDuration(journey.totalMinutes)} door to door
                          {journey.totalMeters > 0
                            ? ` · ${formatDistance(journey.totalMeters)}`
                            : ""}
                          {journey.totalCostCents > 0
                            ? ` · ${formatMoney(journey.totalCostCents, trip.currency)}`
                            : " · no fare"}
                        </p>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
          </div>
        </>
      )}
    </>
  );
}
