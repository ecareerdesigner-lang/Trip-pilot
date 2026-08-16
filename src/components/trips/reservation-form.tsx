"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plane, BedDouble, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ReservationResult } from "@/app/(app)/trips/[tripId]/reservations/actions";

type Category = "FLIGHT" | "HOTEL";

/**
 * Add a manual reservation.
 *
 * Neither category is a real booking flow — flights are search results the
 * traveler still has to buy elsewhere, and hotels are mock data until a
 * real hotel provider exists. This is the honest middle ground: a place to
 * keep what was actually booked, typed in by hand.
 */
export function ReservationForm({
  tripId,
  action,
}: {
  tripId: string;
  action: (tripId: string, input: unknown) => Promise<ReservationResult>;
}) {
  const router = useRouter();
  const [category, setCategory] = useState<Category>("FLIGHT");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    setField(null);

    const input = { ...Object.fromEntries(formData.entries()), category };

    start(async () => {
      const result = await action(tripId, input);
      if (result.ok) {
        router.refresh();
        return;
      }
      setError(result.message);
      setField(result.field ?? null);
    });
  }

  return (
    <Card>
      <CardHeader title="Add a reservation" />

      <CardBody>
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => setCategory("FLIGHT")}
            className={`flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm font-medium transition ${
              category === "FLIGHT"
                ? "bg-route text-white"
                : "bg-paper-deep text-muted hover:text-ink"
            }`}
          >
            <Plane className="size-3.5" aria-hidden />
            Flight
          </button>
          <button
            type="button"
            onClick={() => setCategory("HOTEL")}
            className={`flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm font-medium transition ${
              category === "HOTEL"
                ? "bg-route text-white"
                : "bg-paper-deep text-muted hover:text-ink"
            }`}
          >
            <BedDouble className="size-3.5" aria-hidden />
            Hotel
          </button>
        </div>

        <form action={submit} className="space-y-4">
          <Field
            id="title"
            label={category === "FLIGHT" ? "What is this flight?" : "Hotel name"}
            required
            error={field === "title" ? (error ?? undefined) : undefined}
          >
            <Input
              id="title"
              name="title"
              placeholder={
                category === "FLIGHT" ? "Outbound to Rome" : "Marriott Downtown"
              }
              invalid={field === "title"}
            />
          </Field>

          {category === "FLIGHT" ? (
            <>
              <Field id="flightNumber" label="Flight number">
                <Input id="flightNumber" name="flightNumber" placeholder="DL 202" />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field
                  id="departureAirport"
                  label="From (airport code)"
                  required
                  error={field === "departureAirport" ? (error ?? undefined) : undefined}
                >
                  <Input
                    id="departureAirport"
                    name="departureAirport"
                    placeholder="CLT"
                    maxLength={10}
                    invalid={field === "departureAirport"}
                  />
                </Field>
                <Field
                  id="arrivalAirport"
                  label="To (airport code)"
                  required
                  error={field === "arrivalAirport" ? (error ?? undefined) : undefined}
                >
                  <Input
                    id="arrivalAirport"
                    name="arrivalAirport"
                    placeholder="FCO"
                    maxLength={10}
                    invalid={field === "arrivalAirport"}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field
                  id="departureTime"
                  label="Departs"
                  required
                  error={field === "departureTime" ? (error ?? undefined) : undefined}
                >
                  <Input
                    id="departureTime"
                    name="departureTime"
                    type="datetime-local"
                    invalid={field === "departureTime"}
                  />
                </Field>
                <Field
                  id="arrivalTime"
                  label="Arrives"
                  required
                  error={field === "arrivalTime" ? (error ?? undefined) : undefined}
                >
                  <Input
                    id="arrivalTime"
                    name="arrivalTime"
                    type="datetime-local"
                    invalid={field === "arrivalTime"}
                  />
                </Field>
              </div>
            </>
          ) : (
            <>
              <Field
                id="locationAddress"
                label="Address"
                required
                error={field === "locationAddress" ? (error ?? undefined) : undefined}
              >
                <Input
                  id="locationAddress"
                  name="locationAddress"
                  placeholder="123 Via Roma, Rome, Italy"
                  invalid={field === "locationAddress"}
                />
              </Field>
              <Field id="reservedFor" label="Check-in">
                <Input id="reservedFor" name="reservedFor" type="datetime-local" />
              </Field>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field id="confirmationCode" label="Confirmation code">
              <Input id="confirmationCode" name="confirmationCode" />
            </Field>
            <Field
              id="costCents"
              label="Cost"
              error={field === "costCents" ? (error ?? undefined) : undefined}
            >
              <Input
                id="costCents"
                name="costCents"
                placeholder="0.00"
                invalid={field === "costCents"}
              />
            </Field>
          </div>

          {error && !field ? (
            <p className="text-sm text-alert" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={pending}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            Save {category === "FLIGHT" ? "flight" : "hotel"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
