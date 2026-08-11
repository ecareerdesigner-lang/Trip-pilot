import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { notFound, toErrorBody } from "@/lib/errors";
import { deleteTrip, getTripSummary } from "@/lib/repositories/trips";

/**
 * A single trip.
 *
 * Every read and write is scoped to the signed-in user in the query itself,
 * so another user's trip id returns "not found" rather than confirming that
 * it exists.
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;
  try {
    const user = await requireUser();
    const trip = await getTripSummary(user.id, tripId);
    if (!trip) throw notFound("That trip does not exist.");
    return NextResponse.json({ trip });
  } catch (error) {
    const { body, status } = toErrorBody(error, {
      route: "GET /api/trips/[tripId]",
      tripId,
    });
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;
  try {
    const user = await requireUser();
    await deleteTrip(user.id, tripId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const { body, status } = toErrorBody(error, {
      route: "DELETE /api/trips/[tripId]",
      tripId,
    });
    return NextResponse.json(body, { status });
  }
}
