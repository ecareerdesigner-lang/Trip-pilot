import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Map as MapIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getItinerary, getTripSummary } from "@/lib/repositories/trips";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DataSourceNote } from "@/components/ui/data-source-note";
import { TripTabs } from "@/components/trips/trip-tabs";
import dynamic from "next/dynamic";
import { GenerateButton } from "@/components/trips/generate-button";
import { formatDateRange } from "@/lib/format";

export const metadata: Metadata = { title: "Map" };

/**
 * MapLibre touches `window` on import, so it cannot be server rendered.
 * Loading it client-side only is the supported route, and the placeholder
 * keeps the page from jumping when it arrives.
 */
const TripMapLibre = dynamic(
  () =>
    import("@/components/trips/trip-map-libre").then((mod) => mod.TripMapLibre),
  {
    loading: () => (
      <div className="h-[28rem] animate-pulse rounded-card border border-line bg-paper-deep sm:h-[34rem]" />
    ),
  },
);

export default async function MapPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const user = await requireUser();
  const trip = await getTripSummary(user.id, tripId);
  if (!trip) notFound();

  const itinerary = await getItinerary(user.id, tripId);

  return (
    <>
      <PageHeader
        eyebrow={trip.destination}
        title={trip.name}
        description={formatDateRange(trip.startDate, trip.endDate)}
      />
      <TripTabs tripId={tripId} active="Map" />

      <div className="mt-6">
        {itinerary?.containsMockData ? (
          <DataSourceNote className="mb-4">
            Positions come from sample travel data. Real coordinates arrive with
            a live provider.
          </DataSourceNote>
        ) : null}

        {itinerary && itinerary.hasAnyItems ? (
          <TripMapLibre days={itinerary.days} destination={trip.destination} />
        ) : (
          <Card>
            <EmptyState
              icon={<MapIcon className="size-5" aria-hidden />}
              title="Nothing to map yet"
              description="Build an itinerary and every stop, with the route between them, appears here."
              action={<GenerateButton tripId={tripId} hasItinerary={false} />}
            />
          </Card>
        )}
      </div>
    </>
  );
}
