import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { requireUser } from "@/lib/auth";
import {
  getItinerary,
  getTripSummary,
  validateTrip,
} from "@/lib/repositories/trips";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DataSourceNote } from "@/components/ui/data-source-note";
import { TripTabs } from "@/components/trips/trip-tabs";
import { GenerateButton } from "@/components/trips/generate-button";
import { ItineraryTimeline } from "@/components/trips/itinerary-timeline";
import { ValidationPanel } from "@/components/trips/validation-panel";
import { TripChat } from "@/components/trips/trip-chat";
import { isAiConfigured } from "@/lib/env";
import { formatDateRange } from "@/lib/format";

export const metadata: Metadata = { title: "Itinerary" };

export default async function ItineraryPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const user = await requireUser();

  const [trip, itinerary, validation] = await Promise.all([
    getTripSummary(user.id, tripId),
    getItinerary(user.id, tripId),
    validateTrip(user.id, tripId),
  ]);

  if (!trip) notFound();

  return (
    <>
      <PageHeader
        eyebrow={trip.destination}
        title={trip.name}
        description={formatDateRange(trip.startDate, trip.endDate)}
      />

      <TripTabs tripId={tripId} active="Itinerary" />

      <div className="mt-6">
        {itinerary && itinerary.hasAnyItems ? (
          <>
            {itinerary.containsMockData ? (
              <DataSourceNote className="mb-4">
                Built from sample travel data. Times, prices and availability
                are estimates, not live bookings.
              </DataSourceNote>
            ) : null}
            {/*
              The reality check sits above the schedule, not below it. A
              conflict the traveler has to scroll past the whole day to find
              is a conflict they will discover at the theatre door instead.
            */}
            {validation ? (
              <div className="mb-6">
                <ValidationPanel report={validation} />
              </div>
            ) : null}

            <ItineraryTimeline
              days={itinerary.days}
              currency={itinerary.currency}
              tripId={tripId}
              // `isMock` describes where the prices came from, not whether the
              // row exists. A generated itinerary is real rows either way, so
              // editing is offered whenever there is something to edit.
              editable={itinerary.hasAnyItems}
            />

            {/*
              The assistant sits below the schedule it talks about, so a
              proposal can be read against the day it changes.
            */}
            {isAiConfigured() ? (
              <div className="mt-8">
                <TripChat tripId={tripId} />
              </div>
            ) : (
              <p className="mt-8 text-xs text-muted">
                Set <code>ANTHROPIC_API_KEY</code> to ask questions about this
                trip and make changes in plain language.
              </p>
            )}
          </>
        ) : (
          <Card>
            <EmptyState
              icon={<CalendarRange className="size-5" aria-hidden />}
              title="No itinerary yet"
              description="Build one and TripPilot will lay out the days, place your must-dos first, and schedule every journey in between."
              action={<GenerateButton tripId={tripId} hasItinerary={false} />}
            />
          </Card>
        )}
      </div>
    </>
  );
}
