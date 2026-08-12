"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { createTrip } from "@/lib/repositories/trips";
import { toTripPayload, tripFormSchema } from "@/lib/validation/trip";

/**
 * Save a trip from the wizard.
 *
 * Returns a result rather than throwing, so the wizard can show the failure
 * in place instead of replacing the filled-in form with an error page. The
 * trace id in the message matches a line in the server log.
 */
export type CreateTripResult =
  | { ok: true; tripId: string }
  | { ok: false; message: string; traceId: string };

export async function createTripAction(
  input: unknown,
): Promise<CreateTripResult> {
  try {
    const user = await requireUser();
    const parsed = tripFormSchema.parse(input);

    const { id } = await createTrip(user.id, toTripPayload(parsed));

    revalidatePath("/dashboard");
    revalidatePath("/trips");

    return { ok: true, tripId: id };
  } catch (error) {
    const { body } = toErrorBody(error, { action: "createTripAction" });
    return {
      ok: false,
      message: body.error.message,
      traceId: body.error.traceId,
    };
  }
}
