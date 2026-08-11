import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { notFound, toErrorBody, databaseUnavailable } from "@/lib/errors";
import { getPrisma } from "@/lib/db";
import { getItinerary, applyOptimization } from "@/lib/repositories/trips";
import { optimizeItinerary } from "@/lib/travel/optimize-itinerary";

/**
 * Re-time and reorder an existing itinerary.
 *
 * Invents nothing: it only moves what is already scheduled. The response
 * carries the list of changes so the UI can say what moved rather than
 * silently rewriting the traveler's day.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;

  try {
    const user = await requireUser();
    const prisma = getPrisma();
    if (!prisma) throw databaseUnavailable();

    const trip = await prisma.trip.findFirst({
      where: { id: tripId, userId: user.id },
      include: { preference: true },
    });
    if (!trip) throw notFound("That trip does not exist.");

    const itinerary = await getItinerary(user.id, tripId);
    if (!itinerary || itinerary.days.length === 0) {
      throw notFound("This trip has no itinerary to optimize yet.");
    }

    const result = optimizeItinerary(itinerary.days, {
      destination: trip.destination,
      travelers: trip.travelers,
      pace: trip.preference?.pace ?? "BALANCED",
      transportPreferences: trip.preference?.transportPreferences ?? [],
      dayStartMinute: trip.preference?.dayStartMinute ?? 8 * 60,
      dayEndMinute: trip.preference?.dayEndMinute ?? 22 * 60,
    });

    await applyOptimization(user.id, tripId, result);

    return NextResponse.json({
      changeCount: result.changes.length,
      travelMinutesSaved: result.travelMinutesSaved,
      changes: result.changes,
    });
  } catch (error) {
    const { body, status } = toErrorBody(error, {
      route: "POST /api/trips/[tripId]/optimize",
      tripId,
    });
    return NextResponse.json(body, { status });
  }
}
