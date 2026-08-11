import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimited, notFound, toErrorBody } from "@/lib/errors";
import { aiRateLimiter } from "@/lib/rate-limit";
import { generateItinerary } from "@/lib/ai/trip-planner";
import { getPrisma } from "@/lib/db";
import { saveGeneratedItinerary } from "@/lib/repositories/trips";
import { databaseUnavailable } from "@/lib/errors";

/**
 * Build a trip's itinerary.
 *
 * Rate limited: this is the expensive route. Replaces any previously
 * generated itinerary while leaving items the traveler added themselves
 * alone.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;

  try {
    const user = await requireUser();

    const limit = await aiRateLimiter().check(`generate:${user.id}`);
    if (!limit.allowed) {
      throw rateLimited(
        `You have generated a lot of itineraries recently. Try again in ${Math.ceil(
          limit.retryAfterSeconds / 60,
        )} minutes.`,
      );
    }

    const prisma = getPrisma();
    if (!prisma) throw databaseUnavailable();

    const trip = await prisma.trip.findFirst({
      where: { id: tripId, userId: user.id },
      include: { preference: true, mustDos: true },
    });
    if (!trip) throw notFound("That trip does not exist.");

    const result = await generateItinerary({
      origin: trip.origin,
      destination: trip.destination,
      startDate: trip.startDate.toISOString().slice(0, 10),
      endDate: trip.endDate.toISOString().slice(0, 10),
      travelers: trip.travelers,
      pace: trip.preference?.pace ?? "BALANCED",
      foodPreference: trip.preference?.foodPreference ?? "NO_PREFERENCE",
      transportPreferences: trip.preference?.transportPreferences ?? [],
      mustDos: trip.mustDos.map((mustDo: { title: string; description: string | null }) => ({
        title: mustDo.title,
        description: mustDo.description ?? "",
      })),
      notes: trip.notes ?? "",
      totalBudgetCents: trip.totalBudgetCents,
      lodgingBudgetCents: trip.lodgingBudgetCents,
      ...(trip.preference
        ? {
            dayStartMinute: trip.preference.dayStartMinute,
            dayEndMinute: trip.preference.dayEndMinute,
          }
        : {}),
    });

    const saved = await saveGeneratedItinerary(user.id, tripId, result.plan);

    return NextResponse.json({
      ...saved,
      plannedBy: result.plannedBy,
      destinationUncovered: result.destinationUncovered,
      warnings: result.warnings,
      summary: result.plan.summary,
      estimatedTotalCents: result.plan.totalEstimatedCents,
    });
  } catch (error) {
    const { body, status } = toErrorBody(error, {
      route: "POST /api/trips/[tripId]/generate",
      tripId,
    });
    return NextResponse.json(body, { status });
  }
}
