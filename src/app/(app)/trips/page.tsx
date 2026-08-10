import type { Metadata } from "next";
import Link from "next/link";
import { Plane, Map } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listTrips } from "@/lib/repositories/trips";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DataSourceNote } from "@/components/ui/data-source-note";
import { buttonStyles } from "@/components/ui/button";
import { TripCard } from "@/components/dashboard/trip-card";

export const metadata: Metadata = { title: "Trips" };

export default async function TripsPage() {
  const user = await requireUser();
  const { trips, source } = await listTrips(user.id);

  return (
    <>
      <PageHeader
        eyebrow="Trips"
        title="All trips"
        description="Drafts, trips in planning, and everywhere you have already been."
        action={
          <Link href="/trips/new" className={buttonStyles("primary", "md")}>
            <Plane className="size-4" aria-hidden />
            Plan a new trip
          </Link>
        }
      />

      {source === "sample" ? (
        <DataSourceNote className="mb-6">
          Showing sample trips. Connect a database to save real ones.
        </DataSourceNote>
      ) : null}

      {trips.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={<Map className="size-5" aria-hidden />}
            title="No trips yet"
            description="Start one and TripPilot will build the days, the routes between them, and the running budget."
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
