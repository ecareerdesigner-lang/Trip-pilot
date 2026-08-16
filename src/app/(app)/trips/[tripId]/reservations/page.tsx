import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Reservation } from "@prisma/client";
import { Plane, BedDouble, FileQuestion } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { getTripSummary } from "@/lib/repositories/trips";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TripTabs } from "@/components/trips/trip-tabs";
import { ReservationForm } from "@/components/trips/reservation-form";
import { DeleteReservationButton } from "@/components/trips/delete-reservation-button";
import {
  createReservationAction,
  deleteReservationAction,
} from "@/app/(app)/trips/[tripId]/reservations/actions";
import { formatDate, formatTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Reservations" };

export default async function ReservationsPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const user = await requireUser();
  const trip = await getTripSummary(user.id, tripId);
  if (!trip) notFound();

  const prisma = getPrisma();
  const reservations: Reservation[] = prisma
    ? await prisma.reservation.findMany({
        where: { tripId },
        orderBy: [{ departureTime: "asc" }, { reservedFor: "asc" }, { createdAt: "asc" }],
      })
    : [];

  return (
    <>
      <PageHeader
        eyebrow={trip.destination}
        title={trip.name}
        description={`${trip.origin} to ${trip.destination}`}
      />
      <TripTabs tripId={tripId} active="Reservations" />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {reservations.length === 0 ? (
            <Card>
              <EmptyState
                icon={<FileQuestion className="size-5" aria-hidden />}
                title="Nothing saved yet"
                description="Flights are search results, not bookings, and hotels are still sample data — this is the place to keep what you actually booked elsewhere."
              />
            </Card>
          ) : (
            reservations.map((res) => (
              <Card key={res.id}>
                <CardBody className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0 text-muted">
                    {res.category === "FLIGHT" ? (
                      <Plane className="size-5" aria-hidden />
                    ) : res.category === "HOTEL" ? (
                      <BedDouble className="size-5" aria-hidden />
                    ) : (
                      <FileQuestion className="size-5" aria-hidden />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{res.title}</p>

                    {res.category === "FLIGHT" && res.departureTime && res.arrivalTime ? (
                      <p className="tabular mt-0.5 text-xs text-muted">
                        {res.flightNumber ? `${res.flightNumber} · ` : ""}
                        {res.departureAirport} {formatTime(res.departureTime, "en-US", "UTC")}
                        {" → "}
                        {res.arrivalAirport} {formatTime(res.arrivalTime, "en-US", "UTC")}
                        {" · "}
                        {formatDate(res.departureTime, "en-US", "UTC")}
                      </p>
                    ) : null}

                    {res.category === "HOTEL" ? (
                      <>
                        {res.locationAddress ? (
                          <p className="mt-0.5 text-xs text-muted">
                            {res.locationAddress}
                          </p>
                        ) : null}
                        {res.reservedFor ? (
                          <p className="tabular mt-0.5 text-xs text-muted">
                            Check-in {formatDate(res.reservedFor, "en-US", "UTC")}
                          </p>
                        ) : null}
                      </>
                    ) : null}

                    <p className="mt-1 text-xs text-muted">
                      {res.confirmationCode ? `Confirmation ${res.confirmationCode}` : ""}
                      {res.confirmationCode && res.costCents ? " · " : ""}
                      {res.costCents ? formatMoney(res.costCents, trip.currency) : ""}
                    </p>
                  </div>

                  <DeleteReservationButton
                    tripId={tripId}
                    reservationId={res.id}
                    title={res.title}
                    action={deleteReservationAction}
                  />
                </CardBody>
              </Card>
            ))
          )}
        </div>

        <ReservationForm tripId={tripId} action={createReservationAction} />
      </div>
    </>
  );
}
