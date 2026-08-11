import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Users, Wallet, ListChecks } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getTripSummary } from "@/lib/repositories/trips";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { TripStatusBadge } from "@/components/ui/badge";
import { NotBuiltYet } from "@/components/ui/not-built-yet";
import { TripTabs } from "@/components/trips/trip-tabs";
import { GenerateButton } from "@/components/trips/generate-button";
import { buttonStyles } from "@/components/ui/button";
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

      <div className="mt-6">
        <NotBuiltYet
          feature="The itinerary view"
          phase="Phases 15 to 21"
          detail={
            trip.itemCount > 0
              ? `This trip has ${trip.itemCount} scheduled items with their journeys. The timeline, map, budget and transportation views that display them are next.`
              : "Build an itinerary above, then the timeline and map views will render it."
          }
        />
      </div>
    </>
  );
}
