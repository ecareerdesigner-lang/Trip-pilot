import type { Metadata } from "next";
import Link from "next/link";
import { Plane, Moon, MapPin, Wallet, Compass } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/repositories/trips";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { EmptyState } from "@/components/ui/empty-state";
import { DataSourceNote } from "@/components/ui/data-source-note";
import { buttonStyles } from "@/components/ui/button";
import { TripCard } from "@/components/dashboard/trip-card";
import { NextUpRoute } from "@/components/dashboard/next-up-route";
import { formatMoneyCompact } from "@/lib/money";
import type { TripSummary } from "@/types/view";

export const metadata: Metadata = { title: "Dashboard" };

function TripSection({
  title,
  trips,
}: {
  title: string;
  trips: TripSummary[];
}) {
  if (trips.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-[0.6875rem] font-medium tracking-[0.12em] text-muted uppercase">
        {title}
      </h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {trips.map((trip) => (
          <TripCard key={trip.id} trip={trip} />
        ))}
      </div>
    </section>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const data = await getDashboardData(user.id);
  const hasTrips =
    data.upcoming.length + data.drafts.length + data.past.length > 0;

  return (
    <>
      <PageHeader
        eyebrow="Dashboard"
        title={`Where to next, ${user.name}?`}
        description="Every trip you are planning, with the route, the schedule and the budget in one place."
        action={
          <Link href="/trips/new" className={buttonStyles("primary", "lg")}>
            <Plane className="size-4" aria-hidden />
            Plan a new trip
          </Link>
        }
      />

      {data.source === "sample" ? (
        <DataSourceNote className="mb-6">
          Showing sample trips. Connect a database in <code>.env</code> to save
          real ones — see <code>docs/development.md</code>.
        </DataSourceNote>
      ) : null}

      {hasTrips ? (
        <>
          <Card>
            <CardBody className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                icon={<Plane className="size-4" aria-hidden />}
                label="Trips planned"
                value={data.totals.tripsPlanned}
              />
              <Stat
                icon={<Moon className="size-4" aria-hidden />}
                label="Nights away"
                value={data.totals.nightsPlanned}
              />
              <Stat
                icon={<MapPin className="size-4" aria-hidden />}
                label="Destinations"
                value={data.totals.destinations}
              />
              <Stat
                icon={<Wallet className="size-4" aria-hidden />}
                label="Planned spend"
                value={formatMoneyCompact(
                  data.totals.plannedSpendCents,
                  data.totals.currency,
                )}
              />
            </CardBody>
          </Card>

          {data.nextUp ? (
            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="order-2 lg:order-1">
                <TripSection title="Upcoming" trips={data.upcoming} />
                <TripSection title="Drafts" trips={data.drafts} />
                <TripSection title="Previous trips" trips={data.past} />
              </div>
              <div className="order-1 lg:order-2 lg:mt-8">
                <NextUpRoute itinerary={data.nextUp} />
              </div>
            </div>
          ) : (
            <>
              <TripSection title="Upcoming" trips={data.upcoming} />
              <TripSection title="Drafts" trips={data.drafts} />
              <TripSection title="Previous trips" trips={data.past} />
            </>
          )}
        </>
      ) : (
        <Card>
          <EmptyState
            icon={<Compass className="size-5" aria-hidden />}
            title="Your first trip starts here"
            description="Tell TripPilot where you are going, what you have to budget, and the things you refuse to miss. It builds the days around them."
            action={
              <Link href="/trips/new" className={buttonStyles("primary", "md")}>
                Plan a new trip
              </Link>
            }
          />
        </Card>
      )}
    </>
  );
}
