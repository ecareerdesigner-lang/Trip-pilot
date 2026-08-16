import { z } from "zod";

/**
 * Manual reservations.
 *
 * The app never books anything for real — flights are search results,
 * hotels are still mock data (Duffel Stays needs a sales conversation
 * this project hasn't had). Reservations is the honest answer to that
 * gap: a place for what the traveler actually booked elsewhere, typed in
 * by hand, until a real booking flow exists.
 */

const money = z
  .string()
  .trim()
  .regex(/^\d{1,7}(\.\d{1,2})?$/, { message: "Enter a dollar amount." })
  .optional()
  .or(z.literal(""));

function toCents(value: string | undefined): number | undefined {
  if (!value) return undefined;
  return Math.round(Number.parseFloat(value) * 100);
}

export const flightReservationSchema = z.object({
  category: z.literal("FLIGHT"),
  title: z.string().trim().min(1, "Give this flight a name.").max(160),
  flightNumber: z.string().trim().max(20).optional().or(z.literal("")),
  departureAirport: z
    .string()
    .trim()
    .min(1, "Enter the departure airport.")
    .max(10),
  departureTime: z.string().min(1, "Enter a departure time."),
  arrivalAirport: z
    .string()
    .trim()
    .min(1, "Enter the arrival airport.")
    .max(10),
  arrivalTime: z.string().min(1, "Enter an arrival time."),
  confirmationCode: z.string().trim().max(40).optional().or(z.literal("")),
  costCents: money,
});

export const hotelReservationSchema = z.object({
  category: z.literal("HOTEL"),
  title: z.string().trim().min(1, "Give this hotel a name.").max(160),
  locationAddress: z
    .string()
    .trim()
    .min(1, "Enter the hotel's address.")
    .max(300),
  reservedFor: z.string().optional().or(z.literal("")),
  confirmationCode: z.string().trim().max(40).optional().or(z.literal("")),
  costCents: money,
});

export const reservationSchema = z.discriminatedUnion("category", [
  flightReservationSchema,
  hotelReservationSchema,
]);

export type ReservationFormValues =
  | z.infer<typeof flightReservationSchema>
  | z.infer<typeof hotelReservationSchema>;

/**
 * Shapes a validated form into the Prisma create input. A `datetime-local`
 * input gives a plain "2026-09-18T14:30" with no timezone — treated as the
 * trip's own local time here, not converted, since a traveler typing "my
 * flight leaves at 2:30" means the departure city's clock, not UTC.
 */
export function toReservationInput(values: ReservationFormValues, tripId: string) {
  if (values.category === "FLIGHT") {
    return {
      tripId,
      category: "FLIGHT" as const,
      title: values.title,
      flightNumber: values.flightNumber || null,
      departureAirport: values.departureAirport.toUpperCase(),
      departureTime: new Date(values.departureTime),
      arrivalAirport: values.arrivalAirport.toUpperCase(),
      arrivalTime: new Date(values.arrivalTime),
      confirmationCode: values.confirmationCode || null,
      costCents: toCents(values.costCents) ?? null,
      status: "CONFIRMED" as const,
    };
  }

  return {
    tripId,
    category: "HOTEL" as const,
    title: values.title,
    locationAddress: values.locationAddress,
    reservedFor: values.reservedFor ? new Date(values.reservedFor) : null,
    confirmationCode: values.confirmationCode || null,
    costCents: toCents(values.costCents) ?? null,
    status: "CONFIRMED" as const,
  };
}
