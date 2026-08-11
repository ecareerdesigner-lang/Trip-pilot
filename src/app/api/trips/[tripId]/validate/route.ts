import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { notFound, toErrorBody } from "@/lib/errors";
import { validateTrip } from "@/lib/repositories/trips";

/**
 * Reality-check a trip.
 *
 * Read-only and cheap: no model call, no provider call, no writes. Safe to
 * call after every edit, which is the point — a conflict is worth knowing
 * about the moment it is created rather than at the theatre door.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;
  try {
    const user = await requireUser();
    const report = await validateTrip(user.id, tripId);
    if (!report) throw notFound("That trip does not exist.");
    return NextResponse.json(report);
  } catch (error) {
    const { body, status } = toErrorBody(error, {
      route: "POST /api/trips/[tripId]/validate",
      tripId,
    });
    return NextResponse.json(body, { status });
  }
}
