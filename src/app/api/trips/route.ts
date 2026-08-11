import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { createTrip, ensureLocalUser, listTrips } from "@/lib/repositories/trips";
import { toTripPayload, tripFormSchema } from "@/lib/validation/trip";

/**
 * Trips collection.
 *
 * Both handlers follow the same shape: authenticate, validate, act, respond.
 * Anything thrown becomes a safe body plus a trace id via `toErrorBody`; no
 * stack trace or provider detail ever reaches the client.
 */

export async function GET() {
  try {
    const user = await requireUser();
    const { trips, source } = await listTrips(user.id);
    return NextResponse.json({ trips, source });
  } catch (error) {
    const { body, status } = toErrorBody(error, { route: "GET /api/trips" });
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    // The same schema the wizard uses. The client copy makes errors
    // immediate; this one is the copy that counts, because a request may not
    // have come from the form.
    const parsed = tripFormSchema.parse(await request.json());

    await ensureLocalUser(user);
    const { id } = await createTrip(user.id, toTripPayload(parsed));

    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorBody(error, { route: "POST /api/trips" });
    return NextResponse.json(body, { status });
  }
}
