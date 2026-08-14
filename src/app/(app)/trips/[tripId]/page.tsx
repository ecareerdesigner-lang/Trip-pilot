import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Users, Wallet, ListChecks } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getTripSummary, validateTrip } from "@/lib/repositories/trips";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { TripStatusBadge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { TripTabs } from "@/components/trips/trip-tabs";
import { GenerateButton } from "@/components/trips/generate-button";
import { formatDateRange, daysBetweenInclusive, relativeToToday } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Trip" };

export default async function TripPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const user = await requireUser();
  const trip = await getTripSummary(user.id, tripId);

  if (!trip) notFound();

  // Only worth asking once there is something to validate.
  const validation =
    trip.itemCount > 0 ? await validateTrip(user.id, tripId) : null;

  const days = daysBetweenInclusive(trip.startDate, trip.endDate);

  return (
    <>
      <PageHeader
        eyebrow={trip.destination}
        title={trip.name}
        description={`${trip.origin} to ${trip.destination} · ${formatDateRange(
          trip.startDate,
          trip.endDate,
        )}`}
        action={
          <Link href="/trips" className={buttonStyles("secondary", "md")}>
            All trips
          </Link>
        }
      />

      <div className="mb-6 flex items-center gap-3">
        <TripStatusBadge status={trip.status} />
        <span className="text-xs text-muted">
          {relativeToToday(trip.startDate)}
        </span>
      </div>

      <Card>
        <CardBody className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            icon={<CalendarDays className="size-4" aria-hidden />}
            label="Length"
            value={`${days} days`}
          />
          <Stat
            icon={<Users className="size-4" aria-hidden />}
            label="Travelers"
            value={trip.travelers}
          />
          <Stat
            icon={<Wallet className="size-4" aria-hidden />}
            label="Budget"
            value={
              trip.totalBudgetCents === null
                ? "Not set"
                : formatMoney(trip.totalBudgetCents, trip.currency)
            }
            hint={
              trip.totalBudgetCents === null
                ? undefined
                : `${formatMoney(trip.plannedCents, trip.currency)} planned`
            }
          />
          <Stat
            icon={<ListChecks className="size-4" aria-hidden />}
            label="Must-dos"
            value={`${trip.mustDoScheduledCount}/${trip.mustDoCount}`}
            hint="scheduled"
          />
        </CardBody>
      </Card>

      <div className="mt-6">
        <TripTabs tripId={tripId} active="Overview" />
      </div>

      <div className="mt-6">
        <GenerateButton tripId={trip.id} hasItinerary={trip.itemCount > 0} />
      </div>

      {/*
        The overview is where a trip lands by default, so it answers the
        question somebody actually arrives with: is this ready, and what
        needs my attention. It previously said the itinerary view was "next"
        long after it was built.
      */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader title="Where it stands" />
          <CardBody className="space-y-2 text-sm">
            {trip.itemCount === 0 ? (
              <p className="text-muted">
                Nothing scheduled yet. Build an itinerary and the days, routes
                and budget fill in.
              </p>
            ) : (
              <>
                <p className="text-ink">
                  {trip.itemCount} things scheduled across {days} days.
                </p>
                {validation ? (
                  validation.counts.ERROR > 0 ? (
                    <p className="text-alert">
                      {validation.counts.ERROR}{" "}
                      {validation.counts.ERROR === 1 ? "problem" : "problems"}{" "}
                      would stop this trip working as planned.
                    </p>
                  ) : validation.counts.WARNING > 0 ? (
                    <p className="text-signal">
                      {validation.counts.WARNING} things worth checking before
                      you go.
                    </p>
                  ) : (
                    <p className="text-route-deep">
                      Everything checks out — the days work as scheduled.
                    </p>
                  )
                ) : null}
              </>
            )}
          </CardBody>
          {trip.itemCount > 0 ? (
            <CardBody className="border-t border-line-soft">
              <Link
                href={`/trips/${tripId}/itinerary`}
                className={buttonStyles("secondary", "sm")}
              >
                Open the itinerary
              </Link>
            </CardBody>
          ) : null}
        </Card>

        <Card>
          <CardHeader title="Must-dos" />
          <CardBody>
            {trip.mustDoCount === 0 ? (
              <p className="text-sm text-muted">
                None set. Anything you refuse to miss gets scheduled first.
              </p>
            ) : (
              <>
                <p className="text-sm text-ink">
                  {trip.mustDoScheduledCount} of {trip.mustDoCount} scheduled.
                </p>
                {trip.mustDoScheduledCount < trip.mustDoCount ? (
                  <p className="mt-1 text-sm text-signal">
                    The rest could not be matched to a place in this
                    destination.
                  </p>
                ) : null}
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
