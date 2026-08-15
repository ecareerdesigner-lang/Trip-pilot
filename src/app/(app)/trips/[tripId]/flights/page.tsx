import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Plane } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getTripSummary } from "@/lib/repositories/trips";
import { getFlightProvider } from "@/lib/providers/flights";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { TripTabs } from "@/components/trips/trip-tabs";
import { formatDateRange, formatDuration, formatTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import type { FlightCandidate } from "@/lib/providers/types";

export const metadata: Metadata = { title: "Flights" };

/**
 * Flights.
 *
 * Fetched live on every page load rather than saved at generation time —
 * unlike Transportation's legs, which are locked into the schedule, a
 * flight is something the traveler still has to go buy, and a price shown
 * here that is a week stale is actively misleading rather than merely out
 * of date. The tradeoff is a real network call on every visit; acceptable
 * for a page a traveler checks occasionally, not for one loaded constantly.
 */
export default async function FlightsPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const user = await requireUser();
  const trip = await getTripSummary(user.id, tripId);
  if (!trip) notFound();

  let flights: FlightCandidate[] = [];
  let searchFailed = false;

  try {
    flights = await getFlightProvider().search({
      origin: trip.origin,
      destination: trip.destination,
      departDate: trip.startDate,
      returnDate: trip.endDate,
      travelers: trip.travelers,
      limit: 8,
    });
  } catch {
    // A live search failing is a reason to say so, not a reason to break
    // the page — the rest of the trip is still real and still usable.
    searchFailed = true;
  }

  const outbound = flights.filter((f) => !f.isReturn);
  const inbound = flights.filter((f) => f.isReturn);
  const isMock = flights[0]?.isMock ?? false;

  return (
    <>
      <PageHeader
        eyebrow={trip.destination}
        title={trip.name}
        description={formatDateRange(trip.startDate, trip.endDate)}
      />
      <TripTabs tripId={tripId} active="Flights" />

      {searchFailed ? (
        <Card className="mt-6">
          <EmptyState
            icon={<Plane className="size-5" aria-hidden />}
            title="Flight search is not responding right now"
            description="Try again in a moment."
          />
        </Card>
      ) : flights.length === 0 ? (
        <Card className="mt-6">
          <EmptyState
            icon={<Plane className="size-5" aria-hidden />}
            title="No flights found"
            description={`${trip.origin} to ${trip.destination} did not return any results for these dates.`}
          />
        </Card>
      ) : (
        <div className="mt-6 space-y-6">
          {isMock ? (
            <p className="text-xs text-muted">
              Sample flights — connect a live flight provider for real fares.
            </p>
          ) : null}

          <FlightGroup
            title={`${trip.origin} → ${trip.destination}`}
            flights={outbound}
            currency={trip.currency}
          />

          {inbound.length > 0 ? (
            <FlightGroup
              title={`${trip.destination} → ${trip.origin}`}
              flights={inbound}
              currency={trip.currency}
            />
          ) : null}
        </div>
      )}
    </>
  );
}

function FlightGroup({
  title,
  flights,
  currency,
}: {
  title: string;
  flights: FlightCandidate[];
  currency: string;
}) {
  if (flights.length === 0) return null;

  return (
    <Card>
      <div className="border-b border-line-soft px-5 py-4">
        <h2 className="text-base leading-tight">{title}</h2>
      </div>
      <div className="divide-y divide-line-soft">
        {flights.map((flight) => (
          <CardBody key={flight.providerRef} className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-ink">{flight.carrier}</p>
                {flight.identifier ? (
                  <span className="tabular text-xs text-muted">
                    {flight.identifier}
                  </span>
                ) : null}
                {flight.stops > 0 ? (
                  <Badge tone="neutral">
                    {flight.stops} stop{flight.stops === 1 ? "" : "s"}
                  </Badge>
                ) : (
                  <Badge tone="route">Nonstop</Badge>
                )}
              </div>
              <p className="tabular mt-1 text-sm text-muted">
                {formatTime(flight.departureTime)} {flight.originCode} —{" "}
                {formatTime(flight.arrivalTime)} {flight.destinationCode}
                {"  ·  "}
                {formatDuration(flight.durationMinutes)}
              </p>
            </div>
            <p className="tabular shrink-0 text-lg leading-none">
              {formatMoney(flight.priceCents, currency)}
            </p>
          </CardBody>
        ))}
      </div>
    </Card>
  );
}
