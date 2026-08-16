"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getPrisma } from "@/lib/db";
import { isUuid } from "@/lib/ids";
import { toErrorBody } from "@/lib/errors";
import {
  reservationSchema,
  toReservationInput,
} from "@/lib/validation/reservation";

export type ReservationResult =
  | { ok: true }
  | { ok: false; message: string; field?: string };

export async function createReservationAction(
  tripId: string,
  input: unknown,
): Promise<ReservationResult> {
  try {
    const user = await requireUser();
    const prisma = getPrisma();
    if (!prisma) {
      return { ok: false, message: "Saving needs a database connection." };
    }
    if (!isUuid(tripId)) {
      return { ok: false, message: "That trip does not exist." };
    }

    // Scoped to the owner before writing anything, same reasoning as
    // deleteTrip — a wrong id should find nothing, not someone else's trip.
    const trip = await prisma.trip.findFirst({
      where: { id: tripId, userId: user.id },
      select: { id: true },
    });
    if (!trip) {
      return { ok: false, message: "That trip does not exist." };
    }

    const parsed = reservationSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return {
        ok: false,
        message: issue?.message ?? "Check the details and try again.",
        field: issue?.path[0]?.toString(),
      };
    }

    await prisma.reservation.create({
      data: toReservationInput(parsed.data, tripId),
    });

    revalidatePath(`/trips/${tripId}/reservations`);

    return { ok: true };
  } catch (error) {
    const { body } = toErrorBody(error, { action: "createReservationAction" });
    return { ok: false, message: body.error.message };
  }
}

export async function deleteReservationAction(
  tripId: string,
  reservationId: string,
): Promise<ReservationResult> {
  try {
    const user = await requireUser();
    const prisma = getPrisma();
    if (!prisma) {
      return { ok: false, message: "Deleting needs a database connection." };
    }
    if (!isUuid(tripId) || !isUuid(reservationId)) {
      return { ok: false, message: "That reservation does not exist." };
    }

    // Deleting through the trip relation, not the reservation id alone —
    // scoped to the owner the same way, without a second lookup.
    const result = await prisma.reservation.deleteMany({
      where: { id: reservationId, tripId, trip: { userId: user.id } },
    });
    if (result.count === 0) {
      return { ok: false, message: "That reservation does not exist." };
    }

    revalidatePath(`/trips/${tripId}/reservations`);

    return { ok: true };
  } catch (error) {
    const { body } = toErrorBody(error, { action: "deleteReservationAction" });
    return { ok: false, message: body.error.message };
  }
}
